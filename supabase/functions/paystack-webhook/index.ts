import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PlanConfig {
  licenseType: 'trial' | 'basic' | 'premium' | 'enterprise' | 'custom'
  storageQuotaMB: number
  features: Record<string, any>
}

const PLAN_CONFIGS: Record<string, PlanConfig> = {
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

    // Verify Paystack webhook signature
    const signature = req.headers.get('x-paystack-signature')
    if (!signature) {
      console.error('Missing Paystack signature')
      return new Response(
        JSON.stringify({ error: 'Missing signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.text()
    const isValidSignature = await verifyPaystackSignature(body, signature, paystackSecretKey)
    
    if (!isValidSignature) {
      console.error('Invalid Paystack signature')
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const event: PaystackEvent = JSON.parse(body)
    console.log('Processing Paystack event:', event.event)

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
    console.error('Missing required metadata:', { userId, productKey })
    throw new Error('Invalid transaction metadata')
  }

  // Check if purchase already processed
  const { data: existingPurchase } = await supabase
    .from('purchases')
    .select('*')
    .eq('transaction_id', data.reference)
    .single()

  if (existingPurchase) {
    console.log('Purchase already processed, skipping...')
    return
  }

  // Determine plan type from product key if not provided
  const finalPlanType = planType || getPlanTypeFromProductKey(productKey)
  const planConfig = PLAN_CONFIGS[finalPlanType]
  
  if (!planConfig) {
    console.error('Unknown plan type:', finalPlanType)
    throw new Error('Unknown plan type')
  }

  try {
    // Create license
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .insert({
        user_id: userId,
        license_type: planConfig.licenseType,
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: finalPlanType === 'enterprise' ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
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
        storage_quota_mb: planConfig.storageQuotaMB
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

  } catch (error) {
    console.error('Error processing Paystack charge:', error)
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
    'PRO_SUBSCRIPTION': 'premium',
    'LIFETIME': 'enterprise',
    'STORAGE_10GB': 'basic'
  }
  return productMapping[productKey] || 'basic'
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
