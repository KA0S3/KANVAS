import { useEffect, useState, useCallback } from 'react';
import { documentMutationService, type ConflictResolution, type ConflictStrategy } from '@/services/DocumentMutationService';
import { useToast } from './use-toast';

/**
 * Conflict info for UI display
 */
export interface ConflictInfo {
  operation: string;
  reason: string;
  field?: string;
}

/**
 * Conflict resolution result for UI
 */
export interface ConflictResolutionInfo {
  strategy: ConflictStrategy;
  appliedCount: number;
  discardedCount: number;
  conflictCount: number;
  conflicts: ConflictInfo[];
}

/**
 * Hook for handling document sync conflicts
 * 
 * Features:
 * - Listens to conflict resolution events
 * - Shows toast notifications for conflicts
 * - Provides conflict history access
 * - Allows changing conflict strategy
 */
export function useConflictResolution() {
  const { toast } = useToast();
  const [lastConflict, setLastConflict] = useState<ConflictResolutionInfo | null>(null);
  const [conflictCount, setConflictCount] = useState(0);
  const [currentStrategy, setCurrentStrategy] = useState<ConflictStrategy>('server-wins');

  /**
   * Show toast notification for resolved conflict
   */
  const showConflictResolvedToast = useCallback((resolution: ConflictResolutionInfo) => {
    if (resolution.conflictCount === 0) {
      // No actual conflicts, just synced
      toast({
        title: 'Synced',
        description: 'Your changes have been synchronized.',
        variant: 'default'
      });
      return;
    }

    const discardedText = resolution.discardedCount > 0 
      ? `${resolution.discardedCount} change${resolution.discardedCount === 1 ? '' : 's'} were overwritten by server`
      : 'All changes preserved';

    // Build description string from conflicts
    let description = discardedText;
    if (resolution.conflicts.length > 0) {
      const conflictList = resolution.conflicts
        .slice(0, 3)
        .map(c => `• ${c.operation}: ${c.reason}`)
        .join('\n');
      description += `\n${conflictList}`;
      if (resolution.conflicts.length > 3) {
        description += `\n• ... and ${resolution.conflicts.length - 3} more`;
      }
    }

    toast({
      title: 'Sync Conflict Resolved',
      description,
      variant: resolution.discardedCount > 0 ? 'destructive' : 'default'
    });
  }, [toast]);

  /**
   * Show toast for conflict resolution failure
   */
  const showConflictFailedToast = useCallback((error: string, pendingOps: number) => {
    toast({
      title: 'Sync Failed',
      description: `Could not resolve sync conflict. ${pendingOps} change(s) pending.\nError: ${error}`,
      variant: 'destructive'
    });
  }, [toast]);

  /**
   * Listen for conflict resolution events
   */
  useEffect(() => {
    const handleConflictResolved = (event: CustomEvent) => {
      const resolution: ConflictResolutionInfo = event.detail;
      setLastConflict(resolution);
      setConflictCount(prev => prev + resolution.conflictCount);
      showConflictResolvedToast(resolution);
    };

    const handleConflictFailed = (event: CustomEvent) => {
      const { error, pendingOperations } = event.detail;
      showConflictFailedToast(error, pendingOperations);
    };

    // Add event listeners
    window.addEventListener('sync-conflict-resolved', handleConflictResolved as EventListener);
    window.addEventListener('sync-conflict-failed', handleConflictFailed as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('sync-conflict-resolved', handleConflictResolved as EventListener);
      window.removeEventListener('sync-conflict-failed', handleConflictFailed as EventListener);
    };
  }, [showConflictResolvedToast, showConflictFailedToast]);

  /**
   * Change conflict resolution strategy
   */
  const setStrategy = useCallback((strategy: ConflictStrategy) => {
    documentMutationService.setConflictStrategy(strategy);
    setCurrentStrategy(strategy);
    
    toast({
      title: 'Conflict Strategy Updated',
      description: `Now using "${strategy}" for resolving sync conflicts.`,
      variant: 'default'
    });
  }, [toast]);

  /**
   * Get conflict history
   */
  const getConflictHistory = useCallback(() => {
    return documentMutationService.getConflictHistory();
  }, []);

  /**
   * Clear conflict history
   */
  const clearConflictHistory = useCallback(() => {
    documentMutationService.clearConflictHistory();
    setConflictCount(0);
    setLastConflict(null);
  }, []);

  /**
   * Manually trigger sync
   */
  const syncNow = useCallback(async () => {
    return documentMutationService.syncNow();
  }, []);

  return {
    // State
    lastConflict,
    conflictCount,
    currentStrategy,
    
    // Actions
    setStrategy,
    getConflictHistory,
    clearConflictHistory,
    syncNow,
    
    // Available strategies
    strategies: [
      { value: 'server-wins' as ConflictStrategy, label: 'Server Wins', description: 'Server changes take precedence' },
      { value: 'client-wins' as ConflictStrategy, label: 'Client Wins', description: 'Your changes take precedence' },
      { value: 'merge' as ConflictStrategy, label: 'Merge', description: 'Attempt to merge non-conflicting changes' }
    ] as const
  };
}

export default useConflictResolution;
