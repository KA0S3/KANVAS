import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Loader2, Lock, CheckCircle, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const passwordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type PasswordFormData = z.infer<typeof passwordSchema>;

const AuthResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isPasswordSetup, setIsPasswordSetup] = useState(false);
  
  const { createPasswordForGoogleUser } = useAuthStore();

  const form = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    // Check if this is a password setup flow for Google users
    const setup = searchParams.get('setup');
    const email = searchParams.get('email');
    
    if (setup === 'true') {
      setIsPasswordSetup(true);
      if (email) {
        setUserEmail(email);
      }
    }

    // Verify the reset token from Supabase
    const verifyResetToken = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        
        if (error || !data.user) {
          toast.error('Invalid or expired reset link');
          navigate('/');
          return;
        }
        
        setUserEmail(data.user.email || '');
        
        // Check if this is a Google user setting up password
        if (setup === 'true' && data.user.app_metadata?.provider === 'google') {
          setIsPasswordSetup(true);
        }
      } catch (error) {
        console.error('Error verifying reset token:', error);
        toast.error('Invalid reset link');
        navigate('/');
      }
    };

    verifyResetToken();
  }, [searchParams, navigate]);

  const handleSubmit = async (data: PasswordFormData) => {
    setIsSubmitting(true);
    
    try {
      // For password reset, we need to use the Supabase reset password flow
      // The user should have a valid reset token from the email link
      const { error } = await supabase.auth.updateUser({
        password: data.password
      });
      
      if (error) {
        console.error('Password update error:', error);
        toast.error(error.message);
      } else {
        toast.success('Password created successfully! You can now sign in with either Google or your new password.');
        setIsSuccess(true);
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/');
        }, 3000);
      }
    } catch (error) {
      console.error('Password creation error:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToAuth = () => {
    navigate('/');
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Password Created Successfully!
                </h3>
                <p className="text-muted-foreground">
                  You can now sign in with either Google or your new password.
                </p>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Redirecting to sign in page...
                </p>
                <Button 
                  onClick={handleBackToAuth}
                  variant="outline"
                  className="w-full"
                >
                  Go to Sign In
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">
            {isPasswordSetup ? 'Create Password' : 'Reset Password'}
          </CardTitle>
          {isPasswordSetup && (
            <p className="text-sm text-muted-foreground text-center">
              Create a password to sign in with email instead of Google
            </p>
          )}
        </CardHeader>
        
        <CardContent className="space-y-4">
          {userEmail && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Account: <span className="font-medium text-foreground">{userEmail}</span>
              </p>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter your new password"
                        type="password"
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Confirm your new password"
                        type="password"
                        autoComplete="new-password"
                        disabled={isSubmitting}
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
                    {isPasswordSetup ? 'Creating Password...' : 'Resetting Password...'}
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    {isPasswordSetup ? 'Create Password' : 'Reset Password'}
                  </>
                )}
              </Button>
            </form>
          </Form>

          <Button
            variant="ghost"
            onClick={handleBackToAuth}
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Sign In
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthResetPassword;
