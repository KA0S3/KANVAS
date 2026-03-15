import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('[AuthCallback] Processing OAuth callback...');
        
        // Get the URL hash and search params
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const searchParams = new URLSearchParams(window.location.search);
        
        // Check for error in URL params
        const error = searchParams.get('error') || hashParams.get('error');
        const errorDescription = searchParams.get('error_description') || hashParams.get('error_description');
        
        if (error) {
          console.error('[AuthCallback] OAuth error:', error, errorDescription);
          toast.error(errorDescription || 'Authentication failed');
          navigate('/');
          return;
        }

        // Let Supabase handle the OAuth session
        const { data, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[AuthCallback] Session error:', sessionError);
          toast.error('Failed to establish session');
          navigate('/');
          return;
        }

        if (data.session) {
          console.log('[AuthCallback] Session established successfully');
          toast.success('Successfully signed in with Google!');
          
          // Initialize auth to trigger state updates
          await initializeAuth();
          
          // Redirect to dashboard
          navigate('/');
        } else {
          // No session found, might be still processing
          console.log('[AuthCallback] No session found, waiting...');
          
          // Wait a bit and try again
          setTimeout(async () => {
            const { data: retryData } = await supabase.auth.getSession();
            if (retryData.session) {
              toast.success('Successfully signed in with Google!');
              await initializeAuth();
              navigate('/');
            } else {
              console.error('[AuthCallback] No session after retry');
              toast.error('Authentication failed');
              navigate('/');
            }
          }, 2000);
        }
      } catch (error) {
        console.error('[AuthCallback] Unexpected error:', error);
        toast.error('An unexpected error occurred during authentication');
        navigate('/');
      }
    };

    handleAuthCallback();
  }, [navigate, initializeAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">Completing authentication...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
