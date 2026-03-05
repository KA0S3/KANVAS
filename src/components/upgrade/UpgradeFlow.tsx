import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  X, 
  Crown, 
  HardDrive, 
  Archive, 
  Shield, 
  Check, 
  Loader2,
  CreditCard,
  Gift
} from 'lucide-react';
import { PaymentModal } from '@/components/subscription/PaymentModal';
import { toast } from 'sonner';

export type LimitType = 'max-books' | 'upload-blocked' | 'zip-export' | 'ads-removed';

interface UpgradeFlowProps {
  isOpen: boolean;
  onClose: () => void;
  limitType: LimitType;
  currentUsage?: number;
  requiredBytes?: number;
  quotaLimit?: number;
}

const limitConfig = {
  'max-books': {
    title: 'World Limit Reached',
    description: 'You\'ve reached the maximum number of worlds for your plan',
    icon: Crown,
    blockedFeature: 'Create unlimited worlds',
    upgradeBenefit: 'Unlimited world creation'
  },
  'upload-blocked': {
    title: 'Storage Quota Exceeded',
    description: 'You need more storage to upload this file',
    icon: HardDrive,
    blockedFeature: 'Upload larger files',
    upgradeBenefit: '10GB cloud storage'
  },
  'zip-export': {
    title: 'Export Restricted',
    description: 'Full ZIP export is a premium feature',
    icon: Archive,
    blockedFeature: 'Export complete world archives',
    upgradeBenefit: 'Full ZIP export access'
  },
  'ads-removed': {
    title: 'Remove Ads',
    description: 'Enjoy an uninterrupted creative experience',
    icon: Shield,
    blockedFeature: 'Ad-free experience',
    upgradeBenefit: 'No ads, ever'
  }
};

export function UpgradeFlow({ 
  isOpen, 
  onClose, 
  limitType, 
  currentUsage = 0,
  requiredBytes = 0,
  quotaLimit = 0 
}: UpgradeFlowProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);

  const config = limitConfig[limitType];
  const Icon = config.icon;

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    
    setIsApplyingPromo(true);
    try {
      // TODO: Implement promo code validation
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Promo code applied successfully!');
      setStep(2);
    } catch (error) {
      toast.error('Invalid promo code');
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handleUpgrade = () => {
    setShowPaymentModal(true);
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">{config.title}</h3>
          <p className="text-muted-foreground mt-2">{config.description}</p>
        </div>
      </div>

      {limitType === 'upload-blocked' && (
        <Alert>
          <AlertDescription className="space-y-2">
            <div className="flex justify-between">
              <span>Current Usage:</span>
              <span className="font-medium">{formatBytes(currentUsage)}</span>
            </div>
            <div className="flex justify-between">
              <span>File Size:</span>
              <span className="font-medium text-destructive">+{formatBytes(requiredBytes)}</span>
            </div>
            <div className="flex justify-between">
              <span>Available:</span>
              <span className="font-medium">{formatBytes(quotaLimit)}</span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card className="glass cosmic-glow border-glass-border/40">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            Upgrade to Pro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span className="text-sm">{config.upgradeBenefit}</span>
            </div>
            <div className="flex items-center gap-3">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span className="text-sm">10GB cloud storage</span>
            </div>
            <div className="flex items-center gap-3">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span className="text-sm">Priority support</span>
            </div>
            <div className="flex items-center gap-3">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span className="text-sm">Version history</span>
            </div>
          </div>
          
          <div className="pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl font-bold">$9<span className="text-sm font-normal text-muted-foreground">/month</span></span>
              <Badge variant="secondary">Most Popular</Badge>
            </div>
            
            <Button 
              onClick={() => setStep(2)}
              className="w-full"
              size="lg"
            >
              Upgrade Now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <CreditCard className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">Complete Your Upgrade</h3>
          <p className="text-muted-foreground mt-2">Choose your payment method</p>
        </div>
      </div>

      <Card className="glass cosmic-glow border-glass-border/40">
        <CardHeader>
          <CardTitle className="text-lg">Have a promo code?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="promo">Promo Code</Label>
            <div className="flex gap-2">
              <Input
                id="promo"
                placeholder="Enter promo code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="flex-1"
              />
              <Button 
                variant="outline" 
                onClick={handleApplyPromo}
                disabled={isApplyingPromo || !promoCode.trim()}
              >
                {isApplyingPromo ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Gift className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Button 
          onClick={handleUpgrade}
          className="w-full"
          size="lg"
        >
          <CreditCard className="w-4 h-4 mr-2" />
          Pay with Paystack
        </Button>
        
        <Button 
          variant="outline" 
          onClick={() => setStep(3)}
          className="w-full"
        >
          <HardDrive className="w-4 h-4 mr-2" />
          Buy Storage Add-ons
        </Button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <HardDrive className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">Storage Add-ons</h3>
          <p className="text-muted-foreground mt-2">Get extra storage without upgrading</p>
        </div>
      </div>

      <div className="grid gap-4">
        {[
          { size: '1GB', price: '$2', storage: 1024 * 1024 * 1024 },
          { size: '5GB', price: '$8', storage: 5 * 1024 * 1024 * 1024 },
          { size: '10GB', price: '$15', storage: 10 * 1024 * 1024 * 1024 }
        ].map((addon) => (
          <Card key={addon.size} className="glass cosmic-glow border-glass-border/40 hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{addon.size} Storage</div>
                  <div className="text-sm text-muted-foreground">One-time purchase</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold">{addon.price}</div>
                  <Button size="sm" variant="outline">
                    Buy Now
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button 
        variant="outline" 
        onClick={() => setStep(2)}
        className="w-full"
      >
        Back to Payment Options
      </Button>
    </div>
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md glass cosmic-glow border-glass-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Upgrade Required</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-[400px]">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
          </div>
        </DialogContent>
      </Dialog>

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        productKey="PRO_SUBSCRIPTION"
        onSuccess={() => {
          toast.success('Successfully upgraded to Pro!');
          setShowPaymentModal(false);
          onClose();
        }}
      />
    </>
  );
}
