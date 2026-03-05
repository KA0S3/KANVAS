import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ReconciliationResponse {
  success: boolean
  users_processed: number
  users_corrected: number
  total_drift_bytes: number
  details: Array<{
    user_id: string
    recorded_usage: number
    actual_usage: number
    drift_bytes: number
    corrected: boolean
  }>
  performance_metrics?: {
    execution_time_ms: number
    users_per_second: number
    average_drift_bytes: number
    max_drift_bytes: number
  }
  alerts?: Array<{
    type: 'high_drift' | 'correction_failure' | 'performance_issue'
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
    affected_users?: number
  }>
  error?: string
}

interface ReconciliationLog {
  id: string
  execution_time: string
  users_processed: number
  users_corrected: number
  total_drift_bytes: number
  execution_time_ms: number
  alerts_triggered: number
  success: boolean
  details: string
}

interface DriftAnalysis {
  total_users: number
  users_with_drift: number
  average_drift_bytes: number
  median_drift_bytes: number
  max_drift_bytes: number
  min_drift_bytes: number
  drift_distribution: {
    small_drift: number  // < 1MB
    medium_drift: number // 1MB - 100MB
    large_drift: number  // > 100MB
  }
  common_drift_patterns: Array<{
    pattern: string
    count: number
    description: string
  }>
}

class ReconciliationLogger {
  private logs: Array<string> = []
  private startTime: number = Date.now()
  
