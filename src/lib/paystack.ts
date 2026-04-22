import { supabase } from '@/lib/supabase'

export interface PaystackProduct {
  name: string
  price: number
  storage: string
  recurring?: boolean
}

export interface PaystackTransaction {
  reference: string
  amount: number
  currency: string
  status: string
  customer: {
    email: string
    customer_code: string
  }
  metadata?: Record<string, any>
}

export interface PaystackInitializeResponse {
  status: boolean
  message: string
  data: {
    reference: string
    authorization_url: string
    access_code: string
  }
}

export interface PaystackVerifyResponse {
  status: boolean
  message: string
  data: PaystackTransaction
}

export const PAYSTACK_PRODUCTS: Record<string, PaystackProduct> = {
  PRO_SUBSCRIPTION: {
    name: 'Pro Subscription',
    price: 10000, // R100.00 in ZAR cents
    storage: '10GB',
    recurring: true
  },
  LIFETIME: {
    name: 'Lifetime',
    price: 150000, // R1500.00 in ZAR cents
    storage: '15GB',
    recurring: false
  },
  STORAGE_10GB: {
    name: 'Storage 10GB',
    price: 10000, // R100.00 in ZAR cents
    storage: '10GB',
    recurring: false
  },
  STORAGE_50GB: {
    name: 'Storage 50GB',
    price: 25000, // R250.00 in ZAR cents
    storage: '50GB',
    recurring: false
  }
}

export class PaystackClient {
  private baseUrl = 'https://api.paystack.co'

  constructor() {
    // Paystack client will use server-side functions for API calls
    // This is a client-side wrapper that calls Supabase functions
  }

  async initializeTransaction(
    email: string,
    amount: number,
    metadata?: Record<string, any>
  ): Promise<PaystackInitializeResponse> {
    const { data, error } = await supabase.functions.invoke('paystack-initialize', {
      body: {
        email,
        amount: amount * 100, // Convert to cents (subunits)
        currency: 'ZAR',
        metadata,
        callback_url: `${window.location.origin}/payment/success`,
      },
    })

    if (error) {
      throw new Error(error.message || 'Failed to initialize Paystack payment')
    }

    return data
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    const { data, error } = await supabase.functions.invoke('paystack-verify', {
      body: { reference },
    })

    if (error) {
      throw new Error(error.message || 'Failed to verify Paystack transaction')
    }

    return data
  }

  async createCustomer(
    email: string,
    firstName?: string,
    lastName?: string
  ): Promise<any> {
    // This would be implemented via a Supabase function if needed
    throw new Error('Customer creation not implemented on client side')
  }

  async createSubscription(
    customer: string,
    plan: string,
    authorization?: string
  ): Promise<any> {
    // This would be implemented via a Supabase function if needed
    throw new Error('Subscription creation not implemented on client side')
  }

  generateTransactionReference(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 9)
    return `txn_${timestamp}_${random}`
  }
}

// Singleton instance for client-side usage
let paystackClient: PaystackClient | null = null

export function getPaystackClient(): PaystackClient {
  if (!paystackClient) {
    paystackClient = new PaystackClient()
  }
  return paystackClient
}

// Helper function to open Paystack popup
export function openPaystackPopup(
  authorizationUrl: string,
  onClose?: () => void,
  onSuccess?: (reference: string) => void
): void {
  const popup = window.open(
    authorizationUrl,
    'paystack-payment',
    'width=400,height=600,scrollbars=yes,resizable=yes'
  )

  if (!popup) {
    throw new Error('Failed to open payment popup. Please allow popups for this site.')
  }

  const checkClosed = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkClosed)
      onClose?.()
    }
  }, 1000)

  // Listen for messages from the popup
  const messageHandler = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return

    if (event.data.type === 'PAYSTACK_SUCCESS') {
      clearInterval(checkClosed)
      popup.close()
      onSuccess?.(event.data.reference)
      window.removeEventListener('message', messageHandler)
    } else if (event.data.type === 'PAYSTACK_CLOSE') {
      clearInterval(checkClosed)
      popup.close()
      onClose?.()
      window.removeEventListener('message', messageHandler)
    }
  }

  window.addEventListener('message', messageHandler)
}
