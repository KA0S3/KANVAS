/**
 * Canonical Plan Configuration - Server Side
 * 
 * This file mirrors the client-side plans configuration for server functions.
 * It ensures single source of truth across client and server.
 * 
 * Plan IDs: guest, free, pro, lifetime
 */

// Re-export from the canonical server config
export { 
  PlanConfig, 
  PLANS_CONFIG, 
  getPlanConfig, 
  isValidPlanId, 
  getAllPlans, 
  LEGACY_PLAN_MAPPING, 
  migrateLegacyPlanId 
} from '../../../server/config/plans';
