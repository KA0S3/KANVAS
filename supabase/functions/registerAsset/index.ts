import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getPlanConfig, migrateLegacyPlanId } from "../shared/plans.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AssetRegistrationRequest {
  project_id: string
  original_filename: string
  file_size: number
  mime_type: string
  cloud_path: string
  variants: Array<{
    type: string
    path: string
    size: number
  }>
}

interface User {
  id: string
  plan_type: string
  storage_quota_mb: number
}

interface StorageUsage {
  total_bytes_used: bigint
  pending_bytes: bigint
  asset_count: number
}

interface License {
  license_type: string
  status: string
  features: any
  extra_quota_bytes?: bigint
}

interface EffectiveLimits {
  quotaBytes: bigint
  canExport: boolean
  canImport: boolean
  maxAssetSize: number
}


function calculateEffectiveLimits(userInfo: User, license: License | null): EffectiveLimits {
  // Migrate legacy plan names if needed
  const planId = migrateLegacyPlanId(userInfo.plan_type);
  const planConfig = getPlanConfig(planId);
  
  if (!planConfig) {
    console.error(`[registerAsset] Unknown plan: ${planId}, falling back to free`);
    const freeConfig = getPlanConfig('free')!;
    return {
      quotaBytes: BigInt(freeConfig.quotaBytes),
      canExport: freeConfig.importExportEnabled,
      canImport: freeConfig.importExportEnabled,
      maxAssetSize: freeConfig.maxAssetSize
    };
  }
  
  // Start with base plan quota
  const baseQuotaBytes = BigInt(planConfig.quotaBytes);
  
  // Add extra quota from license if available
  const extraQuotaBytes = license?.extra_quota_bytes || BigInt(0);
  const totalQuotaBytes = baseQuotaBytes + extraQuotaBytes;
  
  // Determine feature permissions
  const canExport = planConfig.importExportEnabled || (license?.features && (license.features as any).can_export);
  const canImport = planConfig.importExportEnabled || (license?.features && (license.features as any).can_import);
  const maxAssetSize = planConfig.maxAssetSize;
  
  return {
    quotaBytes: totalQuotaBytes,
    canExport,
    canImport,
    maxAssetSize
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: AssetRegistrationRequest = await req.json()
    const { project_id, original_filename, file_size, mime_type, cloud_path, variants } = body

    if (!project_id || !original_filename || !file_size || !mime_type || !cloud_path || !variants) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body - missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user owns the project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single()

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: 'Project not found or access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, plan_type, storage_quota_mb')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userInfo: User = userData

    // Get current storage usage
    const { data: storageData, error: storageError } = await supabase
      .from('storage_usage')
      .select('total_bytes_used, asset_count')
      .eq('user_id', user.id)
      .single()

    if (storageError && storageError.code !== 'PGRST116') {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch storage usage' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const currentUsage: StorageUsage = storageData || {
      total_bytes_used: BigInt(0),
      asset_count: 0
    }

    // Get active license with extra quota
    const { data: licenseData, error: licenseError } = await supabase
      .from('licenses')
      .select('license_type, status, features')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .or('expires_at.is.null,expires_at.gt.now()')
      .single()

    let license: License | null = null
    if (!licenseError && licenseData) {
      license = licenseData
      // Extract extra_quota_bytes from features if present
      if (license.features && typeof license.features === 'object') {
        const features = license.features as any
        license.extra_quota_bytes = features.extra_quota_bytes ? BigInt(features.extra_quota_bytes) : BigInt(0)
      } else {
        license.extra_quota_bytes = BigInt(0)
      }
    }

    // Calculate effective limits using new plan mapping
    const effectiveLimits = calculateEffectiveLimits(userInfo, license)

    // Calculate total asset size (including all variants)
    const totalAssetSize = variants.reduce((sum, variant) => sum + variant.size, 0)

    // Check if asset size exceeds maximum per-asset limit
    if (totalAssetSize > effectiveLimits.maxAssetSize) {
      return new Response(
        JSON.stringify({ 
          error: 'Asset size exceeds maximum limit',
          details: {
            asset_size: totalAssetSize,
            max_allowed: effectiveLimits.maxAssetSize,
            plan_type: userInfo.plan_type
          }
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if total storage would exceed quota (including pending uploads)
    const effectiveUsage = currentUsage.total_bytes_used + currentUsage.pending_bytes
    const newTotalUsage = effectiveUsage + BigInt(totalAssetSize)
    if (newTotalUsage > effectiveLimits.quotaBytes) {
      return new Response(
        JSON.stringify({ 
          error: 'Storage quota exceeded',
          details: {
            current_used: Number(currentUsage.total_bytes_used),
            pending_uploads: Number(currentUsage.pending_bytes),
            effective_usage: Number(effectiveUsage),
            asset_size: totalAssetSize,
            quota_allowed: Number(effectiveLimits.quotaBytes),
            plan_type: userInfo.plan_type,
            effective_limits: effectiveLimits
          }
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Register the asset metadata
    const { data: assetData, error: assetError } = await supabase
      .from('assets')
      .insert({
        project_id,
        user_id: user.id,
        original_filename,
        file_size,
        mime_type,
        cloud_path,
        variants,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (assetError) {
      console.error('Failed to register asset:', assetError)
      
      // Rollback pending bytes on asset registration failure
      try {
        await supabase.rpc('rollback_pending_bytes', {
          p_user_id: user.id,
          p_bytes: totalAssetSize
        })
      } catch (rollbackError) {
        console.error('Failed to rollback pending bytes:', rollbackError)
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to register asset', details: assetError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Atomically commit the pending bytes to total used
    try {
      const { error: commitError } = await supabase.rpc('commit_pending_bytes', {
        p_user_id: user.id,
        p_bytes: totalAssetSize
      })

      if (commitError) {
        console.error('Failed to commit pending bytes:', commitError)
        // Don't fail the request since asset is registered, but log for manual reconciliation
      }
    } catch (commitError) {
      console.error('Error committing pending bytes:', commitError)
      // Don't fail the request since asset is registered, but log for manual reconciliation
    }

    // Update asset count (separate from bytes to avoid race conditions)
    try {
      if (storageData) {
        await supabase
          .from('storage_usage')
          .update({
            asset_count: currentUsage.asset_count + 1,
            last_calculated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
      } else {
        await supabase
          .from('storage_usage')
          .insert({
            user_id: user.id,
            total_bytes_used: totalAssetSize,
            pending_bytes: 0, // Should be 0 after commit
            asset_count: 1,
            last_calculated_at: new Date().toISOString()
          })
      }
    } catch (countError) {
      console.error('Failed to update asset count:', countError)
      // Don't fail the request, but log for manual reconciliation
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        asset: assetData,
        storage_usage: {
          total_bytes_used: Number(currentUsage.total_bytes_used + BigInt(totalAssetSize)),
          asset_count: currentUsage.asset_count + 1,
          quota_allowed: Number(effectiveLimits.quotaBytes)
        }
      }),
      { 
        status: 201, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in registerAsset:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
