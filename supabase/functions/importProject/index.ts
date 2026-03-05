import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getPlanConfig, migrateLegacyPlanId } from "../shared/plans.ts"
import { permissionService } from "../shared/permissionService.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ImportRequest {
  project_data: any
  import_as_new?: boolean
  target_project_id?: string
  include_assets?: boolean
}

interface User {
  id: string
  plan_type: string
  storage_quota_mb: number
}

interface StorageUsage {
  total_bytes_used: bigint
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
    console.error(`[importProject] Unknown plan: ${planId}, falling back to free`);
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
    const body: ImportRequest = await req.json()
    const { project_data, import_as_new = false, target_project_id, include_assets = false } = body

    if (!project_data) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body - project_data required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Get active license with features
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

    // Check import permissions using centralized permission service
    const permission = await permissionService.canUserPerform(
      supabase,
      req.headers.get('Authorization'),
      'import_zip',
      { userId: user.id }
    );

    if (!permission.allowed) {
      return new Response(
        JSON.stringify({ 
          error: permission.reason || 'Import not available',
          details: permission.details
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calculate effective limits for storage quota checks
    const effectiveLimits = calculateEffectiveLimits(userInfo, license)

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

    let targetProjectId = target_project_id
    let project

    if (import_as_new) {
      // Create new project for import
      const projectName = project_data.project?.name || `Imported Project - ${new Date().toLocaleDateString()}`
      
      const { data: newProject, error: createError } = await supabase
        .from('projects')
        .insert({
          user_id: user.id,
          name: projectName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (createError || !newProject) {
        return new Response(
          JSON.stringify({ error: 'Failed to create new project for import', details: createError?.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      project = newProject
      targetProjectId = newProject.id
    } else {
      // Use existing project
      if (!target_project_id) {
        return new Response(
          JSON.stringify({ error: 'target_project_id required when not importing as new' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify user owns the target project
      const { data: existingProject, error: projectError } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', target_project_id)
        .eq('user_id', user.id)
        .single()

      if (projectError || !existingProject) {
        return new Response(
          JSON.stringify({ error: 'Target project not found or access denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      project = existingProject
    }

    // Calculate import size if assets are included
    let totalImportSize = 0
    if (include_assets && project_data.assets) {
      totalImportSize = project_data.assets.reduce((sum: number, asset: any) => {
        const assetSize = asset.file_size || 0
        const variantsSize = asset.variants?.reduce((vSum: number, variant: any) => vSum + (variant.size || 0), 0) || 0
        return sum + assetSize + variantsSize
      }, 0)
    }

    // Check if import would exceed storage quota
    if (totalImportSize > 0) {
      const newTotalUsage = currentUsage.total_bytes_used + BigInt(totalImportSize)
      if (newTotalUsage > effectiveLimits.quotaBytes) {
        return new Response(
          JSON.stringify({ 
            error: 'Import would exceed storage quota',
            details: {
              current_used: Number(currentUsage.total_bytes_used),
              import_size: totalImportSize,
              quota_allowed: Number(effectiveLimits.quotaBytes),
              plan_type: userInfo.plan_type,
              message: 'Please upgrade your plan or exclude assets from import'
            }
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Check individual asset size limits
    if (include_assets && project_data.assets) {
      for (const asset of project_data.assets) {
        const assetSize = asset.file_size || 0
        if (assetSize > effectiveLimits.maxAssetSize) {
          return new Response(
            JSON.stringify({ 
              error: 'Asset size exceeds maximum limit',
              details: {
                asset_filename: asset.original_filename,
                asset_size: assetSize,
                max_allowed: effectiveLimits.maxAssetSize,
                plan_type: userInfo.plan_type
              }
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    // Process import
    const importResult = {
      success: true,
      project: project,
      imported_at: new Date().toISOString(),
      import_type: import_as_new ? 'new_project' : 'existing_project',
      include_assets,
      assets_imported: include_assets ? (project_data.assets?.length || 0) : 0,
      total_import_size: totalImportSize,
      plan_type: userInfo.plan_type,
      effective_limits: effectiveLimits
    }

    // In a real implementation, you would:
    // 1. Import all project data (books, characters, etc.) to the target project
    // 2. If include_assets is true, upload assets to cloud storage and register them
    // 3. Update storage usage if assets were imported
    // 4. Handle any conflicts or duplicates appropriately

    return new Response(
      JSON.stringify(importResult),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in importProject:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
