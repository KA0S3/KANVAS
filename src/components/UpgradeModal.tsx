import React from 'react';
import { X, Cloud, Zap, Crown, Check } from 'lucide-react';
import { PLANS_CONFIG, getPlanConfig } from '@/lib/plans';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan: 'free' | 'pro' | 'lifetime';
  currentUsage: number;
  quotaLimit: number;
  requiredBytes: number;
}

interface Plan {
  id: 'free' | 'pro' | 'lifetime';
  name: string;
  price: string;
  storage: string;
  features: string[];
  icon: React.ReactNode;
  popular?: boolean;
}

export function UpgradeModal({ 
  isOpen, 
  onClose, 
  currentPlan, 
  currentUsage, 
  quotaLimit, 
  requiredBytes 
}: UpgradeModalProps) {
  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const plans = [
    {
      id: 'free',
      name: PLANS_CONFIG.free.label,
      price: '$0',
      storage: '100 MB',
      features: [
        'Local storage',
        'Basic asset management',
        'Community support'
      ],
      icon: <Cloud className="w-5 h-5" />
    },
    {
      id: 'pro',
      name: PLANS_CONFIG.pro.label,
      price: `$${PLANS_CONFIG.pro.pricing.recurringCents! / 100}/month`,
      storage: '10 GB',
      features: [
        'Cloud sync across devices',
        'Automatic backups',
        'Priority support',
        'Advanced sharing',
        'Version history'
      ],
      icon: <Zap className="w-5 h-5" />,
      popular: true
    },
    {
      id: 'lifetime',
      name: PLANS_CONFIG.lifetime.label,
      price: `$${PLANS_CONFIG.lifetime.pricing.oneTimeCents! / 100}`,
      storage: '15 GB',
      features: [
        'Everything in Pro',
        'Lifetime access',
        'All future updates',
        'Priority feature requests'
      ],
      icon: <Crown className="w-5 h-5" />
    }
  ];

  const recommendedPlan = currentPlan === 'free' ? 'pro' : 'lifetime';
  const canUpgrade = currentPlan !== 'lifetime';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold">Storage Quota Exceeded</h2>
            <p className="text-muted-foreground mt-1">
              You need more storage to upload this file
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Status */}
        <div className="p-6 bg-muted/30 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Current Usage</p>
              <p className="text-lg font-semibold">
                {formatBytes(currentUsage)} / {formatBytes(quotaLimit)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">File Size</p>
              <p className="text-lg font-semibold text-destructive">
                +{formatBytes(requiredBytes)}
              </p>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-background rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min((currentUsage / quotaLimit) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Plans */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative border rounded-lg p-6 transition-all ${
                  plan.popular 
                    ? 'border-primary shadow-lg shadow-primary/10' 
                    : 'border-border'
                } ${
                  plan.id === currentPlan 
                    ? 'bg-muted/50' 
                    : 'bg-background'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  {plan.icon}
                  <div>
                    <h3 className="font-semibold">{plan.name}</h3>
                    <p className="text-2xl font-bold">{plan.price}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-lg font-medium text-primary">{plan.storage}</p>
                </div>

                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                    plan.id === currentPlan
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : plan.id === recommendedPlan
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                  disabled={plan.id === currentPlan || !canUpgrade}
                  onClick={() => {
                    if (plan.id !== currentPlan && canUpgrade) {
                      // TODO: Implement upgrade logic
                      console.log(`Upgrade to ${plan.id}`);
                    }
                  }}
                >
                  {plan.id === currentPlan 
                    ? 'Current Plan' 
                    : plan.id === recommendedPlan 
                    ? 'Upgrade Now' 
                    : 'Choose Plan'
                  }
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Need help? Contact our support team for assistance.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // TODO: Implement upgrade to recommended plan
                  console.log(`Upgrade to ${recommendedPlan}`);
                }}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                disabled={!canUpgrade}
              >
                Upgrade to {plans.find(p => p.id === recommendedPlan)?.name}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
