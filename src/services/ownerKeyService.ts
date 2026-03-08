import { validateOwnerKey, type JWTPayload } from '@/lib/jwt';
import { supabase } from '@/lib/supabase';
import { getPlanConfig } from '@/lib/plans';

export interface OwnerKeyScopes {
  ads: boolean;
  max_storage_bytes?: number;
  max_books?: number;
  import_export: boolean;
  [key: string]: any;
}

export interface OwnerKeyInfo {
  isValid: boolean;
  scopes?: OwnerKeyScopes;
  userId?: string;
  error?: string;
}

class OwnerKeyService {
  private jwkCache: any = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get the public JWK from environment or config
   */
  private async getPublicJWK(): Promise<any> {
    // Check cache first
    if (this.jwkCache && Date.now() < this.cacheExpiry) {
      return this.jwkCache;
    }

    try {
      // Try to get JWK from environment variables
      const jwkString = import.meta.env.VITE_OWNER_KEY_JWK;
      if (jwkString) {
        this.jwkCache = JSON.parse(jwkString);
        this.cacheExpiry = Date.now() + this.CACHE_DURATION;
        return this.jwkCache;
      }

      // Fallback: fetch from a public endpoint if configured
      const jwkUrl = import.meta.env.VITE_OWNER_KEY_JWK_URL;
      if (jwkUrl) {
        const response = await fetch(jwkUrl);
        if (!response.ok) {
          throw new Error('Failed to fetch JWK from URL');
        }
        this.jwkCache = await response.json();
        this.cacheExpiry = Date.now() + this.CACHE_DURATION;
        return this.jwkCache;
      }

      throw new Error('No owner key JWK configured');
    } catch (error) {
      console.error('Failed to load owner key JWK:', error);
      throw new Error('Owner key verification not available');
    }
  }

  /**
   * Validate an owner key token
   */
  async validateOwnerKey(token: string): Promise<OwnerKeyInfo> {
    try {
      const jwk = await this.getPublicJWK();
      const result = await validateOwnerKey(token, jwk);

      if (!result) {
        return {
          isValid: false,
          error: 'Invalid or revoked owner key'
        };
      }

      return {
        isValid: true,
        scopes: result.scopes as OwnerKeyScopes,
        userId: result.userId
      };
    } catch (error) {
      console.error('Owner key validation error:', error);
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }

  /**
   * Check if user has an active owner key
   */
  async hasActiveOwnerKey(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('owner_keys')
        .select('id')
        .eq('user_id', userId)
        .eq('is_revoked', false)
        .gt('expires_at', new Date().toISOString())
        .limit(1);

      if (error) {
        console.error('Error checking active owner key:', error);
        return false;
      }

      return data && data.length > 0;
    } catch (error) {
      console.error('Unexpected error checking owner key:', error);
      return false;
    }
  }

  /**
   * Get all owner keys for a user
   */
  async getUserOwnerKeys(userId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('owner_keys')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching owner keys:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Unexpected error fetching owner keys:', error);
      return [];
    }
  }

  /**
   * Apply owner key scopes to override plan restrictions
   * Note: This method only applies owner key overrides. License overrides should be applied separately
   * and take precedence over owner key overrides.
   */
  applyOwnerKeyOverrides(
    basePlan: 'guest' | 'free' | 'pro' | 'lifetime' | 'owner',
    scopes?: OwnerKeyScopes
  ): {
    effectivePlan: 'guest' | 'free' | 'pro' | 'lifetime' | 'owner';
    maxStorageBytes: number;
    quotaBytes: number; // Total storage quota including base plan + extras
    maxBooks: number;
    adsEnabled: boolean;
    importExportEnabled: boolean;
    features: Record<string, any>;
  } {
    // Get plan config from canonical source
    const planConfig = getPlanConfig(basePlan);
    
    if (!planConfig) {
      console.error(`[ownerKeyService] Unknown plan: ${basePlan}`);
      // Fallback to free plan
      const freeConfig = getPlanConfig('free')!;
      return {
        effectivePlan: 'free',
        maxStorageBytes: freeConfig.quotaBytes,
        quotaBytes: freeConfig.quotaBytes,
        maxBooks: freeConfig.maxBooks,
        adsEnabled: freeConfig.adsEnabled,
        importExportEnabled: freeConfig.importExportEnabled,
        features: {}
      };
    }

    // Apply owner key overrides if available
    if (scopes) {
      return {
        effectivePlan: basePlan,
        maxStorageBytes: scopes.max_storage_bytes || planConfig.quotaBytes,
        quotaBytes: scopes.max_storage_bytes || planConfig.quotaBytes,
        maxBooks: scopes.max_books !== undefined ? scopes.max_books : planConfig.maxBooks,
        adsEnabled: scopes.ads !== undefined ? scopes.ads : planConfig.adsEnabled,
        importExportEnabled: scopes.import_export !== undefined ? scopes.import_export : planConfig.importExportEnabled,
        features: { ...scopes }
      };
    }

    return {
      effectivePlan: basePlan,
      maxStorageBytes: planConfig.quotaBytes,
      quotaBytes: planConfig.quotaBytes,
      maxBooks: planConfig.maxBooks,
      adsEnabled: planConfig.adsEnabled,
      importExportEnabled: planConfig.importExportEnabled,
      features: {}
    };
  }

  /**
   * Apply license overrides with highest precedence
   */
  applyLicenseOverrides(
    currentLimits: any,
    licenseFeatures?: Record<string, any>
  ): {
    effectivePlan: 'guest' | 'free' | 'pro' | 'lifetime';
    maxStorageBytes: number;
    quotaBytes: number; // Total storage quota including base plan + extras
    maxBooks: number;
    adsEnabled: boolean;
    importExportEnabled: boolean;
    features: Record<string, any>;
  } {
    if (!licenseFeatures) {
      return currentLimits;
    }

    // Calculate total quota bytes including extra quota from license
    const baseQuotaBytes = currentLimits.quotaBytes || currentLimits.maxStorageBytes;
    const extraQuotaBytes = licenseFeatures.extra_quota_bytes || 0;
    const totalQuotaBytes = baseQuotaBytes + extraQuotaBytes;

    return {
      ...currentLimits,
      // License features take highest precedence
      maxStorageBytes: totalQuotaBytes, // Update to reflect total quota
      quotaBytes: totalQuotaBytes, // Total storage quota including extras
      maxBooks: licenseFeatures.max_books !== undefined ? licenseFeatures.max_books : currentLimits.maxBooks,
      adsEnabled: licenseFeatures.ads !== undefined ? licenseFeatures.ads : currentLimits.adsEnabled,
      importExportEnabled: licenseFeatures.import_export !== undefined ? licenseFeatures.import_export : currentLimits.importExportEnabled,
      features: {
        ...currentLimits.features,
        ...licenseFeatures
      }
    };
  }

  /**
   * Clear JWK cache (useful for testing or key rotation)
   */
  clearCache(): void {
    this.jwkCache = null;
    this.cacheExpiry = 0;
  }
}

// Export singleton instance
export const ownerKeyService = new OwnerKeyService();
