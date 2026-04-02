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

  // Check for guest import on component mount
  useEffect(() => {
    if (isAuthenticated && user) {
      checkGuestImportFlow();
    }
  }, [isAuthenticated, user]);

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
    }
  };

  const handleSignIn = useCallback(async (email: string, password: string) => {
    setIsMigrating(true);
    
    try {
      // First attempt sign in
      const signInResult = await signIn(email, password);
      
      if (!signInResult.success || signInResult.error) {
        setIsMigrating(false);
        return { success: false, error: signInResult.error };
      }

      // Wait a moment for auth state to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if user is now authenticated
      const { isAuthenticated: nowAuthenticated, user: nowUser } = useAuthStore.getState();
      
      if (!nowAuthenticated || !nowUser) {
        setIsMigrating(false);
        return { success: false, error: 'Authentication failed' };
      }

      // Check for migration conflicts
      const conflict = await checkForMigrationConflicts(nowUser.id);
      
      if (conflict) {
        setMigrationConflict(conflict);
        setShowMigrationDialog(true);
        setIsMigrating(false);
        return { success: true }; // Sign in successful, but migration needed
      }

      // No conflicts, check for guest import
      await checkGuestImportFlow();
      
      setIsMigrating(false);
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
      // Attempt sign up
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
      // Attempt Google sign in
      const signInResult = await signInWithGoogle();
      
      if (!signInResult.success || signInResult.error) {
        setIsMigrating(false);
        return { success: false, error: signInResult.error };
      }

      // Wait a moment for auth state to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if user is now authenticated
      const { isAuthenticated: nowAuthenticated, user: nowUser } = useAuthStore.getState();
      
      if (!nowAuthenticated || !nowUser) {
        setIsMigrating(false);
        return { success: false, error: 'Authentication failed' };
      }

      // Check for migration conflicts
      const conflict = await checkForMigrationConflicts(nowUser.id);
      
      if (conflict) {
        setMigrationConflict(conflict);
        setShowMigrationDialog(true);
        setIsMigrating(false);
        return { success: true }; // Sign in successful, but migration needed
      }

      // No conflicts, check for guest import
      await checkGuestImportFlow();
      
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
          // The migration service already cleared local data
          // You might want to trigger a page reload or store refresh here
          window.location.reload();
        }
      } else {
        toast.error(`Migration failed: ${result.message}`);
      }
    } catch (error) {
      console.error('[AuthFlowWithMigration] Migration error:', error);
      toast.error('Migration failed. Please try again.');
    } finally {
      setIsMigrating(false);
    }
  }, [migrationConflict, user, executeDataMigration]);

  const executeGuestImport = useCallback(async (importData: boolean) => {
    if (!user) return;
    
    setIsMigrating(true);
    
    try {
      if (importData) {
        const result = await executeDataMigration('merge-as-new', user.id);
        
        if (result.success) {
          toast.success('Your local projects have been saved to the cloud!');
        } else {
          toast.error(`Import failed: ${result.message}`);
        }
      } else {
        // User chose to start fresh
        toast.info('Starting fresh. Your local data is still available on this device.');
      }
      
      setShowGuestImportDialog(false);
    } catch (error) {
      console.error('[AuthFlowWithMigration] Guest import error:', error);
      toast.error('Import failed. Please try again.');
    } finally {
      setIsMigrating(false);
    }
  }, [user, executeDataMigration]);

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
