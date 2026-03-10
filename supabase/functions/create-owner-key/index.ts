import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { jwt } from "https://deno.land/x/djwt@v2.4/mod.ts"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateOwnerKeyRequest {
  keyName: string
  userEmail: string
  scopes: {
    ads?: boolean
    max_storage_bytes?: number
    max_books?: number
    import_export?: boolean
    [key: string]: any
  }
  expiresAt: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the requester is an owner
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

    // Check if user is an owner
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('plan_type, email')
      .eq('id', user.id)
      .single()

    if (userError || userData?.plan_type !== 'owner') {
      return new Response(
        JSON.stringify({ error: 'Access denied. Only owners can create owner keys.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: CreateOwnerKeyRequest = await req.json()
    const { keyName, userEmail, scopes, expiresAt } = body

    if (!keyName || !userEmail || !scopes || !expiresAt) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: keyName, userEmail, scopes, expiresAt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find the target user by email
    const { data: targetUser, error: targetUserError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', userEmail)
      .single()

    if (targetUserError || !targetUser) {
      return new Response(
        JSON.stringify({ error: 'Target user not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate JWT token
    const payload = {
      user_id: targetUser.id,
      email: targetUser.email,
      scopes,
      exp: Math.floor(new Date(expiresAt).getTime() / 1000),
      iat: Math.floor(Date.now() / 1000),
      iss: 'kanvas-owner-key'
    }

    const jwtSecret = Deno.env.get('JWT_SECRET') || 'your-secret-key-change-in-production'
    const jwtToken = await jwt.create({ alg: 'HS256', typ: 'JWT' }, payload, jwtSecret)

    // Hash the token for storage
    const encoder = new TextEncoder()
    const data = encoder.encode(jwtToken)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Insert the owner key into the database
    const { data: ownerKey, error: insertError } = await supabase
      .from('owner_keys')
      .insert({
        user_id: targetUser.id,
        key_name: keyName,
        token_hash: tokenHash,
        scopes,
        issuer: userData.email,
        expires_at: expiresAt,
        created_by: user.id
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to create owner key', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return the actual token (only shown once) and key details
    return new Response(
      JSON.stringify({
        success: true,
        token: jwtToken, // Only return the actual token on creation
        key: {
          id: ownerKey.id,
          key_name: ownerKey.key_name,
          user_email: targetUser.email,
          scopes: ownerKey.scopes,
          expires_at: ownerKey.expires_at,
          created_at: ownerKey.created_at
        }
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in create-owner-key function:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
