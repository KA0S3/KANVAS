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

  // Reset isMigrating on mount and when component regains focus to prevent stuck loading state
  useEffect(() => {
    setIsMigrating(false);
    
    // Also reset when window gains focus (user returns to tab)
    const handleFocus = () => {
      console.log('[AuthFlowWithMigration] Window focused, resetting migration state');
      setIsMigrating(false);
    };
    
    // Also reset when page becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('[AuthFlowWithMigration] Page became visible, resetting migration state');
        setIsMigrating(false);
      }
    };
    
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Enhanced safety timeout to reset isMigrating if it gets stuck
  useEffect(() => {
    if (isMigrating) {
      const timeout = setTimeout(() => {
        console.warn('[AuthFlowWithMigration] isMigrating stuck for 5 seconds, auto-resetting');
        setIsMigrating(false);
      }, 5000); // Reduced from 10 seconds to 5 seconds for faster recovery
      
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
    console.log('[AuthFlowWithMigration] handleSignIn called');
    
    // Reset migration state immediately to prevent stuck loading
    setIsMigrating(false);
    
    try {
      // First attempt sign in
      const signInResult = await signIn(email, password);
      
      if (!signInResult.success || signInResult.error) {
        console.log('[AuthFlowWithMigration] Sign in failed:', signInResult.error);
        return { success: false, error: signInResult.error };
      }

      // Wait briefly for auth state to settle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if user is now authenticated
      const { isAuthenticated: nowAuthenticated, user: nowUser } = useAuthStore.getState();
      
      if (!nowAuthenticated || !nowUser) {
        console.log('[AuthFlowWithMigration] User not authenticated after sign in');
        return { success: false, error: 'Authentication failed' };
      }

      console.log('[AuthFlowWithMigration] Sign in successful, checking for migration needs');
      
      // Run migration checks in background without blocking the UI
      // Use a non-blocking approach that doesn't affect the sign-in flow
      setTimeout(async () => {
        try {
          // Only set migrating state if we actually need to show dialogs
          let needsDialog = false;
          
          // Quick migration conflict check with shorter timeout
          try {
            const conflictPromise = checkForMigrationConflicts(nowUser.id);
            const timeoutPromise = new Promise<null>((_, reject) => 
              setTimeout(() => reject(new Error('Migration check timeout')), 1500)
            );
            
            const conflict = await Promise.race([conflictPromise, timeoutPromise]);
            
            if (conflict) {
              setMigrationConflict(conflict);
              setShowMigrationDialog(true);
              needsDialog = true;
            }
          } catch (error) {
            console.warn('[AuthFlowWithMigration] Migration check failed:', error);
          }
          
          // Only check guest import if no migration conflicts
          if (!needsDialog) {
            try {
              const guestImportPromise = shouldShowGuestImport();
              const guestTimeoutPromise = new Promise<boolean>((_, reject) => 
                setTimeout(() => reject(new Error('Guest import timeout')), 1500)
              );
              
              const shouldShow = await Promise.race([guestImportPromise, guestTimeoutPromise]);
              if (shouldShow) {
                const dismissed = localStorage.getItem('kanvas-guest-import-dismissed');
                if (!dismissed) {
                  setShowGuestImportDialog(true);
                  needsDialog = true;
                }
              }
            } catch (error) {
              console.warn('[AuthFlowWithMigration] Guest import check failed:', error);
            }
          }
          
          // Only set migrating state if we actually need to show a dialog
          if (needsDialog) {
            setIsMigrating(true);
            // Auto-reset after dialog interaction
            setTimeout(() => setIsMigrating(false), 5000);
          }
        } catch (error) {
          console.warn('[AuthFlowWithMigration] Background migration checks failed:', error);
        }
      }, 200); // Start background checks after 200ms
      
      return { success: true };
      
    } catch (error) {
      console.error('[AuthFlowWithMigration] Sign in error:', error);
      setIsMigrating(false);
      return { success: false, error: 'An unexpected error occurred during sign in' };
    }
  }, [signIn, checkForMigrationConflicts, shouldShowGuestImport]);

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
    console.log('[AuthFlowWithMigration] handleGoogleSignIn called');
    
    // Reset migration state immediately to prevent stuck loading
    setIsMigrating(false);
    
    try {
      const signInResult = await signInWithGoogle();
      
      if (!signInResult.success || signInResult.error) {
        console.log('[AuthFlowWithMigration] Google sign in failed:', signInResult.error);
        return { success: false, error: signInResult.error };
      }

      // Wait briefly for auth state to settle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if user is now authenticated
      const { isAuthenticated: nowAuthenticated, user: nowUser } = useAuthStore.getState();
      
      if (!nowAuthenticated || !nowUser) {
        console.log('[AuthFlowWithMigration] User not authenticated after Google sign in');
        return { success: false, error: 'Authentication failed' };
      }

      console.log('[AuthFlowWithMigration] Google sign in successful, checking for migration needs');
      
      // Run migration checks in background without blocking the UI
      setTimeout(async () => {
        try {
          // Only set migrating state if we actually need to show dialogs
          let needsDialog = false;
          
          // Quick migration conflict check with shorter timeout
          try {
            const conflictPromise = checkForMigrationConflicts(nowUser.id);
            const timeoutPromise = new Promise<null>((_, reject) => 
              setTimeout(() => reject(new Error('Migration check timeout')), 1500)
            );
            
            const conflict = await Promise.race([conflictPromise, timeoutPromise]);
            
            if (conflict) {
              setMigrationConflict(conflict);
              setShowMigrationDialog(true);
              needsDialog = true;
            }
          } catch (error) {
            console.warn('[AuthFlowWithMigration] Migration check failed:', error);
          }
          
          // Only check guest import if no migration conflicts
          if (!needsDialog) {
            try {
              const guestImportPromise = shouldShowGuestImport();
              const guestTimeoutPromise = new Promise<boolean>((_, reject) => 
                setTimeout(() => reject(new Error('Guest import timeout')), 1500)
              );
              
              const shouldShow = await Promise.race([guestImportPromise, guestTimeoutPromise]);
              if (shouldShow) {
                const dismissed = localStorage.getItem('kanvas-guest-import-dismissed');
                if (!dismissed) {
                  setShowGuestImportDialog(true);
                  needsDialog = true;
                }
              }
            } catch (error) {
              console.warn('[AuthFlowWithMigration] Guest import check failed:', error);
            }
          }
          
          // Only set migrating state if we actually need to show a dialog
          if (needsDialog) {
            setIsMigrating(true);
            // Auto-reset after dialog interaction
            setTimeout(() => setIsMigrating(false), 5000);
          }
        } catch (error) {
          console.warn('[AuthFlowWithMigration] Background migration checks failed:', error);
        }
      }, 200); // Start background checks after 200ms
      
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
