export interface PaymentSession {
  reference: string;
  authorization_url?: string;
  access_code?: string;
  session_id?: string;
}

export interface TransactionRequest {
  productId: string;
  userId: string;
  promoCode?: string;
  metadata?: Record<string, any>;
}

export interface TransactionResponse {
  status: boolean;
  message: string;
  data: PaymentSession;
}

export interface VerificationResponse {
  status: boolean;
  message: string;
  data: {
    id: number | string;
    status: string;
    reference: string;
    amount: number;
    paid_at?: string;
    metadata?: Record<string, any>;
  };
}

export interface PaymentProvider {
  createTransaction(request: TransactionRequest): Promise<TransactionResponse>;
  redirectToPayment(session: PaymentSession): void;
  verifyPayment(reference: string): Promise<VerificationResponse>;
}

export interface PaymentsService {
  createTransaction(productId: string, userId: string, options?: {
    promoCode?: string;
    metadata?: Record<string, any>;
  }): Promise<TransactionResponse>;
  redirectToPayment(session: PaymentSession): void;
  verifyPayment(reference: string): Promise<VerificationResponse>;
}
