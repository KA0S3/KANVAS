import React, { useState, useEffect } from 'react';
import { User, Mail, LogOut, Loader2, Crown, HardDrive, Shield, Lock, ExternalLink } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
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
import { CheckEmailView } from '@/components/auth/CheckEmailView';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { formatBytes } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';

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
    initializeAuth,
    refreshUserData,
    isVerificationPending,
    verificationEmail,
    setVerificationPending
  } = useAuthStore();

  const { quota } = useCloudStore();

  // Initialize auth on mount if not already done
  useEffect(() => {
    if (authLoading) {
      initializeAuth();
    }
  }, [authLoading, initializeAuth]);

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

  // Reset form and error when modal opens/closes or mode changes
  useEffect(() => {
    if (isOpen) {
      setAuthError(null);
      loginForm.reset();
      signUpForm.reset();
    }
  }, [isOpen, mode, loginForm, signUpForm]);

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

  const handleResendVerification = async () => {
    if (!verificationEmail) return;
    
    setIsSubmitting(true);
    setAuthError(null);
    
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: verificationEmail,
        options: {
          emailRedirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/confirm`,
        }
      });

      if (error) {
        setAuthError(error.message);
        toast.error(error.message);
      } else {
        toast.success('Verification email resent! Please check your inbox.');
      }
    } catch (error) {
      const errorMessage = 'Failed to resend verification email';
      setAuthError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    setVerificationPending(false, undefined);
    setMode('login');
  };

  const handleSignUpFromError = () => {
    // Get the current email from login form
    const currentEmail = loginForm.getValues('email');
    
    // Set the email in sign up form
    signUpForm.setValue('email', currentEmail);
    
    // Switch to signup mode
    setMode('signup');
    
    // Clear the auth error
    setAuthError(null);
  };

  const handleLogout = async () => {
    setIsSubmitting(true);
    setAuthError(null);
    
    try {
      console.log('[AccountModal] Starting logout process');
      await signOut();
      console.log('[AccountModal] Sign out completed successfully');
      toast.success('Successfully signed out');
      onClose();
    } catch (error) {
      console.error('[AccountModal] Logout error:', error);
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
        <DialogContent className="max-w-6xl w-[95vw] glass cosmic-glow border-glass-border/40 max-h-[90vh] overflow-hidden flex flex-col">
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
      <DialogContent className="max-w-6xl w-[95vw] glass cosmic-glow border-glass-border/40 max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Account
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pb-4">
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
                  <div className="space-y-3">
                    <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                      {authError}
                    </div>
                    
                    {/* Show Sign Up button for invalid credentials error */}
                    {authError.includes('Invalid login credentials') && (
                      <div className="flex flex-col items-center space-y-2">
                        <p className="text-sm text-muted-foreground text-center">
                          Don't have an account yet?
                        </p>
                        <Button
                          onClick={handleSignUpFromError}
                          variant="outline"
                          className="w-full"
                        >
                          Sign Up with this email
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {isVerificationPending ? (
                  // Show verification pending view
                  <CardContent className="p-6">
                    <CheckEmailView
                      email={verificationEmail}
                      onResend={handleResendVerification}
                      isResending={isSubmitting}
                      onBackToLogin={handleBackToLogin}
                    />
                  </CardContent>
                ) : (
                  // Show login/signup forms
                  <>
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
                  <Form {...signUpForm} key="signup-form">
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
                                className="bg-background border-input"
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
                                className="bg-background border-input"
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
                            Creating account...
                          </>
                        ) : (
                          'Create Account'
                        )}
                      </Button>
                    </form>
                  </Form>
                )}
                </>
              )}
              </CardContent>

              {/* Policy Links */}
              <div className="pt-4 border-t border-glass-border/30">
                <div className="text-xs text-muted-foreground text-center mb-3">
                  By creating an account, you agree to our:
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open('/terms-of-service', '_blank')}
                    className="text-xs text-muted-foreground hover:text-foreground justify-center"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Terms of Service
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open('/privacy-policy', '_blank')}
                    className="text-xs text-muted-foreground hover:text-foreground justify-center"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Privacy Policy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open('/refund-policy', '_blank')}
                    className="text-xs text-muted-foreground hover:text-foreground justify-center"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Refund & Cancellation Policy
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            // Logged in state - Dashboard Layout
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {/* Account Info Card */}
                <div className="relative group transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1">
                  <div className="relative bg-white/5 dark:bg-gray-800/5 backdrop-blur-sm border rounded-xl p-6 hover:bg-white/10 dark:hover:bg-gray-700/10 hover:shadow-xl transition-all duration-300 border-white/10 dark:border-gray-700/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Account Info</h3>
                        <p className="text-sm text-muted-foreground">Profile details</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-glass/30 rounded-lg border border-glass-border/30">
                        <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">Logged in as</div>
                          <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
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
                    </div>
                  </div>
                </div>

                {/* Storage Usage Card */}
                <div className="relative group transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1">
                  <div className="relative bg-white/5 dark:bg-gray-800/5 backdrop-blur-sm border rounded-xl p-6 hover:bg-white/10 dark:hover:bg-gray-700/10 hover:shadow-xl transition-all duration-300 border-white/10 dark:border-gray-700/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center">
                        <HardDrive className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Storage Usage</h3>
                        <p className="text-sm text-muted-foreground">Cloud storage</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="p-3 bg-glass/30 rounded-lg border border-glass-border/30">
                        <div className="flex items-center gap-2 mb-3">
                          <HardDrive className="w-4 h-4 text-muted-foreground" />
                          <div className="text-sm font-medium">Usage Overview</div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{formatBytes(quota.used)} used</span>
                            <span>{formatBytes(quota.available)} total</span>
                          </div>
                          
                          <Progress 
                            value={quota.available > 0 ? (quota.used / quota.available) * 100 : 0} 
                            className="h-2"
                          />
                          
                          <div className="text-xs text-center text-muted-foreground">
                            {quota.available > 0 ? ((quota.used / quota.available) * 100).toFixed(1) : 0}% used
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Current Plan Card */}
                <div className="relative group transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1">
                  <div className="relative bg-white/5 dark:bg-gray-800/5 backdrop-blur-sm border rounded-xl p-6 hover:bg-white/10 dark:hover:bg-gray-700/10 hover:shadow-xl transition-all duration-300 border-white/10 dark:border-gray-700/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
                        <Crown className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Current Plan</h3>
                        <p className="text-sm text-muted-foreground">Subscription status</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="p-3 bg-glass/30 rounded-lg border border-glass-border/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              (effectiveLimits?.source.plan === 'pro' || plan === 'pro') ? 'text-blue-600' : 
                              (effectiveLimits?.source.plan === 'lifetime' || plan === 'lifetime') ? 'text-purple-600' : 
                              'text-gray-600'
                            } bg-current/10`}>
                              {(effectiveLimits?.source.plan === 'pro' || plan === 'pro') || 
                               (effectiveLimits?.source.plan === 'lifetime' || plan === 'lifetime') ? 
                                <Crown className="w-4 h-4" /> : 
                                <User className="w-4 h-4" />
                            }
                            </div>
                            <div>
                              <div className="text-sm font-medium">
                                {(effectiveLimits?.source.plan === 'pro' || plan === 'pro') ? 'Pro' : 
                                 (effectiveLimits?.source.plan === 'lifetime' || plan === 'lifetime') ? 'Lifetime' : 
                                 'Free'}
                              </div>
                              <div className={`text-xs font-semibold ${
                                (effectiveLimits?.source.plan === 'pro' || plan === 'pro') ? 'text-blue-600' : 
                                (effectiveLimits?.source.plan === 'lifetime' || plan === 'lifetime') ? 'text-purple-600' : 
                                'text-gray-600'
                              }`}>
                                {(effectiveLimits?.source.plan === 'pro' || plan === 'pro') ? 'Monthly' : 
                                 (effectiveLimits?.source.plan === 'lifetime' || plan === 'lifetime') ? 'Forever' : 
                                 'Basic'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {(effectiveLimits?.source.plan === 'free' || plan === 'free') && (
                        <Button
                          variant="outline"
                          onClick={() => setShowPaymentModal(true)}
                          className="w-full bg-gradient-to-r from-teal-500/10 to-cyan-500/10 border-teal-500/30 hover:bg-gradient-to-r hover:from-teal-500/20 hover:to-cyan-500/20 transition-all duration-300"
                        >
                          <Crown className="w-4 h-4 mr-2" />
                          Upgrade Plan
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Feature Benefits Section */}
              {(effectiveLimits?.source.plan === 'free' || plan === 'free') && (
                <div className="mt-6">
                  <div className="text-sm font-medium text-muted-foreground mb-4">Upgrade Benefits</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative group transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 cursor-pointer"
                         onClick={() => {
                           setUpgradePrompt({
                             title: 'Remove Ads',
                             message: 'Enjoy an uninterrupted creative experience with no ads. Upgrade to Premium for an ad-free experience.',
                             action: 'Upgrade Now'
                           });
                           setShowUpgradePrompt(true);
                         }}>
                      <div className="relative bg-gradient-to-br from-green-500/5 to-emerald-500/5 backdrop-blur-sm border border-green-200/30 dark:border-green-800/30 rounded-xl p-6 hover:bg-gradient-to-br hover:from-green-500/10 hover:to-emerald-500/10 hover:shadow-xl hover:border-green-500/50 transition-all duration-300">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Shield className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-green-700 dark:text-green-300">No Ads</h3>
                              <Badge variant="secondary" className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700">
                                <Lock className="w-3 h-3 mr-1" />
                                Premium
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">Enjoy an uninterrupted creative experience</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="relative group transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 cursor-pointer"
                         onClick={() => {
                           setUpgradePrompt({
                             title: 'Cloud Backup',
                             message: 'Cloud backup and sync are available for Pro users. Upgrade your plan to automatically backup your work and access it from any device.',
                             action: 'Upgrade to Pro'
                           });
                           setShowUpgradePrompt(true);
                         }}>
                      <div className="relative bg-gradient-to-br from-blue-500/5 to-cyan-500/5 backdrop-blur-sm border border-blue-200/30 dark:border-blue-800/30 rounded-xl p-6 hover:bg-gradient-to-br hover:from-blue-500/10 hover:to-cyan-500/10 hover:shadow-xl hover:border-blue-500/50 transition-all duration-300">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <HardDrive className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-blue-700 dark:text-blue-300">10GB Cloud Backup</h3>
                              <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">
                                <Lock className="w-3 h-3 mr-1" />
                                Pro
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">Automatic backups with secure cloud storage</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}


        </div>
        
        {/* Footer note */}
        <div className="text-xs text-muted-foreground text-center p-4 border-t border-border/20">
          ⚠️ Authentication is optional - app works fully offline
        </div>
      </DialogContent>
      
      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        productKey="PRO_SUBSCRIPTION"
        onSuccess={async () => {
          toast.success('Successfully upgraded to Pro!');
          setShowPaymentModal(false);
          // Refresh user data to get updated plan immediately
          await refreshUserData();
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
