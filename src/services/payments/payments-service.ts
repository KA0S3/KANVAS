import { PaymentsService, TransactionRequest, TransactionResponse, PaymentSession, VerificationResponse } from './index';
import { PaystackAdapter } from './adapters/paystack-adapter';

class PaymentsServiceImpl implements PaymentsService {
  private provider: PaystackAdapter;

  constructor() {
    this.provider = new PaystackAdapter();
  }

  async createTransaction(
    productId: string, 
    userId: string, 
    options?: {
      promoCode?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<TransactionResponse> {
    const request: TransactionRequest = {
      productId,
      userId,
      promoCode: options?.promoCode,
      metadata: options?.metadata
    };

    return this.provider.createTransaction(request);
  }

  redirectToPayment(session: PaymentSession): void {
    this.provider.redirectToPayment(session);
  }

  async verifyPayment(reference: string): Promise<VerificationResponse> {
    return this.provider.verifyPayment(reference);
  }
}

// Export singleton instance
export const paymentsService = new PaymentsServiceImpl();
export { PaymentsServiceImpl };
