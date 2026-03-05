import { supabase } from '@/lib/supabase';

export interface EffectiveLimits {
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

export interface EffectiveLimitsResponse {
  data?: EffectiveLimits;
  error?: string;
}

/**
 * Fetch effective limits from the server-side computeEffectiveLimits function
 * This provides the single authoritative computation of a user's feature set
 */
export async function fetchEffectiveLimits(): Promise<EffectiveLimitsResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      return { error: 'User not authenticated' };
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compute-effective-limits`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({}),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { 
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}` 
      };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    console.error('Failed to fetch effective limits:', error);
    return { 
      error: error instanceof Error ? error.message : 'Network error occurred' 
    };
  }
}

/**
 * Get effective limits with graceful degradation fallback
 * If server is unavailable, uses local plan defaults with adsEnabled=true
 */
export async function getEffectiveLimitsWithFallback(): Promise<EffectiveLimits> {
  try {
    const response = await fetchEffectiveLimits();
    
    if (response.data) {
      console.log('[effectiveLimitsService] Using server-side effective limits:', response.data);
      return response.data;
    }
    
    if (response.error) {
      console.warn('[effectiveLimitsService] Server error, using fallback:', response.error);
    }
  } catch (error) {
    console.warn('[effectiveLimitsService] Network error, using fallback:', error);
  }

  // Graceful degradation fallback
  const { data: { session } } = await supabase.auth.getSession();
  const isGuest = !session?.user;
  
  const fallbackLimits: EffectiveLimits = {
    quotaBytes: isGuest ? 0 : 100 * 1024 * 1024, // 0 for guest, 100MB for signed in
    maxBooks: isGuest ? 1 : 2,
    adsEnabled: true, // Always show ads in fallback mode
    importExportEnabled: false,
    source: {
      plan: isGuest ? 'guest' : 'free',
    }
  };

  console.log('[effectiveLimitsService] Using fallback effective limits:', fallbackLimits);
  return fallbackLimits;
}
