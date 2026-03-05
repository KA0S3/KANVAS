import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookMonitoringResponse {
  success: boolean
  webhook_health: 'healthy' | 'degraded' | 'critical'
  metrics: {
    total_webhooks: number
    successful_webhooks: number
    failed_webhooks: number
    success_rate: number
    failure_rate: number
    average_processing_time_ms: number
    webhooks_last_hour: number
    webhooks_last_24h: number
  }
  alerts: Array<{
    type: 'high_failure_rate' | 'processing_delays' | 'validation_failures' | 'duplicate_events'
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
    threshold: number
    current_value: number
  }>
  recent_failures: Array<{
    webhook_id: string
    event_type: string
    error_message: string
    timestamp: string
    retry_count: number
  }>
  error?: string
}

interface WebhookMetrics {
  timestamp: string
  event_type: string
  processing_time_ms: number
  success: boolean
  error_message?: string
  retry_count: number
  duplicate_detected: boolean
  validation_failed: boolean
}

class WebhookMonitor {
  private supabase: any
  private alerts: Array<any> = []

  constructor(supabase: any) {
    this.supabase = supabase
  }

  async getWebhookMetrics(timeRange: '1h' | '24h' | '7d' = '24h'): Promise<WebhookMetrics[]> {
    const timeRanges = {
      '1h': new Date(Date.now() - 60 * 60 * 1000),
      '24h': new Date(Date.now() - 24 * 60 * 60 * 1000),
      '7d': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    }

    const { data, error } = await this.supabase
      .from('webhook_logs')
      .select('*')
      .gte('created_at', timeRanges[timeRange].toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch webhook metrics: ${error.message}`)
    }

    return data || []
  }

  async getRecentFailures(limit: number = 10): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('webhook_logs')
      .select('*')
      .eq('success', false)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to fetch recent failures: ${error.message}`)
    }

