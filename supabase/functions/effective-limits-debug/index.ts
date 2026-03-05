import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Canonical plans configuration - matches server-side compute-effective-limits
interface PlanConfig {
  id: string;
  label: string;
  quotaBytes: number;
  maxBooks: number;
  adsEnabled: boolean;
  importExportEnabled: boolean;
}

const PLANS_CONFIG: Record<string, PlanConfig> = {
  guest: {
    id: 'guest',
    label: 'Guest Session',
    quotaBytes: 0,
    maxBooks: 1,
    adsEnabled: true,
    importExportEnabled: false,
  },
  
  free: {
    id: 'free',
    label: 'Free',
    quotaBytes: 100 * 1024 * 1024,
    maxBooks: 2,
    adsEnabled: true,
    importExportEnabled: false,
  },
  
  pro: {
    id: 'pro',
    label: 'Pro',
    quotaBytes: 10 * 1024 * 1024 * 1024,
    maxBooks: -1,
    adsEnabled: false,
    importExportEnabled: true,
  },
  
  lifetime: {
    id: 'lifetime',
    label: 'Lifetime',
    quotaBytes: 15 * 1024 * 1024 * 1024,
    maxBooks: -1,
    adsEnabled: false,
    importExportEnabled: true,
  }
};

interface DebugStep {
  step: string;
  timestamp: string;
  input: any;
  output: any;
  source?: string;
  reason?: string;
}

interface DebugChain {
  userId: string;
  steps: DebugStep[];
  finalLimits: any;
  summary: {
    basePlan: string;
    hasLicenseOverride: boolean;
    hasOwnerKeyOverride: boolean;
    lastModified: string;
    resolutionTime: number;
  };
}

function getPlanConfig(planId: string): PlanConfig | null {
  return PLANS_CONFIG[planId] || null;
}

function migrateLegacyPlanId(legacyPlanId: string): string {
  const legacyMapping: Record<string, string> = {
    'basic': 'free',
    'premium': 'pro', 
    'enterprise': 'lifetime'
  };
  return legacyMapping[legacyPlanId] || legacyPlanId;
}

async function isOwnerOrAdmin(supabase: any, userId: string): Promise<boolean> {
  try {
    // Check if user has active owner key
    const { data: ownerKeys, error: ownerError } = await supabase
      .from('owner_keys')
      .select('id')
      .eq('user_id', userId)
      .eq('is_revoked', false)
      .gt('expires_at', new Date().toISOString())
      .limit(1);

    if (!ownerError && ownerKeys && ownerKeys.length > 0) {
      return true;
    }

    // Check if user has admin license
    const { data: licenses, error: licenseError } = await supabase
      .from('licenses')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('license_type', 'admin')
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .limit(1);

    if (!licenseError && licenses && licenses.length > 0) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('[isOwnerOrAdmin] Error checking permissions:', error);
    return false;
  }
}

