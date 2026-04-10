// Conflict Resolution Components
// Phase 8: Conflict Resolution & Error Handling

export { ConflictResolutionProvider } from '../ConflictResolutionProvider';
export { ConflictStatusIndicator } from '../ConflictStatusIndicator';
export { useConflictResolution } from '@/hooks/useConflictResolution';

// Re-export types
export type { 
  ConflictInfo, 
  ConflictResolutionInfo 
} from '@/hooks/useConflictResolution';

export type { 
  Conflict, 
  ConflictResolution, 
  ConflictStrategy,
  ConflictResolverOptions 
} from '@/services/ConflictResolver';

export { 
  ConflictResolver, 
  conflictResolver 
} from '@/services/ConflictResolver';
