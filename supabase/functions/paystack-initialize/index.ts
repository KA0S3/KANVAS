import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateTransactionRequest {
  email: string
  amount: number
  currency?: string
  metadata?: Record<string, any>
  callback_url?: string
}

interface PaystackInitializeResponse {
  status: boolean
  message: string
  data: {
    reference: string
    authorization_url: string
    access_code: string
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

    // Parse request body
    const body: CreateTransactionRequest = await req.json()
    const { email, amount, currency = 'NGN', metadata, callback_url } = body

    if (!email || !amount) {
      return new Response(
        JSON.stringify({ error: 'Email and amount are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate reference
    const reference = generateTransactionReference()

    // Prepare Paystack request
    const paystackData = {
      email,
      amount: amount * 100, // Convert to kobo (subunits)
      currency,
      reference,
      metadata: metadata || {},
      callback_url: callback_url || `${req.headers.get('origin')}/payment/success`
    }

    console.log('Initializing Paystack transaction:', { email, amount, currency, reference })

    // Call Paystack API
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paystackData)
    })

    const result: PaystackInitializeResponse = await response.json()

    if (!response.ok) {
      console.error('Paystack API error:', result)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to initialize Paystack transaction',
          details: result.message || 'Unknown error'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Paystack transaction initialized successfully:', result.data.reference)

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in paystack-initialize function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function generateTransactionReference(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  return `txn_${timestamp}_${random}`
}