  log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`
    this.logs.push(logEntry)
    console.log(logEntry)
  }
  
  logPerformance(operation: string, duration: number) {
    this.log(`Performance: ${operation} took ${duration}ms`)
  }
  
  logDrift(userId: string, driftBytes: number, assetCountDrift: number) {
    const driftMB = Math.abs(driftBytes) / (1024 * 1024)
    const severity = this.getDriftSeverity(driftBytes)
    this.log(
      `Drift detected for user ${userId}: ${driftMB.toFixed(2)}MB (${assetCountDrift} assets) - ${severity}`,
      severity === 'high' || severity === 'critical' ? 'error' : 'warn'
    )
  }
  
  logCorrection(userId: string, success: boolean, error?: string) {
    if (success) {
      this.log(`Successfully corrected drift for user ${userId}`)
    } else {
      this.log(`Failed to correct drift for user ${userId}: ${error}`, 'error')
    }
  }
  
  private getDriftSeverity(driftBytes: number): 'low' | 'medium' | 'high' | 'critical' {
    const absDrift = Math.abs(driftBytes)
    if (absDrift < 1024 * 1024) return 'low' // < 1MB
    if (absDrift < 100 * 1024 * 1024) return 'medium' // < 100MB
    if (absDrift < 1024 * 1024 * 1024) return 'high' // < 1GB
    return 'critical' // >= 1GB
  }
  
  getExecutionTime(): number {
    return Date.now() - this.startTime
  }
  
  getLogs(): string[] {
    return [...this.logs]
  }
}

class AlertSystem {
  private alerts: Array<any> = []
  
  checkForAlerts(analysis: DriftAnalysis, performanceMetrics: any, correctionFailures: number) {
    this.alerts = []
    
    // High drift alert
    if (analysis.max_drift_bytes > 1024 * 1024 * 1024) { // > 1GB
      this.alerts.push({
        type: 'high_drift',
        severity: 'critical',
        message: `Critical drift detected: ${(analysis.max_drift_bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`,
        affected_users: 1
      })
    } else if (analysis.average_drift_bytes > 100 * 1024 * 1024) { // > 100MB average
      this.alerts.push({
        type: 'high_drift',
        severity: 'high',
        message: `High average drift: ${(analysis.average_drift_bytes / (1024 * 1024)).toFixed(2)}MB`,
        affected_users: analysis.users_with_drift
      })
    }
    
    // Performance alert
    if (performanceMetrics.users_per_second < 10) { // Less than 10 users/sec
      this.alerts.push({
        type: 'performance_issue',
        severity: 'medium',
        message: `Slow reconciliation performance: ${performanceMetrics.users_per_second.toFixed(2)} users/sec`
      })
    }
    
    // Correction failure alert
    if (correctionFailures > 0) {
      this.alerts.push({
        type: 'correction_failure',
        severity: correctionFailures > 5 ? 'high' : 'medium',
        message: `Failed to correct drift for ${correctionFailures} users`,
        affected_users: correctionFailures
      })
    }
    
    return this.alerts
  }
  
  async sendAlerts(alerts: Array<any>, supabase: any) {
    for (const alert of alerts) {
      try {
        await supabase
          .from('reconciliation_alerts')
          .insert({
            alert_type: alert.type,
            severity: alert.severity,
            message: alert.message,
            affected_users: alert.affected_users,
            created_at: new Date().toISOString(),
            resolved: false
          })
        
        console.log(`Alert sent: ${alert.type} - ${alert.message}`)
      } catch (error) {
        console.error('Failed to send alert:', error)
      }
    }
  }
}

function analyzeDrift(details: Array<any>): DriftAnalysis {
  const drifts = details.map(d => d.drift_bytes).filter(d => d !== 0)
  const absDrifts = drifts.map(d => Math.abs(d))
  
  const totalUsers = details.length
  const usersWithDrift = drifts.length
  
  const averageDrift = usersWithDrift > 0 ? absDrifts.reduce((a, b) => a + b, 0) / usersWithDrift : 0
  const maxDrift = usersWithDrift > 0 ? Math.max(...absDrifts) : 0
  const minDrift = usersWithDrift > 0 ? Math.min(...absDrifts) : 0
  
  const sortedDrifts = absDrifts.sort((a, b) => a - b)
  const medianDrift = usersWithDrift > 0 ? 
    sortedDrifts[Math.floor(sortedDrifts.length / 2)] : 0
  
  const driftDistribution = {
    small_drift: absDrifts.filter(d => d < 1024 * 1024).length,
    medium_drift: absDrifts.filter(d => d >= 1024 * 1024 && d < 100 * 1024 * 1024).length,
    large_drift: absDrifts.filter(d => d >= 100 * 1024 * 1024).length,
  }
  
  // Analyze common patterns
  const patterns = analyzeDriftPatterns(details)
  
  return {
    total_users: totalUsers,
    users_with_drift: usersWithDrift,
    average_drift_bytes: averageDrift,
    median_drift_bytes: medianDrift,
    max_drift_bytes: maxDrift,
    min_drift_bytes: minDrift,
    drift_distribution: driftDistribution,
    common_drift_patterns: patterns
  }
}

function analyzeDriftPatterns(details: Array<any>): Array<any> {
  const patterns = []
  
  // Pattern: Positive drift (recorded > actual)
  const positiveDrift = details.filter(d => d.drift_bytes > 0)
  if (positiveDrift.length > 0) {
    patterns.push({
      pattern: 'positive_drift',
      count: positiveDrift.length,
      description: 'Recorded usage higher than actual (possible failed uploads)'
    })
  }
  
  // Pattern: Negative drift (recorded < actual)
  const negativeDrift = details.filter(d => d.drift_bytes < 0)
  if (negativeDrift.length > 0) {
    patterns.push({
      pattern: 'negative_drift',
      count: negativeDrift.length,
      description: 'Recorded usage lower than actual (possible missed updates)'
    })
  }
  
  // Pattern: Exact multiples of common file sizes
  const commonSizes = [1024 * 1024, 10 * 1024 * 1024, 100 * 1024 * 1024] // 1MB, 10MB, 100MB
  for (const size of commonSizes) {
    const exactMultiples = details.filter(d => 
      d.drift_bytes !== 0 && Math.abs(d.drift_bytes) % size === 0
    )
    if (exactMultiples.length > 2) {
      patterns.push({
        pattern: `exact_multiple_${size / (1024 * 1024)}mb`,
        count: exactMultiples.length,
        description: `Drift exactly multiples of ${size / (1024 * 1024)}MB (possible bulk operations)`
      })
    }
  }
  
  return patterns
}

async function logReconciliationExecution(
  supabase: any, 
  logger: ReconciliationLogger, 
  response: ReconciliationResponse
) {
  try {
    const logEntry: ReconciliationLog = {
      id: crypto.randomUUID(),
      execution_time: new Date().toISOString(),
      users_processed: response.users_processed,
      users_corrected: response.users_corrected,
      total_drift_bytes: response.total_drift_bytes,
      execution_time_ms: logger.getExecutionTime(),
      alerts_triggered: response.alerts?.length || 0,
      success: response.success,
      details: JSON.stringify({
        logs: logger.getLogs(),
        performance_metrics: response.performance_metrics,
        alerts: response.alerts
      })
    }
    
    await supabase
      .from('reconciliation_logs')
      .insert(logEntry)
    
    logger.log(`Reconciliation execution logged: ${logEntry.id}`)
  } catch (error) {
    logger.log(`Failed to log reconciliation execution: ${error.message}`, 'error')
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Initialize logging and alerting
    const logger = new ReconciliationLogger()
    const alertSystem = new AlertSystem()
    
    logger.log('Starting enhanced storage usage reconciliation...')

    // Get authentication (optional for cron jobs, but required for manual calls)
    const authHeader = req.headers.get('Authorization')
    let isAuthorized = false
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      
      if (!authError && user) {
        // Check if user is admin
        const { data: userData } = await supabase
          .from('users')
          .select('plan_type')
          .eq('id', user.id)
          .single()
        
        isAuthorized = userData?.plan_type === 'lifetime' // Simple admin check
      }
    }

    // Allow cron job execution
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

    logger.log('Authorization successful, starting reconciliation process')

    // Get all users with their storage usage
    const usersStartTime = Date.now()
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, plan_type')
      .order('created_at', { ascending: false })

    if (usersError) {
      logger.log(`Failed to fetch users: ${usersError.message}`, 'error')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch users',
          details: usersError.message 
        } as ReconciliationResponse),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.logPerformance('Fetch users', Date.now() - usersStartTime)

    if (!users || users.length === 0) {
      logger.log('No users found for reconciliation')
      const response: ReconciliationResponse = {
        success: true, 
        users_processed: 0,
        users_corrected: 0,
        total_drift_bytes: 0,
        details: [],
        performance_metrics: {
          execution_time_ms: logger.getExecutionTime(),
          users_per_second: 0,
          average_drift_bytes: 0,
          max_drift_bytes: 0
        }
      }
      
      await logReconciliationExecution(supabase, logger, response)
      
      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.log(`Processing ${users.length} users for reconciliation`)

    const reconciliationDetails = []
    let totalUsersProcessed = 0
    let totalUsersCorrected = 0
    let totalDriftBytes = 0
    let correctionFailures = 0

    // Process each user with enhanced monitoring
    for (const user of users) {
      const userStartTime = Date.now()
      
      try {
        totalUsersProcessed++

        // Get actual usage from assets table
        const actualUsageStartTime = Date.now()
        const { data: actualUsage, error: actualError } = await supabase
          .from('assets')
          .select('file_size_bytes')
          .eq('user_id', user.id)

        if (actualError) {
          logger.log(`Failed to get actual usage for user ${user.id}: ${actualError.message}`, 'error')
          continue
        }

        logger.logPerformance(`Get actual usage for ${user.id}`, Date.now() - actualUsageStartTime)

        const actualTotalBytes = actualUsage?.reduce((sum: number, asset: any) => sum + asset.file_size_bytes, 0) || 0
        const actualAssetCount = actualUsage?.length || 0

        // Get recorded usage from storage_usage table
        const recordedUsageStartTime = Date.now()
        const { data: recordedUsage, error: recordedError } = await supabase
          .from('storage_usage')
          .select('total_bytes_used, pending_bytes, asset_count')
          .eq('user_id', user.id)
          .single()

        let recordedTotalBytes = 0
        let recordedAssetCount = 0
        let pendingBytes = 0

        if (!recordedError && recordedUsage) {
          recordedTotalBytes = Number(recordedUsage.total_bytes_used)
          recordedAssetCount = recordedUsage.asset_count || 0
          pendingBytes = Number(recordedUsage.pending_bytes || 0)
        }

        logger.logPerformance(`Get recorded usage for ${user.id}`, Date.now() - recordedUsageStartTime)

        // Calculate drift
        const driftBytes = recordedTotalBytes - actualTotalBytes
        const assetCountDrift = recordedAssetCount - actualAssetCount

        const hasDrift = Math.abs(driftBytes) > 1024 || Math.abs(assetCountDrift) > 0 // More than 1KB or count mismatch

        if (hasDrift) {
          logger.logDrift(user.id, driftBytes, assetCountDrift)
          
          // Determine if auto-correction should be applied
          const shouldAutoCorrect = Math.abs(driftBytes) < 1024 * 1024 * 1024 // < 1GB
          
          if (shouldAutoCorrect) {
            // Correct the drift
            const correctionStartTime = Date.now()
            const { error: updateError } = await supabase
              .from('storage_usage')
              .upsert({
                user_id: user.id,
                total_bytes_used: actualTotalBytes,
                pending_bytes: pendingBytes, // Preserve pending bytes
                asset_count: actualAssetCount,
                last_calculated_at: new Date().toISOString(),
                drift_detected_at: new Date().toISOString(),
                drift_bytes: driftBytes
              }, {
                onConflict: 'user_id'
              })

            logger.logPerformance(`Correct drift for ${user.id}`, Date.now() - correctionStartTime)

            if (updateError) {
              logger.logCorrection(user.id, false, updateError.message)
              correctionFailures++
              reconciliationDetails.push({
                user_id: user.id,
                recorded_usage: recordedTotalBytes,
                actual_usage: actualTotalBytes,
                drift_bytes: driftBytes,
                corrected: false
              })
            } else {
              logger.logCorrection(user.id, true)
              totalUsersCorrected++
              totalDriftBytes += Math.abs(driftBytes)
              reconciliationDetails.push({
                user_id: user.id,
                recorded_usage: recordedTotalBytes,
                actual_usage: actualTotalBytes,
                drift_bytes: driftBytes,
                corrected: true
              })
            }
          } else {
            // Large drift - require manual review
            logger.log(`Large drift for user ${user.id} requires manual review: ${Math.abs(driftBytes / (1024 * 1024)).toFixed(2)}MB`, 'error')
            reconciliationDetails.push({
              user_id: user.id,
              recorded_usage: recordedTotalBytes,
              actual_usage: actualTotalBytes,
              drift_bytes: driftBytes,
              corrected: false
            })
            
            // Create alert for large drift
            await alertSystem.sendAlerts([{
              type: 'high_drift',
              severity: 'critical',
              message: `Large drift requires manual review for user ${user.id}: ${Math.abs(driftBytes / (1024 * 1024)).toFixed(2)}MB`,
              affected_users: 1
            }], supabase)
          }
        } else {
          // No drift, just update last_calculated_at
          if (recordedUsage) {
            await supabase
              .from('storage_usage')
              .update({
                last_calculated_at: new Date().toISOString()
              })
              .eq('user_id', user.id)
          }
        }

        logger.logPerformance(`Process user ${user.id}`, Date.now() - userStartTime)

      } catch (userError) {
        logger.log(`Error processing user ${user.id}: ${userError instanceof Error ? userError.message : 'Unknown error'}`, 'error')
        correctionFailures++
        reconciliationDetails.push({
          user_id: user.id,
          recorded_usage: 0,
          actual_usage: 0,
          drift_bytes: 0,
          corrected: false
        })
      }
    }

    // Analyze drift patterns
    const driftAnalysis = analyzeDrift(reconciliationDetails)
    
    // Calculate performance metrics
    const executionTime = logger.getExecutionTime()
    const performanceMetrics = {
      execution_time_ms: executionTime,
      users_per_second: totalUsersProcessed / (executionTime / 1000),
      average_drift_bytes: driftAnalysis.average_drift_bytes,
      max_drift_bytes: driftAnalysis.max_drift_bytes
    }

    // Check for alerts
    const alerts = alertSystem.checkForAlerts(driftAnalysis, performanceMetrics, correctionFailures)
    
    // Send alerts if any
    if (alerts.length > 0) {
      await alertSystem.sendAlerts(alerts, supabase)
    }

    // Enhanced logging
    logger.log(`Reconciliation completed:`)
    logger.log(`- Users processed: ${totalUsersProcessed}`)
    logger.log(`- Users corrected: ${totalUsersCorrected}`)
    logger.log(`- Total drift corrected: ${totalDriftBytes} bytes`)
    logger.log(`- Correction failures: ${correctionFailures}`)
    logger.log(`- Users with drift: ${driftAnalysis.users_with_drift}`)
    logger.log(`- Average drift: ${(driftAnalysis.average_drift_bytes / (1024 * 1024)).toFixed(2)}MB`)
    logger.log(`- Max drift: ${(driftAnalysis.max_drift_bytes / (1024 * 1024)).toFixed(2)}MB`)
    logger.log(`- Performance: ${performanceMetrics.users_per_second.toFixed(2)} users/sec`)
    
    if (driftAnalysis.common_drift_patterns.length > 0) {
      logger.log(`- Common drift patterns:`)
      driftAnalysis.common_drift_patterns.forEach(pattern => {
        logger.log(`  * ${pattern.pattern}: ${pattern.count} users - ${pattern.description}`)
      })
    }

    const response: ReconciliationResponse = {
      success: true,
      users_processed: totalUsersProcessed,
      users_corrected: totalUsersCorrected,
      total_drift_bytes: totalDriftBytes,
      details: reconciliationDetails,
      performance_metrics: performanceMetrics,
      alerts: alerts
    }

    // Log execution
    await logReconciliationExecution(supabase, logger, response)

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error in reconcileStorageUsage:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        details: errorMessage
      } as ReconciliationResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
