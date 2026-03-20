import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the authenticated user from the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract user from JWT token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is owner (you can customize this logic)
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

    console.log(`[admin-users] Owner access granted: ${userData.email}`)

    // Handle different HTTP methods
    switch (req.method) {
      case 'GET':
        return handleGetUsers(supabase, req, corsHeaders)
      case 'PUT':
        return handleUpdateUser(supabase, req, corsHeaders)
      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

  } catch (error) {
    console.error('[admin-users] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleGetUsers(supabase: any, req: Request, corsHeaders: Record<string, string>) {
  try {
    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const search = url.searchParams.get('search') || ''
    const limit = 25
    const offset = (page - 1) * limit

    console.log(`[admin-users] Fetching users: page=${page}, search="${search}"`)

    let query = supabase
      .from('users')
      .select('id, email, plan_type, storage_quota_mb, created_at', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    if (search) {
      query = query.ilike('email', `%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('[admin-users] Database error:', error)
      return new Response(
        JSON.stringify({ error: `Database error: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-users] Successfully fetched ${data?.length || 0} users`)

    return new Response(
      JSON.stringify({ 
        data: data || [],
        count: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / limit)
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('[admin-users] GET error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch users' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleUpdateUser(supabase: any, req: Request, corsHeaders: Record<string, string>) {
  try {
    const { userId, updates } = await req.json()

    if (!userId || !updates) {
      return new Response(
        JSON.stringify({ error: 'Missing userId or updates' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-users] Updating user ${userId}:`, updates)

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      console.error('[admin-users] Update error:', error)
      return new Response(
        JSON.stringify({ error: `Update failed: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-users] Successfully updated user ${userId}`)

    return new Response(
      JSON.stringify({ data }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('[admin-users] PUT error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to update user' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
