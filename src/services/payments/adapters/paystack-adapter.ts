import { PaymentProvider, TransactionRequest, TransactionResponse, PaymentSession, VerificationResponse } from '../index';
import { supabase } from '@/lib/supabase';

export class PaystackAdapter implements PaymentProvider {
  async createTransaction(request: TransactionRequest): Promise<TransactionResponse> {
    try {
      // Get current user email
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user?.email) {
        throw new Error('User authentication required')
      }

      // Get product details from PAYSTACK_PRODUCTS
      const { PAYSTACK_PRODUCTS } = await import('@/lib/paystack')
      const product = PAYSTACK_PRODUCTS[request.productId]
      
      if (!product) {
        throw new Error(`Invalid product: ${request.productId}`)
      }

      // Prepare metadata
      const metadata = {
        product_key: request.productId,
        user_id: request.userId,
        plan_type: this.getPlanTypeFromProductKey(request.productId),
        ...request.metadata
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

      return {
        status: data.status,
        message: data.message,
        data: {
          reference: data.data.reference,
          authorization_url: data.data.authorization_url,
          access_code: data.data.access_code
        }
      }
    } catch (error) {
      console.error('Error creating Paystack transaction:', error)
      throw error
    }
  }

  redirectToPayment(session: PaymentSession): void {
    if (!session.authorization_url) {
      throw new Error('No authorization URL provided')
    }

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
        window.postMessage({ type: 'PAYSTACK_CLOSE' }, window.location.origin)
      }
    }, 1000)

    // Listen for messages from the popup
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return

      if (event.data.type === 'PAYSTACK_SUCCESS') {
        clearInterval(checkClosed)
        popup.close()
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

  async verifyPayment(reference: string): Promise<VerificationResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('paystack-verify', {
        body: { reference }
      })

      if (error) {
        throw new Error(error.message || 'Failed to verify transaction')
      }

      return {
        status: data.status,
        message: data.message,
        data: {
          id: data.data.id,
          status: data.data.status,
          reference: data.data.reference,
          amount: data.data.amount,
          paid_at: data.data.paid_at,
          metadata: data.data.metadata
        }
      }
    } catch (error) {
      console.error('Error verifying Paystack transaction:', error)
      throw error
    }
  }

  private getPlanTypeFromProductKey(productKey: string): string {
    const productMapping: Record<string, string> = {
      'PRO_SUBSCRIPTION': 'premium',
      'LIFETIME': 'enterprise',
      'STORAGE_10GB': 'basic',
      'STORAGE_50GB': 'basic'
    }
    return productMapping[productKey] || 'basic'
  }
}
