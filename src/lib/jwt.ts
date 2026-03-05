import { jwtVerify, importJWK, JWK } from 'jose';
import { supabase } from './supabase';

export interface JWTPayload {
  sub: string; // user ID
  scopes: {
    ads?: boolean;
    max_storage_bytes?: number;
    max_books?: number;
    import_export?: boolean;
    [key: string]: any;
  };
  exp: number; // expiration timestamp
  iss: string; // issuer
  iat?: number; // issued at
  [key: string]: any;
}

export interface OwnerKeyData {
  id: string;
  user_id: string;
  key_name: string;
  scopes: JWTPayload['scopes'];
  issuer: string;
  expires_at: string;
  is_revoked: boolean;
  revoked_at?: string;
  revoked_by?: string;
  revoked_reason?: string;
  created_by: string;
  created_at: string;
}

/**
 * Convert string to SHA256 hash
 */
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Standardize scope names to snake_case format with backward compatibility
 * Accepts both snake_case and camelCase, logs warnings for deprecated camelCase
 */
export function standardizeScopes(scopes: any): JWTPayload['scopes'] {
  const standardized: JWTPayload['scopes'] = {};
  const deprecatedMappings: Record<string, string> = {
    'maxStorageBytes': 'max_storage_bytes',
    'maxBooks': 'max_books',
    'importExport': 'import_export'
  };

  for (const [key, value] of Object.entries(scopes || {})) {
    // Check if this is a deprecated camelCase key
    if (deprecatedMappings[key]) {
      const snakeCaseKey = deprecatedMappings[key];
      console.warn(`[JWT] Deprecated scope key '${key}' detected. Please use '${snakeCaseKey}' instead.`);
      standardized[snakeCaseKey as keyof JWTPayload['scopes']] = value as any;
    } else {
      // Use the key as-is (should already be snake_case)
      standardized[key as keyof JWTPayload['scopes']] = value as any;
    }
  }

  return standardized;
}

/**
 * Verify JWT signature using JWK
 */
export async function verifyJWT(token: string, jwk: JWK): Promise<JWTPayload> {
  try {
    const publicKey = await importJWK(jwk, 'RS256');
    const { payload } = await jwtVerify(token, publicKey);
    
    // Validate required fields
    if (!payload.sub || !payload.exp || !payload.iss || !payload.scopes) {
      throw new Error('Invalid JWT payload structure');
    }

    // Check expiration
    if (Date.now() >= payload.exp * 1000) {
      throw new Error('JWT has expired');
    }

    // Standardize scope names to snake_case
    const standardizedPayload = {
      ...payload,
      scopes: standardizeScopes(payload.scopes)
    };

    return standardizedPayload as JWTPayload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    throw new Error('Invalid JWT token');
  }
}

/**
 * Check if owner key is revoked by looking up token hash in database
 */
export async function isOwnerKeyRevoked(tokenHash: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('owner_keys')
      .select('is_revoked')
      .eq('token_hash', tokenHash)
      .single();

    if (error) {
      // If no record found, consider it revoked (unknown key)
      return true;
    }

    return data.is_revoked;
  } catch (error) {
    console.error('Error checking owner key revocation:', error);
    return true; // Fail safe - consider revoked on error
  }
}

/**
 * Get owner key data from database
 */
export async function getOwnerKeyData(tokenHash: string): Promise<OwnerKeyData | null> {
  try {
    const { data, error } = await supabase
      .from('owner_keys')
      .select('*')
      .eq('token_hash', tokenHash)
      .single();

    if (error || !data) {
      return null;
    }

    return data as OwnerKeyData;
  } catch (error) {
    console.error('Error fetching owner key data:', error);
    return null;
  }
}

/**
 * Validate owner key token and return scopes
 */
export async function validateOwnerKey(
  token: string, 
  jwk: JWK
): Promise<{ scopes: JWTPayload['scopes']; userId: string } | null> {
  try {
    // Verify JWT signature and structure
    const payload = await verifyJWT(token, jwk);
    
    // Generate token hash
    const tokenHash = await sha256(token);
    
    // Check if key is revoked
    if (await isOwnerKeyRevoked(tokenHash)) {
      console.warn('Owner key is revoked:', tokenHash);
      return null;
    }

    // Get owner key data for additional validation
    const keyData = await getOwnerKeyData(tokenHash);
    if (!keyData) {
      console.warn('Owner key not found in database:', tokenHash);
      return null;
    }

    // Verify the user ID matches
    if (keyData.user_id !== payload.sub) {
      console.warn('User ID mismatch in owner key');
      return null;
    }

    // Verify issuer matches
    if (keyData.issuer !== payload.iss) {
      console.warn('Issuer mismatch in owner key');
      return null;
    }

    return {
      scopes: payload.scopes,
      userId: payload.sub
    };
  } catch (error) {
    console.error('Owner key validation failed:', error);
    return null;
  }
}

/**
 * Revoke an owner key
 */
export async function revokeOwnerKey(
  tokenHash: string, 
  revokedBy: string,
  reason?: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('owner_keys')
      .update({
        is_revoked: true,
        revoked_at: new Date().toISOString(),
        revoked_by: revokedBy,
        revoked_reason: reason
      })
      .eq('token_hash', tokenHash);

    return !error;
  } catch (error) {
    console.error('Error revoking owner key:', error);
    return false;
  }
}

/**
 * Store new owner key in database
 */
export async function storeOwnerKey(
  token: string,
  payload: JWTPayload,
  keyName: string,
  createdBy: string
): Promise<boolean> {
  try {
    const tokenHash = await sha256(token);
    
    const { error } = await supabase
      .from('owner_keys')
      .insert({
        user_id: payload.sub,
        key_name: keyName,
        token_hash: tokenHash,
        scopes: payload.scopes,
        issuer: payload.iss,
        expires_at: new Date(payload.exp * 1000).toISOString(),
        is_revoked: false,
        created_by: createdBy
      });

    return !error;
  } catch (error) {
    console.error('Error storing owner key:', error);
    return false;
  }
}
