import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Shield, HardDrive, Archive, Lock } from 'lucide-react';

export interface FeatureTeaserProps {
  feature: 'no-ads' | 'backup' | 'unlimited-worlds' | 'export-zip';
  onUpgrade?: () => void;
  compact?: boolean;
}

const featureConfig = {
  'no-ads': {
    icon: Shield,
    title: 'No Ads',
    description: 'Enjoy an uninterrupted creative experience',
    badge: 'Premium',
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800'
  },
  'backup': {
    icon: HardDrive,
    title: '10GB Cloud Backup',
    description: 'Automatic backups with secure cloud storage',
    badge: 'Pro',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  'unlimited-worlds': {
    icon: Crown,
    title: 'Unlimited Worlds',
    description: 'Create as many worlds as your imagination allows',
    badge: 'Pro',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    borderColor: 'border-purple-200 dark:border-purple-800'
  },
  'export-zip': {
    icon: Archive,
    title: 'Export Full ZIP',
    description: 'Download complete world archives for safekeeping',
    badge: 'Premium',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-950/20',
    borderColor: 'border-orange-200 dark:border-orange-800'
  }
};

export function FeatureTeaserCard({ 
  feature, 
  onUpgrade, 
  compact = false 
}: FeatureTeaserProps) {
  const config = featureConfig[feature];
  const Icon = config.icon;

  if (compact) {
    return (
      <Card className={`glass cosmic-glow border-glass-border/40 hover:border-primary/50 transition-all duration-300 cursor-pointer group ${config.bgColor} ${config.borderColor}`}
            onClick={onUpgrade}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.color} bg-current/10 group-hover:scale-110 transition-transform`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{config.title}</h3>
                <Badge variant="secondary" className="text-xs">
                  <Lock className="w-3 h-3 mr-1" />
                  {config.badge}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`glass cosmic-glow border-glass-border/40 hover:border-primary/50 transition-all duration-300 cursor-pointer group ${config.bgColor} ${config.borderColor}`}
          onClick={onUpgrade}>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${config.color} bg-current/10 group-hover:scale-110 transition-transform`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold">{config.title}</h3>
              <Badge variant="secondary" className="text-xs">
                <Lock className="w-3 h-3 mr-1" />
                {config.badge}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{config.description}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onUpgrade?.();
              }}
            >
              Upgrade to Unlock
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
