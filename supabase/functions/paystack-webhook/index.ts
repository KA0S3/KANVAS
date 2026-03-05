import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"
import { getPlanConfig, migrateLegacyPlanId } from "../shared/plans.ts"

// Webhook security configuration
const WEBHOOK_TTL_SECONDS = 300 // 5 minutes
const MAX_REPLAY_WINDOW_SECONDS = 3600 // 1 hour for duplicate detection

// In-memory store for processed webhook signatures (in production, use Redis)
const processedWebhooks = new Map<string, number>()

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Legacy PlanConfig interface - DEPRECATED
// Using canonical config from shared/plans.ts instead
interface LegacyPlanConfig {
  licenseType: 'trial' | 'basic' | 'premium' | 'enterprise' | 'custom'
  storageQuotaMB: number
  features: Record<string, any>
}

// Legacy plan configurations - DEPRECATED, use getPlanConfig instead
const LEGACY_PLAN_CONFIGS: Record<string, LegacyPlanConfig> = {
  'basic': {
    licenseType: 'basic',
    storageQuotaMB: 1000,
    features: { maxProjects: 10, maxAssetsPerProject: 100 }
  },
  'premium': {
    licenseType: 'premium',
    storageQuotaMB: 5000,
    features: { maxProjects: 50, maxAssetsPerProject: 500 }
  },
  'enterprise': {
    licenseType: 'enterprise',
    storageQuotaMB: 20000,
    features: { maxProjects: -1, maxAssetsPerProject: -1 }
  }
}

interface PaystackEvent {
  event: string
  data: {
    id: number
    domain: string
    status: string
    reference: string
    amount: number
    message: string
    gateway_response: string
    paid_at: string
    created_at: string
    channel: string
    currency: string
    ip_address: string
    metadata?: {
      product_key?: string
      user_id?: string
      plan_type?: string
      [key: string]: any
    }
    customer: {
      id: number
      first_name: string
      last_name: string
      email: string
      customer_code: string
      phone: string
      metadata: any
      risk_action: string
    }
    plan?: {
      id: number
      name: string
      amount: number
      interval: string
      duration: number
    }
    subscription?: {
      id: number
      subscription_code: string
      email_token: string
      next_payment_date: string
      open_invoice: string
    }
  }
}

interface WebhookLog {
  id?: string
  event_type: string
  reference: string
  signature: string
  processed: boolean
  error_message?: string
  created_at: string
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

