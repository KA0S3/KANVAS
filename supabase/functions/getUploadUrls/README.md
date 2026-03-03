# getUploadUrls Edge Function

## Purpose

Generates signed PUT URLs for Cloudflare R2 storage with server-side quota enforcement.

## Authentication

Requires valid Supabase JWT token in Authorization header.

## Request Body

```json
{
  "project_id": "uuid",
  "files": [
    {
      "asset_id": "uuid", 
      "size_bytes": 1024000
    }
  ]
}
```

## Response

Success (200):
```json
{
  "uploadUrls": [
    {
      "asset_id": "uuid",
      "signedUrl": "https://bucket.account.r2.cloudflarestorage.com/path?signature=...",
      "path": "users/user_id/projects/project_id/assets/asset_id"
    }
  ]
}
```

Error (403):
```json
{
  "error": "Storage quota exceeded",
  "details": {
    "current_used": 1048576,
    "upload_size": 1024000,
    "quota_allowed": 2097152,
    "plan_type": "basic",
    "base_quota_mb": 100,
    "extra_quota_bytes": 1048576
  }
}
```

## Environment Variables

Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

## Security Features

- Server-side quota enforcement
- Project ownership verification
- License-based quota calculation
- No client-side trust
- AWS4-HMAC-SHA256 signed URLs