async function computeEffectiveLimitsDebug(userId: string, supabase: any): Promise<DebugChain> {
  const startTime = Date.now();
  const steps: DebugStep[] = [];
  
  // Helper to add steps
  const addStep = (step: string, input: any, output: any, source?: string, reason?: string) => {
    steps.push({
      step,
      timestamp: new Date().toISOString(),
      input,
      output,
      source,
      reason
    });
  };

  // 1. Get base plan from users table
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('plan_type, updated_at')
    .eq('id', userId)
    .single();

  let basePlanId = 'free';
  let lastModified = userData?.updated_at || new Date().toISOString();
  
  if (!userError && userData?.plan_type) {
    basePlanId = migrateLegacyPlanId(userData.plan_type);
  }
  
  addStep(
    'base_plan',
    { userId, plan_type: userData?.plan_type },
    { plan: basePlanId, lastModified },
    'users table',
    userError ? 'Error fetching user plan, using free fallback' : 'Base plan resolved'
  );
  
  const basePlan = getPlanConfig(basePlanId);
  if (!basePlan) {
    basePlanId = 'free';
  }
  const finalBasePlan = getPlanConfig(basePlanId)!;
  
  // Start with base plan limits
  const currentLimits: any = {
    quotaBytes: finalBasePlan.quotaBytes,
    maxBooks: finalBasePlan.maxBooks,
    adsEnabled: finalBasePlan.adsEnabled,
    importExportEnabled: finalBasePlan.importExportEnabled,
    source: {
      plan: basePlanId
    }
  };

  addStep(
    'base_limits',
    { plan: basePlanId },
    { limits: currentLimits },
    'canonical plans config',
    'Applied base plan configuration'
  );

  let hasLicenseOverride = false;
  let hasOwnerKeyOverride = false;

  // 2. Apply license overrides (highest precedence)
  const { data: licenseData, error: licenseError } = await supabase
    .from('licenses')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!licenseError && licenseData) {
    hasLicenseOverride = true;
    
    addStep(
      'license_check',
      { userId },
      { 
        licenseId: licenseData.id,
        licenseType: licenseData.license_type,
        features: licenseData.features,
        expiresAt: licenseData.expires_at
      },
      'licenses table',
      'Found active license'
    );
    
    if (licenseData.features) {
      const features = licenseData.features;
      const beforeLimits = { ...currentLimits };
      
      // Add extra quota bytes if specified
      if (features.extra_quota_bytes) {
        currentLimits.quotaBytes += features.extra_quota_bytes;
      }
      
      // Override other features if specified
      if (features.max_books !== undefined) {
        currentLimits.maxBooks = features.max_books;
      }
      if (features.ads !== undefined) {
        currentLimits.adsEnabled = features.ads;
      }
      if (features.import_export !== undefined) {
        currentLimits.importExportEnabled = features.import_export;
      }
      
      // Add expiration if license has one
      if (licenseData.expires_at) {
        currentLimits.expiresAt = licenseData.expires_at;
        if (licenseData.expires_at > lastModified) {
          lastModified = licenseData.expires_at;
        }
      }
      
      currentLimits.source.licenseId = licenseData.id;
      
      addStep(
        'license_override',
        { features: licenseData.features },
        { 
          before: beforeLimits,
          after: currentLimits,
          changes: Object.keys(features).filter(key => beforeLimits[key as keyof typeof beforeLimits] !== currentLimits[key as keyof typeof currentLimits])
        },
        'license features',
        'Applied license feature overrides'
      );
    }
  } else {
    addStep(
      'license_check',
      { userId },
      { result: 'no_active_license', error: licenseError?.message },
      'licenses table',
      licenseError ? 'Error checking licenses' : 'No active license found'
    );
  }

  // 3. Apply owner key overrides (medium precedence)
  const { data: ownerKeyData, error: ownerKeyError } = await supabase
    .from('owner_keys')
    .select('*')
    .eq('user_id', userId)
    .eq('is_revoked', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!ownerKeyError && ownerKeyData && ownerKeyData.scopes) {
    hasOwnerKeyOverride = true;
    
    addStep(
      'owner_key_check',
      { userId },
      { 
        ownerKeyId: ownerKeyData.id,
        keyName: ownerKeyData.key_name,
        scopes: ownerKeyData.scopes,
        expiresAt: ownerKeyData.expires_at
      },
      'owner_keys table',
      'Found active owner key'
    );
    
    const scopes = ownerKeyData.scopes;
    const beforeLimits = { ...currentLimits };
    const appliedChanges: string[] = [];
    
    // Apply owner key scopes (only if not already overridden by license)
    if (!licenseData || !licenseData.features?.extra_quota_bytes) {
      if (scopes.max_storage_bytes) {
        currentLimits.quotaBytes = scopes.max_storage_bytes;
        appliedChanges.push('quotaBytes');
      }
    }
    
    if (!licenseData || licenseData.features?.max_books === undefined) {
      if (scopes.max_books !== undefined) {
        currentLimits.maxBooks = scopes.max_books;
        appliedChanges.push('maxBooks');
      }
    }
    
    if (!licenseData || licenseData.features?.ads === undefined) {
      if (scopes.ads !== undefined) {
        currentLimits.adsEnabled = scopes.ads;
        appliedChanges.push('adsEnabled');
      }
    }
    
    if (!licenseData || licenseData.features?.import_export === undefined) {
      if (scopes.import_export !== undefined) {
        currentLimits.importExportEnabled = scopes.import_export;
        appliedChanges.push('importExportEnabled');
      }
    }
    
    currentLimits.source.ownerKeyId = ownerKeyData.id;
    
    if (ownerKeyData.expires_at && ownerKeyData.expires_at > lastModified) {
      lastModified = ownerKeyData.expires_at;
    }
    
    addStep(
      'owner_key_override',
      { scopes: ownerKeyData.scopes },
      { 
        before: beforeLimits,
        after: currentLimits,
        changes: appliedChanges,
        precedence: 'medium (after license, before base plan)'
      },
      'owner key scopes',
      appliedChanges.length > 0 ? `Applied owner key overrides: ${appliedChanges.join(', ')}` : 'No new overrides applied (license takes precedence)'
    );
  } else {
    addStep(
      'owner_key_check',
      { userId },
      { result: 'no_active_owner_key', error: ownerKeyError?.message },
      'owner_keys table',
      ownerKeyError ? 'Error checking owner keys' : 'No active owner key found'
    );
  }

  const endTime = Date.now();
  
  return {
    userId,
    steps,
    finalLimits: currentLimits,
    summary: {
      basePlan: basePlanId,
      hasLicenseOverride,
      hasOwnerKeyOverride,
      lastModified,
      resolutionTime: endTime - startTime
    }
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if user is owner or admin
    const isAuthorized = await isOwnerOrAdmin(supabase, user.id);
    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ 
          error: 'Access denied. This endpoint is only available to owners and administrators.',
          userId: user.id.substring(0, 8) + '...' // Minimal PII for debugging
        }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get debug information
    const debugInfo = await computeEffectiveLimitsDebug(user.id, supabase);

    return new Response(
      JSON.stringify(debugInfo, null, 2),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Effective limits debug error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
