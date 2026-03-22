import React, { useState } from 'react';
import { X, Check, Star, ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PLANS_CONFIG, STORAGE_ADDONS } from '@/config/plans';
import { formatPrice } from '@/lib/pricing';
import { useNavigate } from 'react-router-dom';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PricingModal({ isOpen, onClose }: PricingModalProps) {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const plans = [
    PLANS_CONFIG.free,
    PLANS_CONFIG.pro,
    PLANS_CONFIG.lifetime,
  ];

  const handlePlanSelect = (planId: string) => {
    setSelectedPlan(planId);
    // Here you would typically redirect to checkout or handle payment
    console.log('Selected plan:', planId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto glass cosmic-glow border-glass-border/40">
        <DialogHeader className="sticky top-0 bg-glass/90 backdrop-blur-sm z-10 pb-4">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-6 h-6 text-primary" />
              Pricing Plans
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-8">
          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <Card 
                key={plan.id} 
                className={`glass cosmic-glow border-glass-border/40 relative ${
                  plan.id === 'pro' ? 'ring-2 ring-primary/50 scale-105' : ''
                }`}
              >
                {plan.id === 'pro' && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-3 py-1">
                      Most Popular
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-xl font-bold">{plan.label}</CardTitle>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                  <div className="mt-4">
                    {plan.pricing ? (
                      <div className="space-y-1">
                        <div className="text-3xl font-bold text-primary">
                          {formatPrice(plan.pricing.priceCents!, plan.pricing.currency)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {plan.pricing.recurring ? 'per month' : 'one-time payment'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-3xl font-bold text-primary">Free</div>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span>Storage</span>
                      <span className="font-medium">
                        {plan.quotaBytes === -1 ? 'Unlimited' : 
                         plan.quotaBytes === 0 ? 'Local only' :
                         `${(plan.quotaBytes / (1024 * 1024 * 1024)).toFixed(1)}GB`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Books</span>
                      <span className="font-medium">
                        {plan.maxBooks === -1 ? 'Unlimited' : plan.maxBooks}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Max Asset Size</span>
                      <span className="font-medium">
                        {plan.maxAssetSize === -1 ? 'Unlimited' :
                         `${(plan.maxAssetSize / (1024 * 1024)).toFixed(0)}MB`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Ads</span>
                      <span className="font-medium">
                        {plan.adsEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Import/Export</span>
                      <span className="font-medium">
                        {plan.importExportEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-glass-border/30">
                    <div className="text-sm font-medium text-foreground">Features:</div>
                    <div className="space-y-1">
                      {Object.entries(plan.features).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                          <span className="capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button 
                    className="w-full mt-6"
                    variant={plan.id === 'pro' ? 'default' : 'outline'}
                    onClick={() => handlePlanSelect(plan.id)}
                    disabled={plan.id === 'free'}
                  >
                    {plan.id === 'free' ? 'Current Plan' : `Choose ${plan.label}`}
                    {plan.id !== 'free' && <ArrowRight className="w-4 h-4 ml-2" />}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Storage Add-ons */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-foreground">Storage Add-ons</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.values(STORAGE_ADDONS).map((addon) => (
                <Card key={addon.id} className="glass cosmic-glow border-glass-border/40">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-foreground">{addon.label}</h4>
                        <p className="text-sm text-muted-foreground">
                          Additional storage for your account
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary">
                          {formatPrice(addon.priceCents, addon.currency)}
                        </div>
                        <div className="text-sm text-muted-foreground">one-time</div>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-3"
                      onClick={() => handlePlanSelect(addon.id)}
                    >
                      Purchase
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Payment Information */}
          <div className="space-y-4 p-6 border border-glass-border/30 rounded-lg bg-glass/30">
            <h3 className="text-lg font-semibold text-foreground">Payment Information</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <strong>Payment Processor:</strong> All payments are securely processed through Paystack, 
                a trusted payment gateway with industry-standard security measures.
              </p>
              <p>
                <strong>Subscription Management:</strong> PAYG monthly fees are billed in advance on a recurring 30-day cycle and can be 
                cancelled at any time. Your access will continue for 30 days after the previous payment.
              </p>
              <p>
                <strong>Refund Policy:</strong> Digital purchases are delivered immediately and are subject to our strict No-Refund Policy. 
                Refunds are only issued in limited cases such as defective service, duplicate charges, or misrepresentation.
              </p>
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigate('/refund-policy');
                  onClose();
                }}
                className="text-xs"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Refund Policy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigate('/terms-of-service');
                  onClose();
                }}
                className="text-xs"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Terms of Service
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