    return data || []
  }

  calculateMetrics(metrics: WebhookMetrics[]): any {
    const totalWebhooks = metrics.length
    const successfulWebhooks = metrics.filter(m => m.success).length
    const failedWebhooks = totalWebhooks - successfulWebhooks
    const successRate = totalWebhooks > 0 ? (successfulWebhooks / totalWebhooks) * 100 : 0
    const failureRate = totalWebhooks > 0 ? (failedWebhooks / totalWebhooks) * 100 : 0

    const processingTimes = metrics.map(m => m.processing_time_ms).filter(t => t > 0)
    const averageProcessingTime = processingTimes.length > 0 
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length 
      : 0

    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const webhooksLastHour = metrics.filter(m => 
      new Date(m.timestamp) >= oneHourAgo
    ).length

    const webhooksLast24h = metrics.filter(m => 
      new Date(m.timestamp) >= twentyFourHoursAgo
    ).length

    return {
      total_webhooks: totalWebhooks,
      successful_webhooks: successfulWebhooks,
      failed_webhooks: failedWebhooks,
      success_rate: successRate,
      failure_rate: failureRate,
      average_processing_time_ms: averageProcessingTime,
      webhooks_last_hour: webhooksLastHour,
      webhooks_last_24h: webhooksLast24h
    }
  }

  checkAlerts(metrics: WebhookMetrics[], calculatedMetrics: any): Array<any> {
    this.alerts = []

    // High failure rate alert
    if (calculatedMetrics.failure_rate > 10) { // > 10% failure rate
      this.alerts.push({
        type: 'high_failure_rate',
        severity: calculatedMetrics.failure_rate > 25 ? 'critical' : 'high',
        message: `Webhook failure rate is ${(calculatedMetrics.failure_rate).toFixed(2)}%`,
        threshold: 10,
        current_value: calculatedMetrics.failure_rate
      })
    } else if (calculatedMetrics.failure_rate > 5) { // > 5% failure rate
      this.alerts.push({
        type: 'high_failure_rate',
        severity: 'medium',
        message: `Webhook failure rate is elevated at ${(calculatedMetrics.failure_rate).toFixed(2)}%`,
        threshold: 5,
        current_value: calculatedMetrics.failure_rate
      })
    }

    // Processing delays alert
    if (calculatedMetrics.average_processing_time_ms > 5000) { // > 5 seconds
      this.alerts.push({
        type: 'processing_delays',
        severity: calculatedMetrics.average_processing_time_ms > 10000 ? 'critical' : 'high',
        message: `Average webhook processing time is ${(calculatedMetrics.average_processing_time_ms / 1000).toFixed(2)}s`,
        threshold: 5000,
        current_value: calculatedMetrics.average_processing_time_ms
      })
    } else if (calculatedMetrics.average_processing_time_ms > 2000) { // > 2 seconds
      this.alerts.push({
        type: 'processing_delays',
        severity: 'medium',
        message: `Webhook processing is slower than expected at ${(calculatedMetrics.average_processing_time_ms / 1000).toFixed(2)}s`,
        threshold: 2000,
        current_value: calculatedMetrics.average_processing_time_ms
      })
    }

    // Validation failures alert
    const validationFailures = metrics.filter(m => m.validation_failed).length
    const validationFailureRate = metrics.length > 0 ? (validationFailures / metrics.length) * 100 : 0

    if (validationFailureRate > 5) { // > 5% validation failure rate
      this.alerts.push({
        type: 'validation_failures',
        severity: validationFailureRate > 15 ? 'high' : 'medium',
        message: `Webhook validation failure rate is ${(validationFailureRate).toFixed(2)}%`,
        threshold: 5,
        current_value: validationFailureRate
      })
    }

    // Duplicate events alert
    const duplicateEvents = metrics.filter(m => m.duplicate_detected).length
    const duplicateRate = metrics.length > 0 ? (duplicateEvents / metrics.length) * 100 : 0

    if (duplicateRate > 10) { // > 10% duplicate rate
      this.alerts.push({
        type: 'duplicate_events',
        severity: 'medium',
        message: `High duplicate webhook rate: ${(duplicateRate).toFixed(2)}%`,
        threshold: 10,
        current_value: duplicateRate
      })
    }

    // Low volume alert (could indicate issues)
    if (calculatedMetrics.webhooks_last_hour < 5 && calculatedMetrics.webhooks_last_24h > 100) {
      this.alerts.push({
        type: 'processing_delays',
        severity: 'low',
        message: `Low webhook volume in last hour: ${calculatedMetrics.webhooks_last_hour} webhooks`,
        threshold: 5,
        current_value: calculatedMetrics.webhooks_last_hour
      })
    }

    return this.alerts
  }

  determineWebhookHealth(metrics: any, alerts: any[]): 'healthy' | 'degraded' | 'critical' {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length
    const highAlerts = alerts.filter(a => a.severity === 'high').length

    if (criticalAlerts > 0 || highAlerts > 2) {
      return 'critical'
    } else if (highAlerts > 0 || alerts.length > 3) {
      return 'degraded'
    } else if (metrics.failure_rate > 5 || metrics.average_processing_time_ms > 2000) {
      return 'degraded'
    }

    return 'healthy'
  }

  async logMonitoringResults(health: string, metrics: any, alerts: any[]): Promise<void> {
    try {
      await this.supabase
        .from('webhook_monitoring_logs')
        .insert({
          webhook_health: health,
          total_webhooks: metrics.total_webhooks,
          success_rate: metrics.success_rate,
          failure_rate: metrics.failure_rate,
          average_processing_time_ms: metrics.average_processing_time_ms,
          alerts_count: alerts.length,
          critical_alerts_count: alerts.filter(a => a.severity === 'critical').length,
          created_at: new Date().toISOString()
        })
    } catch (error) {
      console.error('Failed to log monitoring results:', error)
    }
  }

  async sendAlerts(alerts: any[]): Promise<void> {
    for (const alert of alerts) {
      try {
        await this.supabase
          .from('webhook_alerts')
          .insert({
            alert_type: alert.type,
            severity: alert.severity,
            message: alert.message,
            threshold: alert.threshold,
            current_value: alert.current_value,
            created_at: new Date().toISOString(),
            resolved: false
          })

        console.log(`Webhook alert sent: ${alert.type} - ${alert.message}`)
      } catch (error) {
        console.error('Failed to send webhook alert:', error)
      }
    }
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

    // Check authorization
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

    console.log('Starting webhook monitoring...')

    // Initialize monitor
    const monitor = new WebhookMonitor(supabase)

    // Get webhook metrics for different time ranges
    const metrics24h = await monitor.getWebhookMetrics('24h')
    const metrics1h = await monitor.getWebhookMetrics('1h')
    
    // Get recent failures
    const recentFailures = await monitor.getRecentFailures(10)

    // Calculate metrics
    const calculatedMetrics = monitor.calculateMetrics(metrics24h)

    // Check for alerts
    const alerts = monitor.checkAlerts(metrics24h, calculatedMetrics)

    // Determine webhook health
    const webhookHealth = monitor.determineWebhookHealth(calculatedMetrics, alerts)

    // Send alerts if any
    if (alerts.length > 0) {
      await monitor.sendAlerts(alerts)
    }

    // Log monitoring results
    await monitor.logMonitoringResults(webhookHealth, calculatedMetrics, alerts)

    console.log(`Webhook monitoring completed:`)
    console.log(`- Health status: ${webhookHealth}`)
    console.log(`- Total webhooks (24h): ${calculatedMetrics.total_webhooks}`)
    console.log(`- Success rate: ${calculatedMetrics.success_rate.toFixed(2)}%`)
    console.log(`- Average processing time: ${(calculatedMetrics.average_processing_time_ms / 1000).toFixed(2)}s`)
    console.log(`- Alerts triggered: ${alerts.length}`)

    const response: WebhookMonitoringResponse = {
      success: true,
      webhook_health: webhookHealth,
      metrics: calculatedMetrics,
      alerts: alerts,
      recent_failures: recentFailures.map(failure => ({
        webhook_id: failure.webhook_id || 'unknown',
        event_type: failure.event_type,
        error_message: failure.error_message || 'Unknown error',
        timestamp: failure.created_at,
        retry_count: failure.retry_count || 0
      }))
    }

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error in webhook monitoring:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        details: errorMessage
      } as WebhookMonitoringResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
