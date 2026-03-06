import React, { useState, useEffect } from 'react';
import { User, Mail, LogOut, Loader2, Crown, HardDrive } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { PaymentModal } from '@/components/subscription/PaymentModal';
import { FeatureTeaserCard } from '@/components/upgrade/FeatureTeaserCard';
import { UpgradePromptModal } from '@/components/UpgradePromptModal';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { formatBytes } from '@/lib/utils';
import { toast } from 'sonner';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Form validation schemas
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signUpSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignUpFormData = z.infer<typeof signUpSchema>;

export function AccountModal({ isOpen, onClose }: AccountModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState<{
    title: string;
    message: string;
    action: string;
  } | null>(null);
  
  const { 
    user, 
    plan,
    effectiveLimits,
    isAuthenticated, 
    loading: authLoading, 
    signIn, 
    signUp, 
    signOut,
    initializeAuth 
  } = useAuthStore();

  const { quota } = useCloudStore();

  // Initialize auth on mount if not already done
  useEffect(() => {
    if (authLoading) {
      initializeAuth();
    }
  }, [authLoading, initializeAuth]);

  // Reset form and error when modal opens/closes or mode changes
  useEffect(() => {
    if (isOpen) {
      setAuthError(null);
    }
  }, [isOpen, mode]);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const handleLogin = async (data: LoginFormData) => {
    setIsSubmitting(true);
    setAuthError(null);
    
    try {
      const result = await signIn(data.email, data.password);
      
      if (result.error) {
        setAuthError(result.error);
        toast.error(result.error);
      } else {
        toast.success('Successfully signed in!');
        onClose();
        loginForm.reset();
      }
    } catch (error) {
      const errorMessage = 'An unexpected error occurred during sign in';
      setAuthError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (data: SignUpFormData) => {
    setIsSubmitting(true);
    setAuthError(null);
    
    try {
      const result = await signUp(data.email, data.password);
      
      if (result.error) {
        setAuthError(result.error);
        toast.error(result.error);
      } else {
        toast.success('Account created successfully! Please check your email to verify your account.');
        setMode('login');
        signUpForm.reset();
      }
    } catch (error) {
      const errorMessage = 'An unexpected error occurred during sign up';
      setAuthError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setIsSubmitting(true);
    setAuthError(null);
    
    try {
      await signOut();
      toast.success('Successfully signed out');
      onClose();
    } catch (error) {
      const errorMessage = 'Failed to sign out';
      setAuthError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Plan and Storage Usage Component
  const PlanAndStorageDisplay = () => {
    const storagePercentage = quota.available > 0 ? (quota.used / quota.available) * 100 : 0;
    
    const getPlanDisplay = () => {
      const effectivePlan = effectiveLimits?.source.plan || plan;
      switch (effectivePlan) {
        case 'free':
          return { name: 'Free', color: 'text-gray-600', icon: User };
        case 'pro':
          return { name: 'Pro', color: 'text-blue-600', icon: Crown };
        case 'lifetime':
          return { name: 'Lifetime', color: 'text-purple-600', icon: Crown };
        default:
          return { name: 'Free', color: 'text-gray-600', icon: User };
      }
    };

    const planInfo = getPlanDisplay();
    const PlanIcon = planInfo.icon;

    return (
      <div className="space-y-4">
        {/* Current Plan */}
        <div className="flex items-center justify-between p-3 bg-glass/30 rounded-lg border border-glass-border/30">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${planInfo.color} bg-current/10`}>
              <PlanIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-medium">Current Plan</div>
              <div className={`text-xs font-semibold ${planInfo.color}`}>{planInfo.name}</div>
            </div>
          </div>
          {(effectiveLimits?.source.plan === 'free' || plan === 'free') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPaymentModal(true)}
              className="text-xs"
            >
              Upgrade
            </Button>
          )}
        </div>

        {/* Storage Usage */}
        <div className="p-3 bg-glass/30 rounded-lg border border-glass-border/30">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-4 h-4 text-muted-foreground" />
            <div className="text-sm font-medium">Storage Usage</div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatBytes(quota.used)} used</span>
              <span>{formatBytes(quota.available)} available</span>
            </div>
            
            <Progress 
              value={storagePercentage} 
              className="h-2"
            />
            
            <div className="text-xs text-center text-muted-foreground">
              {storagePercentage.toFixed(1)}% used
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Show loading state while auth is initializing
  if (authLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md glass cosmic-glow border-glass-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Account
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md glass cosmic-glow border-glass-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Account
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!isAuthenticated ? (
            // Logged out state - show forms
            <Card className="glass cosmic-glow border-glass-border/40">
              <CardHeader>
                <CardTitle className="text-lg">
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                </CardTitle>
                <div className="flex gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className={`px-2 py-1 rounded transition-colors ${
                      mode === 'login' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className={`px-2 py-1 rounded transition-colors ${
                      mode === 'signup' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Sign Up
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Display auth error */}
                {authError && (
                  <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                    {authError}
                  </div>
                )}

                {mode === 'login' ? (
                  // Login Form
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                      <FormField
                        control={loginForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter your email"
                                type="email"
                                autoComplete="email"
                                disabled={isSubmitting}
                                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-black dark:text-white"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter your password"
                                type="password"
                                autoComplete="current-password"
                                disabled={isSubmitting}
                                className="bg-background border-input"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          'Sign In'
                        )}
                      </Button>
                    </form>
                  </Form>
                ) : (
                  // Sign Up Form
                  <Form {...signUpForm}>
                    <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
                      <FormField
                        control={signUpForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter your email"
                                type="email"
                                autoComplete="email"
                                disabled={isSubmitting}
                                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-black dark:text-white"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={signUpForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Create a password"
                                type="password"
                                autoComplete="new-password"
                                disabled={isSubmitting}
                                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-black dark:text-white"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={signUpForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm Password</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Confirm your password"
                                type="password"
                                autoComplete="new-password"
                                disabled={isSubmitting}
                                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-black dark:text-white"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Creating account...
                          </>
                        ) : (
                          'Create Account'
                        )}
                      </Button>
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>
          ) : (
            // Logged in state
            <Card className="glass cosmic-glow border-glass-border/40">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Account Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <PlanAndStorageDisplay />
                
                <div className="flex items-center gap-3 p-3 bg-glass/30 rounded-lg border border-glass-border/30">
                  <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Logged in as</div>
                    <div className="text-xs text-muted-foreground">{user?.email}</div>
                  </div>
                </div>

                <Button
                  variant="destructive"
                  onClick={handleLogout}
                  disabled={isSubmitting}
                  className="w-full gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Signing out...
                    </>
                  ) : (
                    <>
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Feature Teaser Cards for Free Users */}
          {isAuthenticated && effectiveLimits?.source.plan === 'free' && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">Upgrade Benefits</div>
              <div className="grid grid-cols-1 gap-3">
                <FeatureTeaserCard 
                  feature="no-ads" 
                  compact={true}
                  onUpgrade={() => {
                    setUpgradePrompt({
                      title: 'Remove Ads',
                      message: 'Enjoy an uninterrupted creative experience with no ads. Upgrade to Premium for an ad-free experience.',
                      action: 'Upgrade Now'
                    });
                    setShowUpgradePrompt(true);
                  }}
                />
                <FeatureTeaserCard 
                  feature="backup" 
                  compact={true}
                  onUpgrade={() => {
                    setUpgradePrompt({
                      title: 'Cloud Backup',
                      message: 'Cloud backup and sync are available for Pro users. Upgrade your plan to automatically backup your work and access it from any device.',
                      action: 'Upgrade to Pro'
                    });
                    setShowUpgradePrompt(true);
                  }}
                />
              </div>
            </div>
          )}

          {/* Footer note */}
          <div className="text-xs text-muted-foreground text-center">
            ⚠️ Authentication is optional - app works fully offline
          </div>
        </div>
      </DialogContent>
      
      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        productKey="PRO_SUBSCRIPTION"
        onSuccess={() => {
          toast.success('Successfully upgraded to Pro!');
          setShowPaymentModal(false);
        }}
      />

      {/* Upgrade Prompt Modal */}
      <UpgradePromptModal
        isOpen={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
        title={upgradePrompt?.title || ''}
        message={upgradePrompt?.message || ''}
        action={upgradePrompt?.action || ''}
        type="plan_limit"
        onAction={() => setShowUpgradePrompt(false)}
      />
    </Dialog>
  );
}
