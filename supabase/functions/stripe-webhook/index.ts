import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@14.21.0"

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
})

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

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

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id
  const planType = session.metadata?.plan_type
  
  if (!userId || !planType) {
    console.error('Missing required metadata:', { userId, planType })
    return new Response('Invalid session metadata', { status: 400 })
  }

  const planConfig = PLAN_CONFIGS[planType]
  if (!planConfig) {
    console.error('Unknown plan type:', planType)
    return new Response('Unknown plan type', { status: 400 })
  }

  try {
    const { data: existingPurchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('*')
      .eq('transaction_id', session.payment_intent as string)
      .single()

    if (existingPurchase) {
      console.log('Purchase already processed, skipping...')
      return new Response('Already processed', { status: 200 })
    }

    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .insert({
        user_id: userId,
        license_type: planConfig.licenseType,
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: planType === 'enterprise' ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        features: planConfig.features
      })
      .select()
      .single()

    if (licenseError) {
      console.error('Error creating license:', licenseError)
      throw licenseError
    }

    const { error: purchaseInsertError } = await supabase
      .from('purchases')
      .insert({
        user_id: userId,
        license_id: license.id,
        amount: session.amount_total ? session.amount_total / 100 : 0,
        currency: session.currency || 'USD',
        payment_method: 'stripe',
        transaction_id: session.payment_intent as string,
        status: 'completed',
        purchased_at: new Date().toISOString()
      })

    if (purchaseInsertError) {
      console.error('Error creating purchase:', purchaseInsertError)
      throw purchaseInsertError
    }

    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        plan_type: planType,
        storage_quota_mb: planConfig.storageQuotaMB
      })
      .eq('id', userId)

    if (userUpdateError) {
      console.error('Error updating user:', userUpdateError)
      throw userUpdateError
    }

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

    console.log('Successfully processed checkout session:', session.id)
    return new Response('Success', { status: 200 })

  } catch (error) {
    console.error('Error processing checkout session:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscription = invoice.subscription as string
  const customerId = invoice.customer as string

  if (!subscription || !customerId) {
    console.error('Missing subscription or customer ID')
    return new Response('Missing subscription data', { status: 400 })
  }

  try {
    const { data: existingPurchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('*')
      .eq('transaction_id', invoice.payment_intent as string)
      .single()

    if (existingPurchase) {
      console.log('Invoice payment already processed, skipping...')
      return new Response('Already processed', { status: 200 })
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(subscription)
    const userId = stripeSubscription.metadata?.user_id
    const planType = stripeSubscription.metadata?.plan_type

    if (!userId || !planType) {
      console.error('Missing subscription metadata')
      return new Response('Missing subscription metadata', { status: 400 })
    }

    const planConfig = PLAN_CONFIGS[planType]
    if (!planConfig) {
      console.error('Unknown plan type in subscription:', planType)
      return new Response('Unknown plan type', { status: 400 })
    }

    const { data: existingLicense, error: licenseCheckError } = await supabase
      .from('licenses')
      .select('*')
      .eq('user_id', userId)
      .eq('license_type', planConfig.licenseType)
      .eq('status', 'active')
      .single()

    let licenseId: string

    if (existingLicense) {
      const newExpiresAt = planType === 'enterprise' 
        ? null 
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

      const { data: updatedLicense, error: licenseUpdateError } = await supabase
        .from('licenses')
        .update({
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingLicense.id)
        .select()
        .single()

      if (licenseUpdateError) {
        console.error('Error updating license:', licenseUpdateError)
        throw licenseUpdateError
      }

      licenseId = updatedLicense.id
    } else {
      const { data: newLicense, error: licenseCreateError } = await supabase
        .from('licenses')
        .insert({
          user_id: userId,
          license_type: planConfig.licenseType,
          status: 'active',
          starts_at: new Date().toISOString(),
          expires_at: planType === 'enterprise' ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          features: planConfig.features
        })
        .select()
        .single()

      if (licenseCreateError) {
        console.error('Error creating license:', licenseCreateError)
        throw licenseCreateError
      }

      licenseId = newLicense.id
    }

    const { error: purchaseInsertError } = await supabase
      .from('purchases')
      .insert({
        user_id: userId,
        license_id: licenseId,
        amount: invoice.amount_paid ? invoice.amount_paid / 100 : 0,
        currency: invoice.currency || 'USD',
        payment_method: 'stripe',
        transaction_id: invoice.payment_intent as string,
        status: 'completed',
        purchased_at: new Date().toISOString()
      })

    if (purchaseInsertError) {
      console.error('Error creating purchase from invoice:', purchaseInsertError)
      throw purchaseInsertError
    }

    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        plan_type: planType,
        storage_quota_mb: planConfig.storageQuotaMB
      })
      .eq('id', userId)

    if (userUpdateError) {
      console.error('Error updating user from invoice:', userUpdateError)
      throw userUpdateError
    }

    console.log('Successfully processed invoice payment:', invoice.id)
    return new Response('Success', { status: 200 })

  } catch (error) {
    console.error('Error processing invoice payment:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  
  if (!signature) {
    return new Response('No signature', { status: 400 })
  }

  const body = await req.text()
  
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  console.log('Processing webhook event:', event.type)

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break
        
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
        
      default:
        console.log('Unhandled event type:', event.type)
        return new Response('Unhandled event type', { status: 200 })
    }

    return new Response('Success', { status: 200 })
    
  } catch (error) {
    console.error('Error processing webhook:', error)
    return new Response('Internal server error', { status: 500 })
  }
})