    // Get Paystack secret key
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
    if (!paystackSecretKey) {
      console.error('PAYSTACK_SECRET_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'Paystack configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Enhanced webhook validation with replay protection
    const validationResult = await validateWebhookRequest(req, paystackSecretKey, supabase)
    if (!validationResult.isValid) {
      console.error('Webhook validation failed:', validationResult.error)
      
      // Log failed validation attempt
      await logWebhookEvent(supabase, {
        event_type: 'validation_failed',
        reference: 'unknown',
        signature: req.headers.get('x-paystack-signature') || 'missing',
        processed: false,
        error_message: validationResult.error,
        created_at: new Date().toISOString()
      })
      
      return new Response(
        JSON.stringify({ error: validationResult.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const event: PaystackEvent = validationResult.event!
    console.log('Processing Paystack event:', event.event, 'Reference:', event.data.reference)

    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess(event, supabase)
        break
        
      case 'subscription.create':
        await handleSubscriptionCreate(event, supabase)
        break
        
      case 'invoice.create':
        await handleInvoiceCreate(event, supabase)
        break
        
      default:
        console.log('Unhandled Paystack event type:', event.event)
    }

    return new Response('Success', { status: 200, headers: corsHeaders })
    
  } catch (error) {
    console.error('Error processing Paystack webhook:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleChargeSuccess(event: PaystackEvent, supabase: any) {
  const { data } = event
  const userId = data.metadata?.user_id
  const productKey = data.metadata?.product_key
  const planType = data.metadata?.plan_type

  if (!userId || !productKey) {
    const errorMsg = 'Missing required metadata for charge processing'
    console.error(errorMsg, { userId, productKey, reference: data.reference })
    
    await logWebhookEvent(supabase, {
      event_type: 'charge.success',
      reference: data.reference,
      signature: 'processed',
      processed: false,
      error_message: errorMsg,
      created_at: new Date().toISOString()
    })
    
    throw new Error(errorMsg)
  }

  try {
    // Check if purchase already processed (idempotency check)
    const { data: existingPurchase, error: checkError } = await supabase
      .from('purchases')
      .select('*')
      .eq('transaction_id', data.reference)
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      throw new Error(`Database error checking purchase: ${checkError.message}`)
    }

    if (existingPurchase) {
      console.log('Purchase already processed, skipping idempotently:', data.reference)
      
      await logWebhookEvent(supabase, {
        event_type: 'charge.success',
        reference: data.reference,
        signature: 'processed',
        processed: true,
        error_message: 'Already processed (idempotent)',
        created_at: new Date().toISOString()
      })
      
      return
    }

  // Determine plan type from product key if not provided
  const finalPlanType = planType || getPlanTypeFromProductKey(productKey)
  const planConfig = getPlanConfig(finalPlanType);
  
  if (!planConfig) {
    console.error('Unknown plan type:', finalPlanType);
    throw new Error('Unknown plan type');
  }

  // Convert canonical plan to legacy license type for database compatibility
  const legacyLicenseType = getLegacyLicenseType(finalPlanType);
  const storageQuotaMB = Math.floor(planConfig.quotaBytes / (1024 * 1024));

  try {
    // Create license
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .insert({
        user_id: userId,
        license_type: legacyLicenseType,
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: finalPlanType === 'lifetime' ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        features: planConfig.features
      })
      .select()
      .single()

    if (licenseError) {
      console.error('Error creating license:', licenseError)
      throw licenseError
    }

    // Create purchase record
    const { error: purchaseError } = await supabase
      .from('purchases')
      .insert({
        user_id: userId,
        license_id: license.id,
        amount: data.amount / 100, // Convert from kobo to Naira
        currency: data.currency || 'NGN',
        payment_method: 'paystack',
        transaction_id: data.reference,
        status: 'completed',
        purchased_at: data.paid_at || new Date().toISOString()
      })

    if (purchaseError) {
      console.error('Error creating purchase:', purchaseError)
      throw purchaseError
    }

    // Update user plan
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        plan_type: finalPlanType,
        storage_quota_mb: storageQuotaMB
      })
      .eq('id', userId)

    if (userUpdateError) {
      console.error('Error updating user:', userUpdateError)
      throw userUpdateError
    }

    // Initialize storage usage if needed
    const { data: storageUsage, error: storageError } = await supabase
      .from('storage_usage')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (storageError && storageError.code === 'PGRST116') {
      await supabase
        .from('storage_usage')
        .insert({
          user_id: userId,
          total_bytes_used: 0,
          asset_count: 0
        })
    }

    console.log('Successfully processed Paystack charge:', data.reference)

    // Log successful processing
    await logWebhookEvent(supabase, {
      event_type: 'charge.success',
      reference: data.reference,
      signature: 'processed',
      processed: true,
      created_at: new Date().toISOString()
    })

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error processing charge'
    console.error('Error processing Paystack charge:', errorMsg)
    
    // Log processing failure
    await logWebhookEvent(supabase, {
      event_type: 'charge.success',
      reference: data.reference,
      signature: 'processed',
      processed: false,
      error_message: errorMsg,
      created_at: new Date().toISOString()
    })
    
    throw error
  }
}

async function handleSubscriptionCreate(event: PaystackEvent, supabase: any) {
  const { data } = event
  console.log('Paystack subscription created:', data.subscription?.subscription_code)
  // Handle subscription creation logic here
}

async function handleInvoiceCreate(event: PaystackEvent, supabase: any) {
  const { data } = event
  console.log('Paystack invoice created:', data.reference)
  // Handle invoice creation logic here
}

function getPlanTypeFromProductKey(productKey: string): string {
  const productMapping: Record<string, string> = {
    'PRO_SUBSCRIPTION': 'pro',
    'LIFETIME': 'lifetime',
    'STORAGE_10GB': 'free' // Storage add-ons don't change plan type
  }
  return productMapping[productKey] || 'free'
}

// Helper function to convert canonical plan to legacy license type
function getLegacyLicenseType(planId: string): 'trial' | 'basic' | 'premium' | 'enterprise' | 'custom' {
  const mapping: Record<string, 'trial' | 'basic' | 'premium' | 'enterprise' | 'custom'> = {
    'guest': 'basic',
    'free': 'basic',
    'pro': 'premium',
    'lifetime': 'enterprise'
  }
  return mapping[planId] || 'basic'
}

async function verifyPaystackSignature(
  payload: string,
  signature: string,
  secretKey: string
): Promise<boolean> {
  try {
    const expectedSignature = await sha512Hex(payload + secretKey)
    return signature === expectedSignature
  } catch (error) {
    console.error('Error verifying Paystack signature:', error)
    return false
  }
}

async function sha512Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-512', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Enhanced webhook validation with replay protection
interface ValidationResult {
  isValid: boolean
  event?: PaystackEvent
  error?: string
}

async function validateWebhookRequest(
  req: Request,
  secretKey: string,
  supabase: any
): Promise<ValidationResult> {
  try {
    // Get signature from headers
    const signature = req.headers.get('x-paystack-signature')
    if (!signature) {
      return { isValid: false, error: 'Missing Paystack signature' }
    }

    // Get raw body
    const body = await req.text()
    
    // Verify signature exactly as per Paystack docs
    const expectedSignature = await sha512Hex(body + secretKey)
    if (signature !== expectedSignature) {
      return { isValid: false, error: 'Invalid signature' }
    }

    // Parse event
    const event: PaystackEvent = JSON.parse(body)
    
    // Check for replay attacks using timestamp
    const eventTimestamp = new Date(event.data.created_at).getTime()
    const currentTime = Date.now()
    const timeDiff = Math.abs(currentTime - eventTimestamp)
    
    if (timeDiff > WEBHOOK_TTL_SECONDS * 1000) {
      return { 
        isValid: false, 
        error: `Event timestamp too old or too far in the future. Age: ${Math.floor(timeDiff / 1000)}s` 
      }
    }

    // Check for duplicate processing using signature + reference
    const duplicateKey = `${signature}_${event.data.reference}`
    const existingTimestamp = processedWebhooks.get(duplicateKey)
    
    if (existingTimestamp && (currentTime - existingTimestamp) < MAX_REPLAY_WINDOW_SECONDS * 1000) {
      return { 
        isValid: false, 
        error: 'Duplicate webhook detected' 
      }
    }

    // Store this webhook signature to prevent replay
    processedWebhooks.set(duplicateKey, currentTime)
    
    // Clean up old entries from memory (prevent memory leaks)
    for (const [key, timestamp] of processedWebhooks.entries()) {
      if (currentTime - timestamp > MAX_REPLAY_WINDOW_SECONDS * 1000) {
        processedWebhooks.delete(key)
      }
    }

    return { isValid: true, event }
    
  } catch (error) {
    console.error('Webhook validation error:', error)
    return { 
      isValid: false, 
      error: error instanceof Error ? error.message : 'Validation failed' 
    }
  }
}

// Enhanced webhook logging for monitoring
async function logWebhookEvent(supabase: any, logData: WebhookLog): Promise<void> {
  try {
    const { error } = await supabase
      .from('webhook_logs')
      .insert(logData)
    
    if (error) {
      console.error('Failed to log webhook event:', error)
    }
  } catch (error) {
    console.error('Error logging webhook event:', error)
  }
}
