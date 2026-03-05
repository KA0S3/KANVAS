import { supabase } from '@/lib/supabase'

export interface CreateTransactionRequest {
  productId: string
  userId: string
  promoCode?: string
  metadata?: Record<string, any>
}

export interface CreateTransactionResponse {
  status: boolean
  message: string
  data: {
    reference: string
    authorization_url: string
    access_code: string
  }
}

export interface PaystackSession {
  reference: string
  authorization_url: string
  access_code: string
}

export interface VerifyTransactionResponse {
  status: boolean
  message: string
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
    metadata: Record<string, any>
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
    plan?: any
    subscription?: any
  }
}

/**
 * Creates a Paystack transaction by calling the backend endpoint
 */
export async function createTransaction(
  productId: string,
  userId: string,
  meta?: Record<string, any>
): Promise<CreateTransactionResponse> {
  try {
    // Get current user email
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user?.email) {
      throw new Error('User authentication required')
    }

    // Get product details from PAYSTACK_PRODUCTS (imported from lib/paystack)
    const { PAYSTACK_PRODUCTS } = await import('@/lib/paystack')
    const product = PAYSTACK_PRODUCTS[productId]
    
    if (!product) {
      throw new Error(`Invalid product: ${productId}`)
    }

    // Prepare metadata
    const metadata = {
      product_key: productId,
      user_id: userId,
      plan_type: getPlanTypeFromProductKey(productId),
      ...meta
    }

    // Call backend endpoint
    const { data, error } = await supabase.functions.invoke('paystack-initialize', {
      body: {
        email: user.email,
        amount: product.price,
        currency: 'NGN',
        metadata,
        callback_url: `${window.location.origin}/payment/success`
      }
    })

    if (error) {
      throw new Error(error.message || 'Failed to create transaction')
    }

    return data
  } catch (error) {
    console.error('Error creating Paystack transaction:', error)
    throw error
  }
}

/**
 * Launches Paystack inline payment or redirects to Paystack
 */
export function launchPaystackInline(session: PaystackSession): void {
  // Open Paystack payment in popup
  const popup = window.open(
    session.authorization_url,
    'paystack-payment',
    'width=400,height=600,scrollbars=yes,resizable=yes'
  )

  if (!popup) {
    throw new Error('Failed to open payment popup. Please allow popups for this site.')
  }

  // Monitor popup closure
  const checkClosed = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkClosed)
      // Notify parent window about popup closure
      window.postMessage({ type: 'PAYSTACK_CLOSE' }, window.location.origin)
    }
  }, 1000)

  // Listen for messages from the popup
  const messageHandler = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return

    if (event.data.type === 'PAYSTACK_SUCCESS') {
      clearInterval(checkClosed)
      popup.close()
      // Notify parent window about successful payment
      window.postMessage({ 
        type: 'PAYSTACK_SUCCESS', 
        reference: event.data.reference 
      }, window.location.origin)
      window.removeEventListener('message', messageHandler)
    } else if (event.data.type === 'PAYSTACK_CLOSE') {
      clearInterval(checkClosed)
      popup.close()
      window.removeEventListener('message', messageHandler)
    }
  }

  window.addEventListener('message', messageHandler)
}

/**
 * Verifies a Paystack transaction
 */
export async function verifyTransaction(reference: string): Promise<VerifyTransactionResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('paystack-verify', {
      body: { reference }
    })

    if (error) {
      throw new Error(error.message || 'Failed to verify transaction')
    }

    return data
  } catch (error) {
    console.error('Error verifying Paystack transaction:', error)
    throw error
  }
}

/**
 * Helper function to map product keys to plan types
 */
function getPlanTypeFromProductKey(productKey: string): string {
  const productMapping: Record<string, string> = {
    'PRO_SUBSCRIPTION': 'premium',
    'LIFETIME': 'enterprise',
    'STORAGE_10GB': 'basic',
    'STORAGE_50GB': 'basic'
  }
  return productMapping[productKey] || 'basic'
}

/**
 * Generates a transaction reference (client-side fallback)
 */
export function generateTransactionReference(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  return `txn_${timestamp}_${random}`
}
