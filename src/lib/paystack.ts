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
    price: 2000, // ₦20.00 in NGN kobo
    storage: '10GB',
    recurring: true
  },
  LIFETIME: {
    name: 'Lifetime',
    price: 30000, // ₦300.00 in NGN kobo
    storage: '15GB',
    recurring: false
  },
  STORAGE_10GB: {
    name: 'Storage 10GB',
    price: 500, // ₦5.00 in NGN kobo
    storage: '10GB',
    recurring: true
  }
}

export class PaystackClient {
  private baseUrl = 'https://api.paystack.co'
  private secretKey: string

  constructor(secretKey?: string) {
    this.secretKey = secretKey || import.meta.env.VITE_PAYSTACK_SECRET_KEY || ''
    if (!this.secretKey) {
      throw new Error('Paystack secret key is required')
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        errorData.message || `Paystack API error: ${response.statusText}`
      )
    }

    return response.json()
  }

  async initializeTransaction(
    email: string,
    amount: number,
    metadata?: Record<string, any>
  ): Promise<PaystackInitializeResponse> {
    return this.makeRequest<PaystackInitializeResponse>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email,
        amount: amount * 100, // Convert to kobo (subunits)
        currency: 'NGN',
        metadata,
        callback_url: `${window.location.origin}/payment/success`,
      }),
    })
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    return this.makeRequest<PaystackVerifyResponse>(
      `/transaction/verify/${reference}`
    )
  }

  async createCustomer(
    email: string,
    firstName?: string,
    lastName?: string
  ): Promise<any> {
    return this.makeRequest('/customer', {
      method: 'POST',
      body: JSON.stringify({
        email,
        first_name: firstName,
        last_name: lastName,
      }),
    })
  }

  async createSubscription(
    customer: string,
    plan: string,
    authorization?: string
  ): Promise<any> {
    return this.makeRequest('/subscription', {
      method: 'POST',
      body: JSON.stringify({
        customer,
        plan,
        authorization,
      }),
    })
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
