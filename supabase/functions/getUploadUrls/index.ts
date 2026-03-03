import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UploadRequest {
  project_id: string
  files: Array<{
    asset_id: string
    size_bytes: number
  }>
}

interface UploadResponse {
  uploadUrls: Array<{
    asset_id: string
    signedUrl: string
    path: string
  }>
}

interface StorageUsage {
  total_bytes_used: bigint
  asset_count: number
}

interface License {
  license_type: string
  status: string
  features: any
  extra_quota_bytes?: bigint
}

interface User {
  id: string
  plan_type: string
  storage_quota_mb: number
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
    const body: UploadRequest = await req.json()
    const { project_id, files } = body

    if (!project_id || !files || !Array.isArray(files)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate files array
    for (const file of files) {
      if (!file.asset_id || typeof file.size_bytes !== 'number' || file.size_bytes <= 0) {
        return new Response(
          JSON.stringify({ error: 'Invalid file data in request' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Calculate total upload size
    const totalUploadSize = files.reduce((sum, file) => sum + file.size_bytes, 0)

    // Verify user owns the project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single()

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: 'Project not found or access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, plan_type, storage_quota_mb')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userInfo: User = userData

    // Get current storage usage
    const { data: storageData, error: storageError } = await supabase
      .from('storage_usage')
      .select('total_bytes_used, asset_count')
      .eq('user_id', user.id)
      .single()

    if (storageError && storageError.code !== 'PGRST116') {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch storage usage' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const currentUsage: StorageUsage = storageData || {
      total_bytes_used: BigInt(0),
      asset_count: 0
    }

    // Get active license with extra quota
    const { data: licenseData, error: licenseError } = await supabase
      .from('licenses')
      .select('license_type, status, features')
      .eq('user_id', user.id)
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

    // Calculate allowed quota
    const baseQuotaBytes = BigInt(userInfo.storage_quota_mb) * BigInt(1024 * 1024)
    const extraQuotaBytes = license?.extra_quota_bytes || BigInt(0)
    const totalAllowedQuota = baseQuotaBytes + extraQuotaBytes

    // Check if upload would exceed quota
    const newTotalUsage = currentUsage.total_bytes_used + BigInt(totalUploadSize)
    if (newTotalUsage > totalAllowedQuota) {
      return new Response(
        JSON.stringify({ 
          error: 'Storage quota exceeded',
          details: {
            current_used: Number(currentUsage.total_bytes_used),
            upload_size: totalUploadSize,
            quota_allowed: Number(totalAllowedQuota),
            plan_type: userInfo.plan_type,
            base_quota_mb: userInfo.storage_quota_mb,
            extra_quota_bytes: Number(extraQuotaBytes)
          }
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate R2 signed URLs
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')
    const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
    const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const r2BucketName = Deno.env.get('R2_BUCKET_NAME')

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
      return new Response(
        JSON.stringify({ error: 'R2 configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const uploadUrls: UploadResponse['uploadUrls'] = []

    for (const file of files) {
      const objectKey = `users/${user.id}/projects/${project_id}/assets/${file.asset_id}`
      const signedUrl = await generateR2SignedUrl(
        r2AccountId,
        r2AccessKeyId,
        r2SecretAccessKey,
        r2BucketName,
        objectKey
      )

      uploadUrls.push({
        asset_id: file.asset_id,
        signedUrl,
        path: objectKey
      })
    }

    return new Response(
      JSON.stringify({ uploadUrls }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in getUploadUrls:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function generateR2SignedUrl(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucketName: string,
  objectKey: string
): Promise<string> {
  const region = 'auto'
  const service = 's3'
  const host = `${bucketName}.${accountId}.r2.cloudflarestorage.com`
  const endpoint = `https://${host}`
  const method = 'PUT'
  const expires = 3600 // 1 hour

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '')
  const dateStamp = amzDate.substr(0, 8)

  const canonicalUri = `/${objectKey}`
  const canonicalQuerystring = ''
  const canonicalHeaders = `host:${host}\n`
  const signedHeaders = 'host'

  const payloadHash = await sha256Hex('')
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n')

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service)
  const signature = await hmacSha256(signingKey, stringToSign)

  const queryParameters = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': expires.toString(),
    'X-Amz-SignedHeaders': signedHeaders,
    'X-Amz-Signature': signature
  })

  return `${endpoint}${canonicalUri}?${queryParameters.toString()}`
}

async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256(key: Uint8Array, message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ), msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<Uint8Array> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key), dateStamp)
  const kRegion = await hmacSha256(new TextEncoder().encode(kDate), regionName)
  const kService = await hmacSha256(new TextEncoder().encode(kRegion), serviceName)
  const kSigning = await hmacSha256(new TextEncoder().encode(kService), 'aws4_request')
  return new TextEncoder().encode(kSigning)
}
