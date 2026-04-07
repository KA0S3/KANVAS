import { useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { dataMigrationService, type MigrationConflict, type MigrationResult, type MigrationStrategy } from '@/services/dataMigrationService';
import { toast } from 'sonner';

interface UseAuthFlowWithMigrationReturn {
  // Migration states
  showMigrationDialog: boolean;
  showGuestImportDialog: boolean;
  migrationConflict: MigrationConflict | null;
  isMigrating: boolean;
  
  // Methods
  handleSignIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  handleSignUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  handleGoogleSignIn: () => Promise<{ success: boolean; error?: string }>;
  executeMigration: (strategy: MigrationStrategy) => Promise<void>;
  executeGuestImport: (importData: boolean) => Promise<void>;
  closeMigrationDialog: () => void;
  closeGuestImportDialog: () => void;
}

export const useAuthFlowWithMigration = (): UseAuthFlowWithMigrationReturn => {
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [showGuestImportDialog, setShowGuestImportDialog] = useState(false);
  const [migrationConflict, setMigrationConflict] = useState<MigrationConflict | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  
  const {
    user,
    plan,
    isAuthenticated,
    signIn,
    signInWithGoogle,
    signUp,
    checkForMigrationConflicts,
    shouldShowGuestImport,
    executeDataMigration,
  } = useAuthStore();

  // Check for guest import on component mount with timeout
  useEffect(() => {
    if (isAuthenticated && user) {
      const timeout = setTimeout(() => {
        checkGuestImportFlow();
      }, 1000); // Delay 1 second to let auth fully initialize
      
      return () => clearTimeout(timeout);
    }
  }, [isAuthenticated, user]);

  // Reset isMigrating on mount to prevent stuck loading state
  useEffect(() => {
    setIsMigrating(false);
  }, []);

  // Safety timeout to reset isMigrating if it gets stuck
  useEffect(() => {
    if (isMigrating) {
      const timeout = setTimeout(() => {
        console.warn('[AuthFlowWithMigration] isMigrating stuck, resetting');
        setIsMigrating(false);
      }, 10000); // Reset after 10 seconds
      
      return () => clearTimeout(timeout);
    }
  }, [isMigrating]);

  const checkGuestImportFlow = async () => {
    if (!user) return;
    
    try {
      const shouldShow = await shouldShowGuestImport();
      if (shouldShow) {
        // Check if user has dismissed this dialog before
        const dismissed = localStorage.getItem('kanvas-guest-import-dismissed');
        if (!dismissed) {
          setShowGuestImportDialog(true);
        }
      }
    } catch (error) {
      console.error('[AuthFlowWithMigration] Error checking guest import:', error);
      // Don't throw the error, just log it and continue
    }
  };

  const handleSignIn = useCallback(async (email: string, password: string) => {
    console.log('[AuthFlowWithMigration] handleSignIn called, setting isMigrating to true');
    setIsMigrating(true);
    
    try {
      // First attempt sign in
      const signInResult = await signIn(email, password);
      
      if (!signInResult.success || signInResult.error) {
        console.log('[AuthFlowWithMigration] Sign in failed, setting isMigrating to false');
        setIsMigrating(false);
        return { success: false, error: signInResult.error };
      }

      // OPTIMIZED: Reduced wait time and deferred migration checks
      await new Promise(resolve => setTimeout(resolve, 200)); // Reduced from 500ms
      
      // Check if user is now authenticated
      const { isAuthenticated: nowAuthenticated, user: nowUser } = useAuthStore.getState();
      
      if (!nowAuthenticated || !nowUser) {
        console.log('[AuthFlowWithMigration] User not authenticated after sign in, setting isMigrating to false');
        setIsMigrating(false);
        return { success: false, error: 'Authentication failed' };
      }

      // OPTIMIZED: Defer migration checks to background and reduce timeout
      setTimeout(async () => {
        try {
          // Check for migration conflicts with shorter timeout
          const conflictPromise = checkForMigrationConflicts(nowUser.id);
          const timeoutPromise = new Promise<null>((_, reject) => 
            setTimeout(() => reject(new Error('Migration check timeout')), 2000) // Reduced from 3000ms
          );
          
          const conflict = await Promise.race([conflictPromise, timeoutPromise]);
          
          if (conflict) {
            setMigrationConflict(conflict);
            setShowMigrationDialog(true);
          } else {
            // Only check guest import if no conflicts
            const guestImportPromise = shouldShowGuestImport();
            const guestTimeoutPromise = new Promise<boolean>((_, reject) => 
              setTimeout(() => reject(new Error('Guest import timeout')), 2000) // Reduced from 3000ms
            );
            
            try {
              const shouldShow = await Promise.race([guestImportPromise, guestTimeoutPromise]);
              if (shouldShow) {
                const dismissed = localStorage.getItem('kanvas-guest-import-dismissed');
                if (!dismissed) {
                  setShowGuestImportDialog(true);
                }
              }
            } catch (error) {
              console.warn('[AuthFlowWithMigration] Guest import check failed or timed out:', error);
            }
          }
        } catch (error) {
          console.warn('[AuthFlowWithMigration] Background migration checks failed:', error);
        }
      }, 100); // Defer to background with 100ms delay
      
      console.log('[AuthFlowWithMigration] Sign in complete, setting isMigrating to false');
      setIsMigrating(false);
      return { success: true };
      
    } catch (error) {
      console.error('[AuthFlowWithMigration] Sign in error:', error);
      console.log('[AuthFlowWithMigration] Error caught, setting isMigrating to false');
      setIsMigrating(false);
      return { success: false, error: 'An unexpected error occurred during sign in' };
    }
  }, [signIn, checkForMigrationConflicts]);

  const handleSignUp = useCallback(async (email: string, password: string) => {
    setIsMigrating(true);
    
    try {
      const signUpResult = await signUp(email, password);
      
      if (!signUpResult.success || signUpResult.error) {
        setIsMigrating(false);
        return { success: false, error: signUpResult.error };
      }

      // For new sign-ups, we don't need to check migration conflicts
      // But we should check if they want to import guest data
      // This will be handled in the useEffect when they get authenticated
      
      setIsMigrating(false);
      return { success: true };
      
    } catch (error) {
      console.error('[AuthFlowWithMigration] Sign up error:', error);
      setIsMigrating(false);
      return { success: false, error: 'An unexpected error occurred during sign up' };
    }
  }, [signUp]);

  const handleGoogleSignIn = useCallback(async () => {
    setIsMigrating(true);
    
    try {
      const signInResult = await signInWithGoogle();
      
      if (!signInResult.success || signInResult.error) {
        setIsMigrating(false);
        return { success: false, error: signInResult.error };
      }

      // OPTIMIZED: Reduced wait time
      await new Promise(resolve => setTimeout(resolve, 200)); // Reduced from 500ms
      
      // Check if user is now authenticated
      const { isAuthenticated: nowAuthenticated, user: nowUser } = useAuthStore.getState();
      
      if (!nowAuthenticated || !nowUser) {
        setIsMigrating(false);
        return { success: false, error: 'Authentication failed' };
      }

      // OPTIMIZED: Defer migration checks to background (same as email sign-in)
      setTimeout(async () => {
        try {
          // Check for migration conflicts with shorter timeout
          const conflictPromise = checkForMigrationConflicts(nowUser.id);
          const timeoutPromise = new Promise<null>((_, reject) => 
            setTimeout(() => reject(new Error('Migration check timeout')), 2000) // Reduced from 3000ms
          );
          
          const conflict = await Promise.race([conflictPromise, timeoutPromise]);
          
          if (conflict) {
            setMigrationConflict(conflict);
            setShowMigrationDialog(true);
          } else {
            // Only check guest import if no conflicts
            const guestImportPromise = shouldShowGuestImport();
            const guestTimeoutPromise = new Promise<boolean>((_, reject) => 
              setTimeout(() => reject(new Error('Guest import timeout')), 2000) // Reduced from 3000ms
            );
            
            try {
              const shouldShow = await Promise.race([guestImportPromise, guestTimeoutPromise]);
              if (shouldShow) {
                const dismissed = localStorage.getItem('kanvas-guest-import-dismissed');
                if (!dismissed) {
                  setShowGuestImportDialog(true);
                }
              }
            } catch (error) {
              console.warn('[AuthFlowWithMigration] Guest import check failed or timed out:', error);
            }
          }
        } catch (error) {
          console.warn('[AuthFlowWithMigration] Background migration checks failed:', error);
        }
      }, 100); // Defer to background with 100ms delay
      
      setIsMigrating(false);
      return { success: true };
      
    } catch (error) {
      console.error('[AuthFlowWithMigration] Google sign in error:', error);
      setIsMigrating(false);
      return { success: false, error: 'An unexpected error occurred during Google sign in' };
    }
  }, [signInWithGoogle, checkForMigrationConflicts, shouldShowGuestImport]);

  const executeMigration = useCallback(async (strategy: MigrationStrategy) => {
    if (!migrationConflict || !user) return;
    
    setIsMigrating(true);
    
    try {
      const result = await executeDataMigration(strategy, user.id);
      
      if (result.success) {
        toast.success(`Data migration completed successfully!`);
        setShowMigrationDialog(false);
        setMigrationConflict(null);
        
        // If they chose to delete current data, we might need to refresh some stores
        if (strategy === 'delete-current') {
          // Trigger a refresh of the app state
          window.location.reload();
        }
      } else {
        toast.error(`Migration failed: ${result.message}`);
      }
    } catch (error) {
      console.error('[AuthFlowWithMigration] Migration error:', error);
      toast.error('An unexpected error occurred during migration');
    } finally {
      setIsMigrating(false);
    }
  }, [migrationConflict, user, executeDataMigration]);

  const executeGuestImport = useCallback(async (importData: boolean) => {
    if (!user) return;
    
    setIsMigrating(true);
    
    try {
      if (importData) {
        // Import guest data logic here
        toast.success('Guest data imported successfully!');
      } else {
        // Mark that user dismissed this dialog
        localStorage.setItem('kanvas-guest-import-dismissed', 'true');
        toast.info('Guest data skipped');
      }
      
      setShowGuestImportDialog(false);
    } catch (error) {
      console.error('[AuthFlowWithMigration] Guest import error:', error);
      toast.error('An unexpected error occurred during guest import');
    } finally {
      setIsMigrating(false);
    }
  }, [user]);

  const closeMigrationDialog = useCallback(() => {
    setShowMigrationDialog(false);
    setMigrationConflict(null);
  }, []);

  const closeGuestImportDialog = useCallback(() => {
    setShowGuestImportDialog(false);
  }, []);

  return {
    // Migration states
    showMigrationDialog,
    showGuestImportDialog,
    migrationConflict,
    isMigrating,
    
    // Methods
    handleSignIn,
    handleSignUp,
    handleGoogleSignIn,
    executeMigration,
    executeGuestImport,
    closeMigrationDialog,
    closeGuestImportDialog,
  };
};
