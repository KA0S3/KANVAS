/**
 * Server Auth Middleware - Legacy Plan Translation
 * 
 * This middleware handles translation of legacy plan strings to canonical IDs
 * and provides logging for migration tracking.
 * 
 * This is non-destructive and reversible - it only translates plan names
 * at runtime without modifying the database.
 */

import { getPlanConfig, migrateLegacyPlanId } from './plans.ts';

export interface UserInfo {
  id: string;
  plan_type: string;
  storage_quota_mb?: number;
  [key: string]: any;
}

export interface AuthenticatedUser extends UserInfo {
  canonical_plan_id: string;
  effective_limits: {
    quotaBytes: number;
    maxBooks: number;
    adsEnabled: boolean;
    importExportEnabled: boolean;
  };
}

/**
 * Comprehensive legacy plan translation map
 * Maps all known legacy plan strings to canonical IDs
 */
const LEGACY_PLAN_TRANSLATION_MAP: Record<string, string> = {
  // Direct mappings from database migration
  'basic': 'free',
  'premium': 'pro', 
  'enterprise': 'lifetime',
  
  // Case variations
  'Basic': 'free',
  'Premium': 'pro',
  'Enterprise': 'lifetime',
  'BASIC': 'free',
  'PREMIUM': 'pro',
  'ENTERPRISE': 'lifetime',
  
  // Common variations and typos
  'free_tier': 'free',
  'free-tier': 'free',
  'Free': 'free',
  'FREE': 'free',
  'pro_tier': 'pro',
  'pro-tier': 'pro',
  'Pro': 'pro',
  'PRO': 'pro',
  'lifetime_access': 'lifetime',
  'lifetime-access': 'lifetime',
  'Lifetime': 'lifetime',
  'LIFETIME': 'lifetime',
  
  // Legacy license types that might appear in plan_type field
  'trial': 'free',
  'Trial': 'free',
  'TRIAL': 'free',
  'custom': 'lifetime',
  'Custom': 'lifetime',
  'CUSTOM': 'lifetime',
  
  // Empty/null values - default to free
  '': 'free',
  'null': 'free',
  'NULL': 'free',
  'undefined': 'free',
  'UNDEFINED': 'free'
};

/**
 * Migration statistics tracking
 */
interface MigrationStats {
  totalProcessed: number;
  legacyValuesFound: number;
  unmappedValues: string[];
  translationCounts: Record<string, number>;
}

const migrationStats: MigrationStats = {
  totalProcessed: 0,
  legacyValuesFound: 0,
  unmappedValues: [],
  translationCounts: {}
};

/**
 * Translates legacy plan strings to canonical IDs with comprehensive logging
 */
export function translateLegacyPlan(planType: string, context = 'unknown'): string {
  migrationStats.totalProcessed++;
  
  // If it's already a canonical plan, return as-is
  if (['guest', 'free', 'pro', 'lifetime'].includes(planType)) {
    return planType;
  }
  
  // Check if it's a legacy value that needs translation
  const canonicalId = LEGACY_PLAN_TRANSLATION_MAP[planType];
  
  if (canonicalId) {
    migrationStats.legacyValuesFound++;
    migrationStats.translationCounts[planType] = (migrationStats.translationCounts[planType] || 0) + 1;
    
    console.log(`[PLAN_MIGRATION] Translated legacy plan "${planType}" → "${canonicalId}" in context: ${context}`);
    return canonicalId;
  }
  
  // Handle unmapped legacy values
  if (!migrationStats.unmappedValues.includes(planType)) {
    migrationStats.unmappedValues.push(planType);
    console.warn(`[PLAN_MIGRATION] Unmapped legacy plan value: "${planType}" in context: ${context}`);
  }
  
  // Default to free plan for safety
  console.warn(`[PLAN_MIGRATION] Defaulting unmapped plan "${planType}" to "free" in context: ${context}`);
  return 'free';
}

/**
 * Server auth middleware that processes user info and applies plan translation
 */
export async function authenticateAndTranslatePlan(
  supabase: any,
  authHeader: string | null,
  context = 'unknown'
): Promise<AuthenticatedUser | null> {
  try {
    if (!authHeader) {
      console.warn(`[AUTH] No auth header provided in context: ${context}`);
      return null;
    }

    // Extract JWT token
    const token = authHeader.replace('Bearer ', '');
    
    // Verify JWT and get user
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.warn(`[AUTH] Invalid token in context: ${context}`, error?.message);
      return null;
    }

    // Get user's plan info from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, plan_type, storage_quota_mb')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      console.error(`[AUTH] Failed to fetch user data in context: ${context}`, userError?.message);
      return null;
    }

    // Translate legacy plan to canonical ID
    const canonicalPlanId = translateLegacyPlan(userData.plan_type, context);
    
    // Get effective limits from canonical plan config
    const planConfig = getPlanConfig(canonicalPlanId);
    if (!planConfig) {
      console.error(`[AUTH] Unknown canonical plan: ${canonicalPlanId} in context: ${context}`);
      return null;
    }

    return {
      ...userData,
      canonical_plan_id: canonicalPlanId,
      effective_limits: {
        quotaBytes: planConfig.quotaBytes,
        maxBooks: planConfig.maxBooks,
        adsEnabled: planConfig.adsEnabled,
        importExportEnabled: planConfig.importExportEnabled
      }
    };

  } catch (error) {
    console.error(`[AUTH] Authentication error in context: ${context}`, error);
    return null;
  }
}

/**
 * Get migration statistics for monitoring
 */
export function getMigrationStats(): MigrationStats {
  return { ...migrationStats };
}

/**
 * Log migration summary (call this periodically)
 */
export function logMigrationSummary(): void {
  console.log(`[PLAN_MIGRATION] Summary:`);
  console.log(`  Total users processed: ${migrationStats.totalProcessed}`);
  console.log(`  Legacy values found: ${migrationStats.legacyValuesFound}`);
  console.log(`  Unique unmapped values: ${migrationStats.unmappedValues.length}`);
  
  if (migrationStats.unmappedValues.length > 0) {
    console.log(`[PLAN_MIGRATION] Unmapped values needing review:`, migrationStats.unmappedValues);
  }
  
  if (Object.keys(migrationStats.translationCounts).length > 0) {
    console.log(`[PLAN_MIGRATION] Translation counts:`, migrationStats.translationCounts);
  }
}

/**
 * Reset migration statistics (useful for testing)
 */
export function resetMigrationStats(): void {
  migrationStats.totalProcessed = 0;
  migrationStats.legacyValuesFound = 0;
  migrationStats.unmappedValues = [];
  migrationStats.translationCounts = {};
}
