import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify user is authenticated and has admin privileges
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify JWT token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if user has admin privileges (you may want to implement proper role-based access)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('plan_type')
      .eq('id', user.id)
      .single()

    if (userError || !userData || !['pro', 'lifetime'].includes(userData.plan_type)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient privileges to revoke owner keys' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { tokenHash, reason } = await req.json()
    
    if (!tokenHash) {
      return new Response(
        JSON.stringify({ error: 'Token hash is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`[revoke-owner-key] User ${user.id} revoking owner key with hash: ${tokenHash}`)

    // Update the owner key to mark it as revoked with audit trail
    const { error } = await supabase
      .from('owner_keys')
      .update({
        is_revoked: true,
        revoked_at: new Date().toISOString(),
        revoked_by: user.id, // Add audit trail
        revoked_reason: reason || 'Revoked by admin'
      })
      .eq('token_hash', tokenHash)

    if (error) {
      console.error('[revoke-owner-key] Failed to revoke owner key:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to revoke owner key' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Log the revocation action for audit
    await supabase
      .from('admin_actions')
      .insert({
        admin_user_id: user.id,
        action_type: 'revoke_owner_key',
        action_details: {
          token_hash: tokenHash,
          reason: reason || 'Revoked by admin'
        },
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        user_agent: req.headers.get('user-agent')
      })

    console.log(`[revoke-owner-key] Successfully revoked owner key: ${tokenHash}`)

    return new Response(
      JSON.stringify({ success: true, message: 'Owner key revoked successfully' }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Owner key revocation error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
