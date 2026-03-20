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

    console.log(`[admin-promo-codes] Owner access granted: ${userData.email}`)

    switch (req.method) {
      case 'GET':
        return handleGetPromoCodes(supabase, req, corsHeaders)
      case 'POST':
        return handleCreatePromoCode(supabase, req, corsHeaders)
      case 'PUT':
        return handleUpdatePromoCode(supabase, req, corsHeaders)
      case 'DELETE':
        return handleDeletePromoCode(supabase, req, corsHeaders)
      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

  } catch (error) {
    console.error('[admin-promo-codes] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleGetPromoCodes(supabase: any, req: Request, corsHeaders: Record<string, string>) {
  try {
    console.log(`[admin-promo-codes] Fetching promo codes`)

    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[admin-promo-codes] Database error:', error)
      return new Response(
        JSON.stringify({ error: `Database error: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-promo-codes] Successfully fetched ${data?.length || 0} promo codes`)

    return new Response(
      JSON.stringify({ data: data || [] }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('[admin-promo-codes] GET error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch promo codes' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleCreatePromoCode(supabase: any, req: Request, corsHeaders: Record<string, string>) {
  try {
    const promoData = await req.json()

    if (!promoData.code || !promoData.discount_type || !promoData.discount_value) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: code, discount_type, discount_value' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-promo-codes] Creating promo code: ${promoData.code}`)

    const { data, error } = await supabase
      .from('promo_codes')
      .insert([promoData])
      .select()
      .single()

    if (error) {
      console.error('[admin-promo-codes] Create error:', error)
      return new Response(
        JSON.stringify({ error: `Create failed: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-promo-codes] Successfully created promo code: ${promoData.code}`)

    return new Response(
      JSON.stringify({ data }),
      { 
        status: 201, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('[admin-promo-codes] POST error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to create promo code' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleUpdatePromoCode(supabase: any, req: Request, corsHeaders: Record<string, string>) {
  try {
    const { id, ...updates } = await req.json()

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-promo-codes] Updating promo code ${id}:`, updates)

    const { data, error } = await supabase
      .from('promo_codes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[admin-promo-codes] Update error:', error)
      return new Response(
        JSON.stringify({ error: `Update failed: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-promo-codes] Successfully updated promo code ${id}`)

    return new Response(
      JSON.stringify({ data }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('[admin-promo-codes] PUT error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to update promo code' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleDeletePromoCode(supabase: any, req: Request, corsHeaders: Record<string, string>) {
  try {
    const { id } = await req.json()

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-promo-codes] Deleting promo code ${id}`)

    const { error } = await supabase
      .from('promo_codes')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[admin-promo-codes] Delete error:', error)
      return new Response(
        JSON.stringify({ error: `Delete failed: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-promo-codes] Successfully deleted promo code ${id}`)

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('[admin-promo-codes] DELETE error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to delete promo code' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
