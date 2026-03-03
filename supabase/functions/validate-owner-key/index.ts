import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jwtVerify, importJWK } from 'https://esm.sh/jose@5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface JWTPayload {
  sub: string
  scopes: Record<string, any>
  exp: number
  iss: string
  iat?: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token } = await req.json()
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get public JWK from environment
    const jwkString = Deno.env.get('OWNER_KEY_JWK')
    if (!jwkString) {
      return new Response(
        JSON.stringify({ error: 'Owner key verification not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const jwk = JSON.parse(jwkString)

    // Verify JWT signature
    const publicKey = await importJWK(jwk, 'RS256')
    const { payload } = await jwtVerify(token, publicKey)
    
    // Validate required fields
    if (!payload.sub || !payload.exp || !payload.iss || !payload.scopes) {
      return new Response(
        JSON.stringify({ error: 'Invalid JWT payload structure' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check expiration
    if (Date.now() >= payload.exp * 1000) {
      return new Response(
        JSON.stringify({ error: 'JWT has expired' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Generate token hash
    const encoder = new TextEncoder()
    const data = encoder.encode(token)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Check if key exists and is not revoked
    const { data: keyData, error: fetchError } = await supabase
      .from('owner_keys')
      .select('*')
      .eq('token_hash', tokenHash)
      .single()

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: 'Owner key not found or revoked' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (keyData.is_revoked) {
      return new Response(
        JSON.stringify({ error: 'Owner key has been revoked' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Verify user ID and issuer match
    if (keyData.user_id !== payload.sub || keyData.issuer !== payload.iss) {
      return new Response(
        JSON.stringify({ error: 'Owner key validation failed' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Return validation success with scopes
    return new Response(
      JSON.stringify({
        valid: true,
        scopes: payload.scopes,
        userId: payload.sub,
        keyName: keyData.key_name,
        expiresAt: keyData.expires_at
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Owner key validation error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
