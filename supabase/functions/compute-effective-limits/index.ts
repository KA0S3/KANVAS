import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Canonical plans configuration - matches client-side plans.ts
interface PlanConfig {
  id: string;
  label: string;
  description: string;
  quotaBytes: number;
  maxBooks: number;
  adsEnabled: boolean;
  importExportEnabled: boolean;
  maxAssetSize: number;
  features: Record<string, any>;
}

const PLANS_CONFIG: Record<string, PlanConfig> = {
  guest: {
    id: 'guest',
    label: 'Guest Session',
    description: 'Local-only session, not signed in',
    quotaBytes: 0,
    maxBooks: 1,
    adsEnabled: true,
    importExportEnabled: false,
    maxAssetSize: 10 * 1024 * 1024,
    features: {
      cloudSync: false,
      collaboration: false,
      advancedFeatures: false
    }
  },
  
  free: {
    id: 'free',
    label: 'Free',
    description: 'Free tier with basic features',
    quotaBytes: 100 * 1024 * 1024,
    maxBooks: 1,
    adsEnabled: true,
    importExportEnabled: false,
    maxAssetSize: 50 * 1024 * 1024,
    features: {
      cloudSync: true,
      collaboration: false,
      advancedFeatures: false
    }
  },
  
  pro: {
    id: 'pro',
    label: 'Pro',
    description: 'Professional subscription with premium features',
    quotaBytes: 10 * 1024 * 1024 * 1024,
    maxBooks: -1,
    adsEnabled: false,
    importExportEnabled: true,
    maxAssetSize: 500 * 1024 * 1024,
    features: {
      cloudSync: true,
      collaboration: true,
      advancedFeatures: true,
      prioritySupport: true
    }
  },
  
  lifetime: {
    id: 'lifetime',
    label: 'Lifetime',
    description: 'One-time purchase for lifetime access',
    quotaBytes: 15 * 1024 * 1024 * 1024,
    maxBooks: -1,
    adsEnabled: false,
    importExportEnabled: true,
    maxAssetSize: 500 * 1024 * 1024,
    features: {
      cloudSync: true,
      collaboration: true,
      advancedFeatures: true,
      prioritySupport: true,
      lifetimeAccess: true
    }
  },
  
  owner: {
    id: 'owner',
    label: 'Owner',
    description: 'Unrestricted owner access with full control',
    quotaBytes: -1, // Unlimited storage
    maxBooks: -1, // Unlimited books
    adsEnabled: false,
    importExportEnabled: true,
    maxAssetSize: -1, // Unlimited file size
    features: {
      cloudSync: true,
      collaboration: true,
      advancedFeatures: true,
      prioritySupport: true,
      adminAccess: true,
      unrestricted: true,
      ownerDashboard: true
    }
  }
};

interface EffectiveLimits {
  quotaBytes: number;
  maxBooks: number;
  adsEnabled: boolean;
  importExportEnabled: boolean;
  expiresAt?: string;
  source: {
    plan: string;
    licenseId?: string;
    ownerKeyId?: string;
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

async function computeEffectiveLimits(userId: string, supabase: any): Promise<EffectiveLimits> {
  console.log(`[computeEffectiveLimits] Computing limits for user: ${userId}`);
  
  // 1. Get base plan from users table
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('plan_type')
    .eq('id', userId)
    .single();

  let basePlanId = 'free'; // Default fallback
  if (!userError && userData?.plan_type) {
    basePlanId = migrateLegacyPlanId(userData.plan_type);
  }
  
  const planConfig = getPlanConfig(basePlanId);
  if (!planConfig) {
    console.warn(`[computeEffectiveLimits] Unknown plan: ${basePlanId}, using free plan`);
    basePlanId = 'free';
  }
  
  const basePlan = getPlanConfig(basePlanId)!;
  
  // Start with base plan limits
  const effectiveLimits: EffectiveLimits = {
    quotaBytes: basePlan.quotaBytes,
    maxBooks: basePlan.maxBooks,
    adsEnabled: basePlan.adsEnabled,
    importExportEnabled: basePlan.importExportEnabled,
    source: {
      plan: basePlanId
    }
  };

  // 2. Apply license overrides (medium precedence)
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
    console.log(`[computeEffectiveLimits] Applying license override: ${licenseData.id}`);
    
    // Apply license features
    if (licenseData.features) {
      const features = licenseData.features;
      
      // Add extra quota bytes if specified
      if (features.extra_quota_bytes) {
        effectiveLimits.quotaBytes += features.extra_quota_bytes;
      }
      
      // Override other features if specified
      if (features.max_books !== undefined) {
        effectiveLimits.maxBooks = features.max_books;
      }
      if (features.ads !== undefined) {
        effectiveLimits.adsEnabled = features.ads;
      }
      if (features.import_export !== undefined) {
        effectiveLimits.importExportEnabled = features.import_export;
      }
      
      // Add expiration if license has one
      if (licenseData.expires_at) {
        effectiveLimits.expiresAt = licenseData.expires_at;
      }
      
      effectiveLimits.source.licenseId = licenseData.id;
    }
  }

  // 3. Apply owner key overrides (highest precedence - wins over licenses)
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
    console.log(`[computeEffectiveLimits] Applying owner key override: ${ownerKeyData.id}, scopes:`, ownerKeyData.scopes);
    
    const scopes = ownerKeyData.scopes;
    
    // Apply owner key scopes (overrides both base plan and license)
    if (scopes.max_storage_bytes !== undefined) {
      effectiveLimits.quotaBytes = scopes.max_storage_bytes;
      console.log(`[computeEffectiveLimits] Owner key override: max_storage_bytes = ${scopes.max_storage_bytes}`);
    }
    
    if (scopes.max_books !== undefined) {
      effectiveLimits.maxBooks = scopes.max_books;
      console.log(`[computeEffectiveLimits] Owner key override: max_books = ${scopes.max_books}`);
    }
    
    if (scopes.ads !== undefined) {
      effectiveLimits.adsEnabled = scopes.ads;
      console.log(`[computeEffectiveLimits] Owner key override: ads = ${scopes.ads}`);
    }
    
    if (scopes.import_export !== undefined) {
      effectiveLimits.importExportEnabled = scopes.import_export;
      console.log(`[computeEffectiveLimits] Owner key override: import_export = ${scopes.import_export}`);
    }
    
    effectiveLimits.source.ownerKeyId = ownerKeyData.id;
  } else if (!ownerKeyError) {
    console.log(`[computeEffectiveLimits] No active owner key found for user: ${userId}`);
  } else {
    console.log(`[computeEffectiveLimits] Error fetching owner key:`, ownerKeyError);
  }

  console.log(`[computeEffectiveLimits] Final effective limits for ${userId}:`, effectiveLimits);
  return effectiveLimits;
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

    // Compute effective limits for the authenticated user
    const effectiveLimits = await computeEffectiveLimits(user.id, supabase)

    return new Response(
      JSON.stringify(effectiveLimits),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Compute effective limits error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
