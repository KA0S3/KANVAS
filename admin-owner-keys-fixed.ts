import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
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

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('plan_type, email')
      .eq('id', user.id)
      .single()

    if (userError || userData?.plan_type !== 'owner') {
      return new Response(
        JSON.stringify({ error: 'Access denied. Owner privileges required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-owner-keys] Owner access granted: ${userData.email}`)

    switch (req.method) {
      case 'GET':
        return handleGetOwnerKeys(supabase, req, corsHeaders)
      case 'POST':
        return handleCreateOwnerKey(supabase, req, corsHeaders)
      case 'PUT':
        return handleRevokeOwnerKey(supabase, req, corsHeaders)
      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

  } catch (error) {
    console.error('[admin-owner-keys] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleGetOwnerKeys(supabase: any, req: Request, corsHeaders: Record<string, string>) {
  try {
    console.log(`[admin-owner-keys] Fetching owner keys`)

    const { data, error } = await supabase
      .from('owner_keys')
      .select(`
        *,
        user:users(email),
        revoked_by_user:users(email),
        created_by_user:users(email)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[admin-owner-keys] Database error:', error)
      return new Response(
        JSON.stringify({ error: `Database error: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-owner-keys] Successfully fetched ${data?.length || 0} owner keys`)

    return new Response(
      JSON.stringify({ data: data || [] }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('[admin-owner-keys] GET error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch owner keys' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleCreateOwnerKey(supabase: any, req: Request, corsHeaders: Record<string, string>) {
  try {
    const { email, notes } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-owner-keys] Creating owner key for: ${email}`)

    const key = `owner_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`

    const { data, error } = await supabase
      .from('owner_keys')
      .insert([{
        key,
        email,
        notes: notes || null,
        created_by: (await supabase.auth.getUser(req.headers.get('Authorization')!.replace('Bearer ', ''))).data.user?.id
      }])
      .select()
      .single()

    if (error) {
      console.error('[admin-owner-keys] Create error:', error)
      return new Response(
        JSON.stringify({ error: `Create failed: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-owner-keys] Successfully created owner key for ${email}`)

    return new Response(
      JSON.stringify({ data }),
      { 
        status: 201, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('[admin-owner-keys] POST error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to create owner key' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleRevokeOwnerKey(supabase: any, req: Request, corsHeaders: Record<string, string>) {
  try {
    const { id } = await req.json()

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-owner-keys] Revoking owner key ${id}`)

    const { error } = await supabase
      .from('owner_keys')
      .update({ 
        is_revoked: true,
        revoked_at: new Date().toISOString(),
        revoked_by: (await supabase.auth.getUser(req.headers.get('Authorization')!.replace('Bearer ', ''))).data.user?.id
      })
      .eq('id', id)

    if (error) {
      console.error('[admin-owner-keys] Revoke error:', error)
      return new Response(
        JSON.stringify({ error: `Revoke failed: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-owner-keys] Successfully revoked owner key ${id}`)

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('[admin-owner-keys] PUT error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to revoke owner key' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
