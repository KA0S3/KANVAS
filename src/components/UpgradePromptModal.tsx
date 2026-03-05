import React, { useState, useEffect } from 'react';
import { X, Crown, Zap, User, CreditCard, Loader2, AlertCircle, Tag, ChevronDown, ChevronUp, Database, Shield, Globe, BookOpen } from 'lucide-react';
import { PAYSTACK_PRODUCTS, type PaystackProduct } from '@/lib/paystack';
import { createTransaction, launchPaystackInline, verifyTransaction, type PaystackSession } from '@/services/payments/paystack';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';

interface UpgradePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  action: string;
  onAction?: () => void;
  type: 'guest' | 'plan_limit';
}

interface PromoCodeData {
  code: string;
  valid: boolean;
  discountAmount?: number;
  adjustedPrice?: number;
  type?: 'percentage' | 'fixed' | 'free_plan';
  error?: string;
}

export function UpgradePromptModal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  action,
  onAction,
  type
}: UpgradePromptModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [isPromoOpen, setIsPromoOpen] = useState(false);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<PromoCodeData | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [finalPrice, setFinalPrice] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<keyof typeof PAYSTACK_PRODUCTS>('PRO_SUBSCRIPTION');
  
  const { user, fetchUserPlan } = useAuthStore();
  const { toast } = useToast();

  const product = PAYSTACK_PRODUCTS[selectedProduct];
  const currentPrice = finalPrice || product.price;

  const premiumFeatures = [
    {
      icon: <Shield className="w-4 h-4" />,
      title: "No Ads",
      description: "Enjoy an ad-free experience"
    },
    {
      icon: <Database className="w-4 h-4" />,
      title: "Import/Export Full",
      description: "Complete data import and export capabilities"
    },
    {
      icon: <Globe className="w-4 h-4" />,
      title: "Cloud Backup",
      description: "Automatic cloud backups and sync"
    },
    {
      icon: <BookOpen className="w-4 h-4" />,
      title: "Unlimited Books",
      description: "Create unlimited books and worlds"
    },
    {
      icon: <Database className="w-4 h-4" />,
      title: "More Storage",
      description: "10GB cloud storage (upgradeable)"
    }
  ];

  const handlePayment = async () => {
    if (!user) {
      setError('You must be signed in to make a purchase');
      return;
    }

    // If we have an applied free plan promo, bypass payment
    if (appliedPromo && appliedPromo.type === 'free_plan') {
      setIsProcessing(true);
      setError(null);
      
      try {
        const result = await applyPromoCode();
        if (result.success) {
          toast({
            title: "Success!",
            description: result.message,
          });
          await fetchUserPlan(user.id);
          onAction?.();
          handleClose();
        } else {
          setError(result.error || 'Failed to apply promo code');
        }
      } catch (err) {
        console.error('Promo application error:', err);
        setError(err instanceof Error ? err.message : 'Failed to apply promo code');
      } finally {
        setIsProcessing(false);
      }
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

      await handlePaystackPayment(selectedProduct);

    } catch (err) {
      console.error('Payment error:', err);
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaystackPayment = async (productKey: keyof typeof PAYSTACK_PRODUCTS) => {
    try {
      // Create Paystack transaction using new service
      const transactionData = await createTransaction(
        productKey,
        user.id,
        {
          promo_code: promoCode,
          discount_amount: discountAmount
        }
      );

      if (!transactionData.status) {
        throw new Error('Failed to initialize Paystack payment');
      }

      // Launch Paystack inline payment
      const session: PaystackSession = {
        reference: transactionData.data.reference,
        authorization_url: transactionData.data.authorization_url,
        access_code: transactionData.data.access_code
      };
      
      launchPaystackInline(session);

    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to initialize Paystack payment');
    }
  };

  const handleClose = () => {
    setError(null);
    setIsProcessing(false);
    setPromoCode('');
    setAppliedPromo(null);
    setDiscountAmount(0);
    setFinalPrice(0);
    setIsPromoOpen(false);
    onClose();
  };

  const validatePromoCode = async () => {
    if (!promoCode.trim() || !user) return;

    setIsApplyingPromo(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-promo`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: promoCode,
            userId: user.id,
            productKey: selectedProduct
          })
        }
      );

      const result = await response.json();

      if (result.valid) {
        setAppliedPromo(result.promoCode);
        setDiscountAmount(result.discountAmount || 0);
        setFinalPrice(result.adjustedPrice || product.price);
        toast({
          title: "Promo Code Applied!",
          description: result.discountAmount 
            ? `You saved ₦${result.discountAmount}`
            : "Promo code applied successfully",
        });
      } else {
        setError(result.error || 'Invalid promo code');
      }
    } catch (err) {
      console.error('Promo validation error:', err);
      setError('Failed to validate promo code');
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const applyPromoCode = async () => {
    if (!appliedPromo || !user) {
      return { success: false, error: 'No promo code applied' };
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/apply-promo`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: appliedPromo.code,
            userId: user.id,
            productKey: selectedProduct,
            originalPrice: product.price
          })
        }
      );

      const result = await response.json();
      return result;
    } catch (err) {
      console.error('Promo application error:', err);
      return { success: false, error: 'Failed to apply promo code' };
    }
  };

  const removePromoCode = () => {
    setPromoCode('');
    setAppliedPromo(null);
    setDiscountAmount(0);
    setFinalPrice(0);
  };

  const handleStorageAddon = () => {
    // Open storage addon purchase
    setSelectedProduct('STORAGE_10GB');
  };

  // Listen for successful payment return
  useEffect(() => {
    const handlePaymentSuccess = async (event: MessageEvent) => {
      if (event.data.type === 'PAYSTACK_SUCCESS') {
        // Refresh user plan after successful payment
        if (user) {
          await fetchUserPlan(user.id);
        }
        onAction?.();
        handleClose();
      }
    };

    window.addEventListener('message', handlePaymentSuccess);
    return () => window.removeEventListener('message', handlePaymentSuccess);
  }, [user, fetchUserPlan, onAction, handleClose]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg glass cosmic-glow border-glass-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              type === 'guest' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
            }`}>
              {type === 'guest' ? (
                <User className="w-5 h-5" />
              ) : (
                <Crown className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
            </div>
            <button
              onClick={handleClose}
              className="ml-auto p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Message */}
          <p className="text-muted-foreground">{message}</p>
          
          {/* Premium Features */}
          <div className="bg-muted/30 rounded-lg p-4">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Premium Features
            </h3>
            <div className="space-y-3">
              {premiumFeatures.map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="text-green-500 mt-0.5">
                    {feature.icon}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{feature.title}</div>
                    <div className="text-xs text-muted-foreground">{feature.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Product Selection */}
          <div className="space-y-3">
            <Label>Choose Your Plan</Label>
            <div className="grid grid-cols-1 gap-3">
              <div
                className={`p-3 border rounded-lg cursor-pointer transition-all ${
                  selectedProduct === 'PRO_SUBSCRIPTION' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:bg-muted/50'
                }`}
                onClick={() => setSelectedProduct('PRO_SUBSCRIPTION')}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Pro Subscription</div>
                    <div className="text-sm text-muted-foreground">10GB Storage • All Features</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">₦{PAYSTACK_PRODUCTS.PRO_SUBSCRIPTION.price}</div>
                    <div className="text-xs text-muted-foreground">/month</div>
                  </div>
                </div>
              </div>
              
              <div
                className={`p-3 border rounded-lg cursor-pointer transition-all ${
                  selectedProduct === 'LIFETIME' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:bg-muted/50'
                }`}
                onClick={() => setSelectedProduct('LIFETIME')}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Lifetime Access</div>
                    <div className="text-sm text-muted-foreground">15GB Storage • Pay Once</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">₦{PAYSTACK_PRODUCTS.LIFETIME.price}</div>
                    <div className="text-xs text-green-600">Best Value</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Storage Addon */}
          <div className="flex items-center justify-between p-3 border border-dashed border-border rounded-lg">
            <div>
              <div className="font-medium text-sm">Need More Storage?</div>
              <div className="text-xs text-muted-foreground">Add 10GB or 50GB to any plan</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStorageAddon}
            >
              <Database className="w-4 h-4 mr-2" />
              Add Storage
            </Button>
          </div>

          {/* Promo Code Section */}
          <Collapsible open={isPromoOpen} onOpenChange={setIsPromoOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between text-sm"
                disabled={!!appliedPromo}
              >
                <span className="flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  {appliedPromo ? 'Promo code applied' : 'Have a promo code?'}
                </span>
                {isPromoOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 mt-3">
              <div className="space-y-2">
                <Label htmlFor="promo-code">Promo Code</Label>
                <div className="flex gap-2">
                  <Input
                    id="promo-code"
                    placeholder="Enter promo code"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    disabled={isApplyingPromo || !!appliedPromo}
                    className="flex-1"
                  />
                  {!appliedPromo ? (
                    <Button
                      onClick={validatePromoCode}
                      disabled={!promoCode.trim() || isApplyingPromo}
                      size="sm"
                    >
                      {isApplyingPromo ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Apply'
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={removePromoCode}
                      variant="outline"
                      size="sm"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Applied Promo Display */}
          {appliedPromo && (
            <div className="p-3 bg-green-50 border border-green-200 rounded text-sm">
              <div className="flex items-center gap-2 text-green-700">
                <Tag className="w-4 h-4" />
                Promo code applied: {appliedPromo.code}
              </div>
              {appliedPromo.type === 'free_plan' && (
                <div className="text-green-600 mt-1">Free plan granted!</div>
              )}
              {discountAmount > 0 && (
                <div className="text-green-600 mt-1">You saved ₦{discountAmount}</div>
              )}
            </div>
          )}

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
                {appliedPromo?.type === 'free_plan' ? 'Granting...' : 'Processing...'}
              </>
            ) : appliedPromo?.type === 'free_plan' ? (
              <>
                <Tag className="w-4 h-4 mr-2" />
                Grant Free Plan
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                Upgrade with Paystack ₦{currentPrice}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
