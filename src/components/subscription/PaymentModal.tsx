import { useState, useEffect } from 'react';
import { X, CreditCard, Loader2, AlertCircle } from 'lucide-react';
import { PAYSTACK_PRODUCTS, type PaystackProduct, getPaystackClient, openPaystackPopup } from '@/lib/paystack';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  productKey: keyof typeof PAYSTACK_PRODUCTS;
  onSuccess?: () => void;
}

export function PaymentModal({ isOpen, onClose, productKey, onSuccess }: PaymentModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, fetchUserPlan } = useAuthStore();

  const product = PAYSTACK_PRODUCTS[productKey];

  const handlePayment = async () => {
    if (!user) {
      setError('You must be signed in to make a purchase');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Get auth session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      await handlePaystackPayment(session, productKey);

    } catch (err) {
      console.error('Payment error:', err);
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaystackPayment = async (session: any, paystackProductKey: keyof typeof PAYSTACK_PRODUCTS) => {
    const paystackClient = getPaystackClient();
    const product = PAYSTACK_PRODUCTS[paystackProductKey];
    
    try {
      // Initialize Paystack transaction
      const paystackData = await paystackClient.initializeTransaction(
        user.email!,
        product.price,
        {
          product_key: paystackProductKey,
          user_id: user.id,
          plan_type: getPlanTypeFromProductKey(paystackProductKey)
        }
      );

      if (!paystackData.status) {
        throw new Error('Failed to initialize Paystack payment');
      }

      // Open Paystack popup
      openPaystackPopup(
        paystackData.data.authorization_url,
        () => {
          // Popup closed without payment
          console.log('Paystack payment cancelled');
        },
        async (reference: string) => {
          // Payment successful
          try {
            // Verify transaction
            const verifyData = await paystackClient.verifyTransaction(reference);
            
            if (verifyData.status && verifyData.data.status === 'success') {
              // Refresh user plan
              if (user) {
                await fetchUserPlan(user.id);
              }
              onSuccess?.();
              handleClose();
            } else {
              setError('Payment verification failed');
            }
          } catch (verifyError) {
            console.error('Payment verification error:', verifyError);
            setError('Failed to verify payment');
          }
        }
      );
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to initialize Paystack payment');
    }
  };

  const getPlanTypeFromProductKey = (productKey: string): string => {
    const productMapping: Record<string, string> = {
      'PRO_SUBSCRIPTION': 'premium',
      'LIFETIME': 'enterprise',
      'STORAGE_10GB': 'basic'
    };
    return productMapping[productKey] || 'basic';
  };

  const handleClose = () => {
    setError(null);
    setIsProcessing(false);
    onClose();
  };

  // Listen for successful payment return
  useEffect(() => {
    const handlePaymentSuccess = async (event: MessageEvent) => {
      if (event.data.type === 'PAYMENT_SUCCESS') {
        // Refresh user plan after successful payment
        if (user) {
          await fetchUserPlan(user.id);
        }
        onSuccess?.();
        handleClose();
      }
    };

    window.addEventListener('message', handlePaymentSuccess);
    return () => window.removeEventListener('message', handlePaymentSuccess);
  }, [user, fetchUserPlan, onSuccess, handleClose]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md glass cosmic-glow border-glass-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Complete Purchase
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Product Details */}
          <div className="space-y-4">
            <div className="p-4 border border-glass-border/40 rounded-lg bg-glass/30">
              <h3 className="font-semibold text-lg mb-2">{product.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-2xl font-bold">₦{product.price}</span>
                {product.recurring && <span className="text-sm text-muted-foreground">/month</span>}
              </div>
              <div className="text-sm text-muted-foreground">
                Storage: {product.storage}
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Payment Info */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              A secure payment popup will open to complete your payment.
            </p>
            <p className="text-xs text-muted-foreground">
              By continuing, you agree to our terms of service and privacy policy.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePayment}
            disabled={isProcessing || !user}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                Pay ₦{product.price}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
