import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getPlanConfig, migrateLegacyPlanId } from "../shared/plans.ts"
import { authenticateAndTranslatePlan, logMigrationSummary } from "../shared/authMiddleware.ts"
import { permissionService } from "../shared/permissionService.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExportRequest {
  project_id: string
  include_assets: boolean
  bulk_export?: boolean
}

interface User {
  id: string
  plan_type: string
  storage_quota_mb: number
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


function calculateEffectiveLimits(userInfo: any, license: License | null): EffectiveLimits {
  // Use the new auth middleware's translation
  const { canonical_plan_id, effective_limits } = userInfo;
  
  // Get plan config to ensure maxAssetSize is consistent
  const planConfig = getPlanConfig(canonical_plan_id) || getPlanConfig('free')!;
  
  return {
    quotaBytes: BigInt(effective_limits.quotaBytes),
    canExport: effective_limits.importExportEnabled,
    canImport: effective_limits.importExportEnabled,
    maxAssetSize: planConfig.maxAssetSize
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
    const body: ExportRequest = await req.json()
    const { project_id, include_assets, bulk_export = false } = body

    if (!project_id) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body - project_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Authenticate user and translate legacy plan
    const userInfo = await authenticateAndTranslatePlan(
      supabase, 
      req.headers.get('Authorization'),
      'exportProject'
    );

    if (!userInfo) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get active license with features
    const { data: licenseData, error: licenseError } = await supabase
      .from('licenses')
      .select('license_type, status, features')
      .eq('user_id', userInfo.id)
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

    // Check export permissions using centralized permission service
    const action = bulk_export ? 'bulk_export' : 'export_zip';
    const permission = await permissionService.canUserPerform(
      supabase,
      req.headers.get('Authorization'),
      action,
      { userId: userInfo.id }
    );

    if (!permission.allowed) {
      return new Response(
        JSON.stringify({ 
          error: permission.reason || 'Export not available',
          details: permission.details
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user owns the project(s)
    if (bulk_export) {
      // For bulk export, get all user projects
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', userInfo.id)

      if (projectsError || !projects || projects.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No projects found for bulk export' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Generate bulk export data
      const exportData = {
        projects: projects,
        exported_at: new Date().toISOString(),
        user_id: user.id,
        plan_type: userInfo.plan_type,
        export_type: 'bulk',
        include_assets
      }

      // In a real implementation, you would:
      // 1. Fetch all project data
      // 2. Fetch all associated assets if include_assets is true
      // 3. Create a ZIP file with all data
      // 4. Return a signed URL to download the ZIP

      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Bulk export initiated',
          details: {
            project_count: projects.length,
            include_assets,
            export_type: 'bulk',
            plan_type: userInfo.plan_type
          }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )

    } else {
      // Single project export
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', project_id)
        .eq('user_id', userInfo.id)
        .single()

      if (projectError || !project) {
        return new Response(
          JSON.stringify({ error: 'Project not found or access denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get project assets if requested
      let assets = []
      if (include_assets) {
        const { data: projectAssets, error: assetsError } = await supabase
          .from('assets')
          .select('id, original_filename, file_size, mime_type, cloud_path, variants')
          .eq('project_id', project_id)
          .eq('user_id', userInfo.id)

        if (!assetsError && projectAssets) {
          assets = projectAssets
        }
      }

      // Generate export data
      const exportData = {
        project: project,
        assets: assets,
        exported_at: new Date().toISOString(),
        user_id: user.id,
        plan_type: userInfo.plan_type,
        export_type: 'single',
        include_assets
      }

      // In a real implementation, you would:
      // 1. Fetch all project data (books, characters, etc.)
      // 2. Fetch assets if include_assets is true
      // 3. Create a ZIP file with project.json and assets folder
      // 4. Return a signed URL to download the ZIP

      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Export initiated',
          details: {
            project: project,
            asset_count: assets.length,
            include_assets,
            export_type: 'single',
            plan_type: userInfo.plan_type
          }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Log migration summary periodically (every 10 requests)
    if (Math.random() < 0.1) {
      logMigrationSummary();
    }

  } catch (error) {
    console.error('Error in exportProject:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
