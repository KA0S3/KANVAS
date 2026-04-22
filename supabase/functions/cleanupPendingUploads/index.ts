import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CleanupResponse {
  success: boolean
  cleaned_users: number
  total_bytes_released: number
  details: Array<{
    user_id: string
    bytes_released: number
    reason: string
  }>
  error?: string
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

    // Get authentication (optional for cron jobs, but required for manual calls)
    const authHeader = req.headers.get('Authorization')
    let isAuthorized = false
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      
      if (!authError && user) {
        // Check if user is admin (you may want to implement proper admin check)
        const { data: userData } = await supabase
          .from('users')
          .select('plan_type')
          .eq('id', user.id)
          .single()
        
        isAuthorized = userData?.plan_type === 'lifetime' // Simple admin check
      }
    }

    // Allow cron job execution (bypass auth for scheduled tasks)
    const cronKey = req.headers.get('X-Cron-Key')
    if (cronKey === Deno.env.get('CRON_SECRET_KEY')) {
      isAuthorized = true
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use new cleanup_stale_pending_bytes RPC (Phase 4 I/O optimization)
    // This uses last_pending_update_at instead of last_calculated_at for accuracy
    const { data: cleanedData, error: cleanupError } = await supabase.rpc('cleanup_stale_pending_bytes', {
      p_stale_threshold_hours: 1
    })

    if (cleanupError) {
      console.error('Failed to cleanup stale pending uploads:', cleanupError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to cleanup stale pending uploads',
          details: cleanupError.message 
        } as CleanupResponse),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!cleanedData || cleanedData.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          cleaned_users: 0,
          total_bytes_released: 0,
          details: []
        } as CleanupResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Cleanup completed via RPC: ${cleanedData.length} users cleaned`)

    const cleanupDetails = cleanedData.map(row => ({
      user_id: row.user_id,
      bytes_released: Number(row.bytes_freed),
      reason: 'stale_pending_cleanup'
    }))

    const totalBytesReleased = cleanupDetails.reduce((sum, d) => sum + d.bytes_released, 0)

    const response: CleanupResponse = {
      success: true,
      cleaned_users: cleanedData.length,
      total_bytes_released: totalBytesReleased,
      details: cleanupDetails
    }

    console.log(`Cleanup completed: ${cleanedData.length} users, ${totalBytesReleased} bytes released`)

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in cleanupPendingUploads:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        details: error.message 
      } as CleanupResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
