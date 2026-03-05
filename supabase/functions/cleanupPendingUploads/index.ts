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

    // Get users with stale pending uploads
    // Stale = pending uploads older than 1 hour
    const staleThreshold = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
    
    const { data: staleUsers, error: fetchError } = await supabase
      .from('storage_usage')
      .select('user_id, pending_bytes, last_calculated_at')
      .gt('pending_bytes', 0)
      .lt('last_calculated_at', staleThreshold.toISOString())

    if (fetchError) {
      console.error('Failed to fetch stale pending uploads:', fetchError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch stale pending uploads',
          details: fetchError.message 
        } as CleanupResponse),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!staleUsers || staleUsers.length === 0) {
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

    console.log(`Found ${staleUsers.length} users with stale pending uploads`)

    const cleanupDetails = []
    let totalCleanedUsers = 0
    let totalBytesReleased = 0

    // Process each user with stale pending uploads
    for (const user of staleUsers) {
      try {
        // Additional check: Look for assets that might be in limbo
        const { data: recentAssets } = await supabase
          .from('assets')
          .select('id, file_size_bytes, created_at')
          .eq('user_id', user.user_id)
          .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()) // Last 2 hours
          .order('created_at', { ascending: false })

        let shouldCleanup = true
        let reason = 'stale_timeout'

        // If there are recent assets, check if they match pending bytes
        if (recentAssets && recentAssets.length > 0) {
          const recentTotalSize = recentAssets.reduce((sum, asset) => sum + asset.file_size_bytes, 0)
          
          // If recent assets total is close to pending bytes, don't clean up
          // This handles the case where upload was successful but registerAsset wasn't called
          if (Math.abs(recentTotalSize - user.pending_bytes) < 1024 * 1024) { // Within 1MB
            shouldCleanup = false
            reason = 'recent_assets_match_pending'
            
            // Try to commit the pending bytes instead
            try {
              await supabase.rpc('commit_pending_bytes', {
                p_user_id: user.user_id,
                p_bytes: recentTotalSize
              })
              
              cleanupDetails.push({
                user_id: user.user_id,
                bytes_released: recentTotalSize,
                reason: 'committed_recent_assets'
              })
              
              totalBytesReleased += recentTotalSize
              totalCleanedUsers++
              continue
            } catch (commitError) {
              console.error(`Failed to commit pending bytes for user ${user.user_id}:`, commitError)
              // Fall through to cleanup
            }
          }
        }

        if (shouldCleanup) {
          // Rollback the stale pending bytes
          const { error: rollbackError } = await supabase.rpc('rollback_pending_bytes', {
            p_user_id: user.user_id,
            p_bytes: user.pending_bytes
          })

          if (rollbackError) {
            console.error(`Failed to rollback pending bytes for user ${user.user_id}:`, rollbackError)
            cleanupDetails.push({
              user_id: user.user_id,
              bytes_released: 0,
              reason: 'rollback_failed'
            })
          } else {
            cleanupDetails.push({
              user_id: user.user_id,
              bytes_released: Number(user.pending_bytes),
              reason: reason
            })
            
            totalBytesReleased += Number(user.pending_bytes)
            totalCleanedUsers++
          }
        }
      } catch (userError) {
        console.error(`Error processing user ${user.user_id}:`, userError)
        cleanupDetails.push({
          user_id: user.user_id,
          bytes_released: 0,
          reason: 'processing_error'
        })
      }
    }

    const response: CleanupResponse = {
      success: true,
      cleaned_users: totalCleanedUsers,
      total_bytes_released: totalBytesReleased,
      details: cleanupDetails
    }

    console.log(`Cleanup completed: ${totalCleanedUsers} users, ${totalBytesReleased} bytes released`)

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
