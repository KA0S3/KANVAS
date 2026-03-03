# Owner Key System Implementation

## Overview

The owner key system provides a way to override plan restrictions and unlock additional features through JWT-based tokens. This system allows server-generated keys to grant specific scopes and capabilities to users.

## Architecture

### Database Schema

The `owner_keys` table stores:
- `token_hash`: SHA256 hash of the JWT token (for security)
- `scopes`: JSON object containing granted permissions
- `issuer`: Who issued the token
- `expires_at`: Token expiration time
- `is_revoked`: Revocation status

### JWT Token Structure

```json
{
  "sub": "user_id",
  "scopes": {
    "ads": false,
    "max_storage_bytes": 2147483648,
    "import_export": true,
    "custom_feature": true
  },
  "exp": 1234567890,
  "iss": "https://your-domain.com",
  "iat": 1234567890
}
```

## Components

### 1. JWT Utilities (`src/lib/jwt.ts`)

- `sha256()`: Generate SHA256 hash of token
- `verifyJWT()`: Verify JWT signature with JWK
- `validateOwnerKey()`: Complete validation flow
- `revokeOwnerKey()`: Mark key as revoked
- `storeOwnerKey()`: Store new key in database

### 2. Owner Key Service (`src/services/ownerKeyService.ts`)

- `validateOwnerKey()`: Public validation interface
- `hasActiveOwnerKey()`: Check user has active key
- `applyOwnerKeyOverrides()`: Apply scopes to plan limits
- JWK caching for performance

### 3. Auth Store Integration (`src/stores/authStore.ts`)

Extended with:
- `ownerKeyInfo`: Current validated key info
- `effectiveLimits`: Combined plan + key limits
- `validateOwnerKey()`: Validate and store key
- `clearOwnerKey()`: Remove key from session
- `updateEffectiveLimits()`: Recalculate limits

### 4. UI Components

- `OwnerKeyInput`: Token input and validation UI
- `OwnerKeyStatus`: Display active key benefits

### 5. Supabase Functions

- `validate-owner-key`: Server-side token validation
- `revoke-owner-key`: Key revocation endpoint

## Usage

### Setting up Environment

1. Add JWK to environment variables:
```bash
# Development
VITE_OWNER_KEY_JWK='{"kty":"RSA","n":"...","e":"AQAB"}'

# Production
VITE_OWNER_KEY_JWK_URL=https://your-domain.com/.well-known/jwks.json
```

2. Set Supabase function environment:
```bash
OWNER_KEY_JWK='{"kty":"RSA","n":"...","e":"AQAB"}'
```

### Using in Components

```tsx
import { useAuthStore } from '@/stores/authStore';
import { OwnerKeyInput, OwnerKeyStatus } from '@/components/owner-key';

function Settings() {
  const { effectiveLimits } = useAuthStore();
  
  return (
    <div>
      <OwnerKeyInput onSuccess={() => console.log('Key validated')} />
      <OwnerKeyStatus />
      
      {effectiveLimits && (
        <div>
          <p>Storage: {effectiveLimits.maxStorageBytes} bytes</p>
          <p>Ads: {effectiveLimits.adsEnabled ? 'Enabled' : 'Disabled'}</p>
          <p>Import/Export: {effectiveLimits.importExportEnabled ? 'Enabled' : 'Disabled'}</p>
        </div>
      )}
    </div>
  );
}
```

### Server-Side Key Generation

```typescript
import { SignJWT } from 'jose';

async function generateOwnerKey(userId: string, scopes: any) {
  const privateKey = await importJWK(privateKeyJWK, 'RS256');
  
  const token = await new SignJWT({
    sub: userId,
    scopes,
    iss: 'https://your-domain.com'
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('1y')
    .sign(privateKey);
  
  return token;
}
```

## Security Features

1. **Token Hashing**: Only SHA256 hashes stored in database
2. **Signature Verification**: JWT signature validated with public JWK
3. **Revocation Support**: Keys can be revoked at any time
4. **Expiration Handling**: Automatic expiration checking
5. **Scope Validation**: Only predefined scopes are applied

## Plan Override Behavior

Owner keys override plan restrictions in this priority:
1. Base plan limits (free/pro/lifetime)
2. Owner key scopes (if present)
3. Default values (fallback)

Example: Free user with owner key gets pro-level storage but keeps other free features unless explicitly overridden.

## Testing

Run the test suite:
```bash
npm test src/test/ownerKey.test.ts
```

## Deployment

1. Update database schema with new `owner_keys` table
2. Deploy Supabase functions
3. Set environment variables
4. Update client configuration
5. Test with sample tokens

## Migration Notes

- Existing authentication flow is preserved
- Owner keys are optional - system works without them
- No breaking changes to existing plans
- Graceful fallback if key validation fails
