import React from 'react';
import { useConflictResolution } from '@/hooks/useConflictResolution';

/**
 * Props for ConflictResolutionProvider
 */
interface ConflictResolutionProviderProps {
  children: React.ReactNode;
}

/**
 * ConflictResolutionProvider - Global conflict resolution setup
 * 
 * This component initializes the conflict resolution system by:
 * 1. Calling useConflictResolution hook which sets up event listeners
 * 2. Ensuring conflict notifications are active app-wide
 * 
 * Usage: Wrap your app with this provider:
 * ```tsx
 * <ConflictResolutionProvider>
 *   <App />
 * </ConflictResolutionProvider>
 * ```
 */
export function ConflictResolutionProvider({ children }: ConflictResolutionProviderProps) {
  // Initialize conflict resolution - this sets up the event listeners
  useConflictResolution();

  // Just render children - the hook does the work
  return <>{children}</>;
}

export default ConflictResolutionProvider;
