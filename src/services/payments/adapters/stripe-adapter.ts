import { PaymentProvider, TransactionRequest, TransactionResponse, PaymentSession, VerificationResponse } from '../index';

/**
 * Stripe Adapter - Historical Reference Only
 * 
 * This adapter is kept for historical reference but is NOT used in production.
 * The application has been migrated to use Paystack as the sole payment provider.
 * 
 * This file should not be imported or used in the application runtime.
 */
export class StripeAdapter implements PaymentProvider {
  async createTransaction(request: TransactionRequest): Promise<TransactionResponse> {
    // This method is not implemented as Stripe is no longer used
    throw new Error('Stripe adapter is deprecated. Use Paystack adapter instead.');
  }

  redirectToPayment(session: PaymentSession): void {
    // This method is not implemented as Stripe is no longer used
    throw new Error('Stripe adapter is deprecated. Use Paystack adapter instead.');
  }

  async verifyPayment(reference: string): Promise<VerificationResponse> {
    // This method is not implemented as Stripe is no longer used
    throw new Error('Stripe adapter is deprecated. Use Paystack adapter instead.');
  }
}
