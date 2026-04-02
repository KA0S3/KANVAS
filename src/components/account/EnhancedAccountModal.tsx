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
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { DataMigrationDialog } from '@/components/DataMigrationDialog';
import { GuestImportDialog } from '@/components/GuestImportDialog';
import { useAuthFlowWithMigration } from '@/hooks/useAuthFlowWithMigration';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { formatBytes } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from "@/lib/supabase";

interface EnhancedAccountModalProps {
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

export function EnhancedAccountModal({ isOpen, onClose }: EnhancedAccountModalProps) {
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
  const [providerConflict, setProviderConflict] = useState<{
    email: string;
    existingProvider: string;
    suggestedAction: string;
  } | null>(null);
  const [showPasswordLinking, setShowPasswordLinking] = useState(false);
  
  // Enhanced auth flow with migration
  const {
    showMigrationDialog,
    showGuestImportDialog,
    migrationConflict,
    isMigrating,
    handleSignIn,
    handleSignUp,
    handleGoogleSignIn,
    executeMigration,
    executeGuestImport,
    closeMigrationDialog,
    closeGuestImportDialog,
  } = useAuthFlowWithMigration();

  // Legacy auth store for other functionality
  const { 
    user, 
    plan,
    effectiveLimits,
    isAuthenticated, 
    loading: authLoading, 
    signOut,
    refreshUserData,
    isVerificationPending,
    verificationEmail,
    setVerificationPending,
    checkUserExists,
    detectAuthProvider,
    linkPasswordToGoogleUser,
    createPasswordForGoogleUser
  } = useAuthStore();

  const { quota } = useCloudStore();

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

  // Enhanced login handler with migration
  const onLoginSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true);
    setAuthError(null);
    
    try {
      const result = await handleSignIn(data.email, data.password);
      
      if (!result.success) {
        setAuthError(result.error || 'Login failed');
      } else {
        // Success! Migration dialog will show if needed
        loginForm.reset();
        onClose();
      }
    } catch (error) {
      console.error('[EnhancedAccountModal] Login error:', error);
      setAuthError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Enhanced signup handler
  const onSignUpSubmit = async (data: SignUpFormData) => {
    setIsSubmitting(true);
    setAuthError(null);
    
    try {
      const result = await handleSignUp(data.email, data.password);
      
      if (!result.success) {
        setAuthError(result.error || 'Sign up failed');
      } else {
        // Success! Guest import dialog will show if needed
        signUpForm.reset();
        onClose();
      }
    } catch (error) {
      console.error('[EnhancedAccountModal] Sign up error:', error);
      setAuthError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Enhanced Google sign in handler
  const handleGoogleSignInClick = async () => {
    setIsSubmitting(true);
    setAuthError(null);
    
    try {
      const result = await handleGoogleSignIn();
      
      if (!result.success) {
        setAuthError(result.error || 'Google sign in failed');
      } else {
        // Success! Migration dialog will show if needed
        onClose();
      }
    } catch (error) {
      console.error('[EnhancedAccountModal] Google sign in error:', error);
      setAuthError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Migration completion handlers
  const handleMigrationComplete = (result: any) => {
    console.log('[EnhancedAccountModal] Migration completed:', result);
    // Migration dialog will close automatically
  };

  const handleGuestImportComplete = (result: any) => {
    console.log('[EnhancedAccountModal] Guest import completed:', result);
    // Guest import dialog will close automatically
  };

  const handleGuestImportStartFresh = () => {
    executeGuestImport(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      onClose();
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('[EnhancedAccountModal] Sign out error:', error);
      toast.error('Failed to sign out');
    }
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case 'owner': return 'bg-purple-500';
      case 'lifetime': return 'bg-yellow-500';
      case 'pro': return 'bg-blue-500';
      case 'free': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  if (isAuthenticated && user) {
    // Authenticated user view
    return (
      <>
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Account
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* User Info */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-medium">{user.email}</p>
                      <Badge className={getPlanBadgeColor(plan)}>
                        {plan.charAt(0).toUpperCase() + plan.slice(1)}
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleSignOut}>
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </Button>
                  </div>

                  {/* Storage Usage */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Storage Used</span>
                      <span>{formatBytes(quota.used)} / {formatBytes(quota.available)}</span>
                    </div>
                    <Progress 
                      value={(quota.used / quota.available) * 100} 
                      className="h-2"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Plan Features */}
              {effectiveLimits && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Your Features</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Cloud Sync</span>
                      <span className={effectiveLimits.quotaBytes > 0 ? 'text-green-500' : 'text-gray-400'}>
                        {effectiveLimits.quotaBytes > 0 ? '✓' : '✗'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Max Projects</span>
                      <span>{effectiveLimits.maxBooks === -1 ? 'Unlimited' : effectiveLimits.maxBooks}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Storage</span>
                      <span>{formatBytes(effectiveLimits.quotaBytes)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Upgrade Button */}
              {plan === 'free' && (
                <Button 
                  onClick={() => setShowPaymentModal(true)}
                  className="w-full"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Pro
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Payment Modal */}
        {showPaymentModal && (
          <PaymentModal
            isOpen={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            productKey="pro_monthly"
          />
        )}
      </>
    );
  }

  // Unauthenticated user view
  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Mode Toggle */}
            <div className="flex justify-center space-x-2 p-1 bg-muted rounded-lg">
              <Button
                variant={mode === 'login' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMode('login')}
                className="flex-1"
              >
                Sign In
              </Button>
              <Button
                variant={mode === 'signup' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMode('signup')}
                className="flex-1"
              >
                Sign Up
              </Button>
            </div>

            {/* Google Sign In */}
            <GoogleSignInButton
              fullWidth
            />

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with email
                </span>
              </div>
            </div>

            {/* Error Display */}
            {authError && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {authError}
              </div>
            )}

            {/* Loading State */}
            {isMigrating && (
              <div className="p-3 text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex items-center">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing your data...
                </div>
              </div>
            )}

            {/* Forms */}
            {mode === 'login' ? (
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="Enter your email"
                            {...field}
                            disabled={isSubmitting || isMigrating}
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
                            type="password"
                            placeholder="Enter your password"
                            {...field}
                            disabled={isSubmitting || isMigrating}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={isSubmitting || isMigrating}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing In...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              </Form>
            ) : (
              <Form {...signUpForm}>
                <form onSubmit={signUpForm.handleSubmit(onSignUpSubmit)} className="space-y-4">
                  <FormField
                    control={signUpForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="Enter your email"
                            {...field}
                            disabled={isSubmitting || isMigrating}
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
                            type="password"
                            placeholder="Create a password"
                            {...field}
                            disabled={isSubmitting || isMigrating}
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
                            type="password"
                            placeholder="Confirm your password"
                            {...field}
                            disabled={isSubmitting || isMigrating}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={isSubmitting || isMigrating}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating Account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </form>
              </Form>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Migration Dialog */}
      {showMigrationDialog && migrationConflict && user && (
        <DataMigrationDialog
          isOpen={showMigrationDialog}
          onClose={closeMigrationDialog}
          conflict={migrationConflict}
          userId={user.id}
          onMigrationComplete={handleMigrationComplete}
        />
      )}

      {/* Guest Import Dialog */}
      {showGuestImportDialog && user && (
        <GuestImportDialog
          isOpen={showGuestImportDialog}
          onClose={closeGuestImportDialog}
          userId={user.id}
          onImportComplete={handleGuestImportComplete}
          onStartFresh={handleGuestImportStartFresh}
        />
      )}
    </>
  );
}
