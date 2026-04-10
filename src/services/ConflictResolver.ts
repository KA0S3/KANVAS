import type { DocumentOperation } from './DocumentMutationService';

/**
 * Conflict Resolution Strategy Types
 */
export type ConflictStrategy = 'server-wins' | 'client-wins' | 'merge' | 'manual';

/**
 * Represents a conflicting operation with metadata
 */
export interface Conflict {
  operation: DocumentOperation;
  serverState: any;
  clientState: any;
  field?: string;
  reason: string;
}

/**
 * Result of conflict resolution
 */
export interface ConflictResolution {
  resolved: boolean;
  strategy: ConflictStrategy;
  appliedOperations: DocumentOperation[];
  discardedOperations: DocumentOperation[];
  conflicts: Conflict[];
}

/**
 * Options for conflict resolution
 */
export interface ConflictResolverOptions {
  strategy: ConflictStrategy;
  onManualResolve?: (conflicts: Conflict[]) => Promise<DocumentOperation[]>;
  maxRetries?: number;
}

/**
 * ConflictResolver - Handles three-way merge and conflict resolution
 * 
 * Implements Last-Write-Wins (LWW) with vector clocks for multi-device support.
 * For MVP: Simple "server wins" approach with operation replay.
 * 
 * Future enhancements:
 * - Operational Transform (OT) for true collaborative editing
 * - Vector clocks for multi-device conflict resolution
 * - Field-level merging for non-conflicting changes
 */
export class ConflictResolver {
  private options: ConflictResolverOptions;

  constructor(options: ConflictResolverOptions = { strategy: 'server-wins' }) {
    this.options = { maxRetries: 3, ...options };
  }

  /**
   * Resolve conflicts between client operations and server state
   * 
   * @param clientOps - Operations pending on client
   * @param serverDoc - Current server document state
   * @param clientDoc - Client document state at time of last sync
   * @returns Resolution result with applied/discarded operations
   */
  resolve(
    clientOps: DocumentOperation[],
    serverDoc: any,
    clientDoc: any = null
  ): ConflictResolution {
    const conflicts: Conflict[] = [];
    const appliedOps: DocumentOperation[] = [];
    const discardedOps: DocumentOperation[] = [];

    // Build server asset index for quick lookup
    const serverAssets = serverDoc?.world_document?.assets || {};
    const clientAssets = clientDoc?.world_document?.assets || {};

    for (const op of clientOps) {
      const conflict = this.detectConflict(op, serverAssets, clientAssets);
      
      if (conflict) {
        conflicts.push(conflict);
        
        // Apply strategy
        switch (this.options.strategy) {
          case 'server-wins':
            // Discard this operation - server state takes precedence
            discardedOps.push(op);
            break;
            
          case 'client-wins':
            // Keep operation despite conflict
            appliedOps.push(op);
            break;
            
          case 'merge':
            // Attempt to merge non-conflicting fields
            const mergedOp = this.attemptMerge(op, conflict);
            if (mergedOp) {
              appliedOps.push(mergedOp);
            } else {
              discardedOps.push(op);
            }
            break;
            
          case 'manual':
            // Defer to manual resolution
            appliedOps.push(op); // Keep for manual review
            break;
        }
      } else {
        // No conflict, operation is safe
        appliedOps.push(op);
      }
    }

    return {
      resolved: conflicts.length === 0 || this.options.strategy !== 'manual',
      strategy: this.options.strategy,
      appliedOperations: appliedOps,
      discardedOperations: discardedOps,
      conflicts
    };
  }

  /**
   * Detect if an operation conflicts with server state
   */
  private detectConflict(
    op: DocumentOperation,
    serverAssets: Record<string, any>,
    clientAssets: Record<string, any>
  ): Conflict | null {
    const assetId = this.getOperationAssetId(op);
    if (!assetId) return null;

    const serverAsset = serverAssets[assetId];
    const clientAsset = clientAssets?.[assetId];

    switch (op.op) {
      case 'CREATE_ASSET':
        // Conflict if asset already exists on server with different properties
        if (serverAsset) {
          // Check if it's "the same" asset (same parent, similar properties)
          const sameParent = serverAsset.parentId === op.parentId;
          if (!sameParent) {
            return {
              operation: op,
              serverState: serverAsset,
              clientState: op,
              reason: 'Asset already exists with different parent'
            };
          }
        }
        return null;

      case 'DELETE_ASSET':
        // Conflict if asset doesn't exist on server (already deleted)
        if (!serverAsset) {
          return {
            operation: op,
            serverState: null,
            clientState: clientAsset,
            reason: 'Asset already deleted on server'
          };
        }
        // Conflict if asset was modified by someone else since last sync
        if (clientAsset && this.hasAssetChanged(serverAsset, clientAsset)) {
          return {
            operation: op,
            serverState: serverAsset,
            clientState: clientAsset,
            reason: 'Asset was modified by another user before delete'
          };
        }
        return null;

      case 'MOVE_ASSET':
        // Conflict if asset doesn't exist
        if (!serverAsset) {
          return {
            operation: op,
            serverState: null,
            clientState: clientAsset,
            reason: 'Asset does not exist on server'
          };
        }
        // Conflict if parent changed on server
        if (clientAsset && serverAsset.parentId !== clientAsset.parentId) {
          return {
            operation: op,
            serverState: serverAsset,
            clientState: clientAsset,
            field: 'parentId',
            reason: 'Asset parent was changed by another user'
          };
        }
        return null;

      case 'UPDATE_POSITION':
        // Conflict if asset doesn't exist
        if (!serverAsset) {
          return {
            operation: op,
            serverState: null,
            clientState: clientAsset,
            reason: 'Asset does not exist on server'
          };
        }
        // Conflict if position changed on server
        if (clientAsset && this.hasPositionChanged(serverAsset.position, clientAsset.position)) {
          return {
            operation: op,
            serverState: serverAsset.position,
            clientState: clientAsset.position,
            field: 'position',
            reason: 'Asset position was changed by another user'
          };
        }
        return null;

      case 'UPDATE_METADATA':
        // Conflict if asset doesn't exist
        if (!serverAsset) {
          return {
            operation: op,
            serverState: null,
            clientState: clientAsset,
            reason: 'Asset does not exist on server'
          };
        }
        // Conflict if name changed on server
        if (clientAsset && serverAsset.name !== clientAsset.name) {
          return {
            operation: op,
            serverState: serverAsset,
            clientState: clientAsset,
            field: 'name',
            reason: 'Asset name was changed by another user'
          };
        }
        return null;

      case 'UPDATE_CUSTOM_FIELDS':
        // Conflict only if asset doesn't exist
        if (!serverAsset) {
          return {
            operation: op,
            serverState: null,
            clientState: clientAsset,
            reason: 'Asset does not exist on server'
          };
        }
        // Custom fields can be merged - no conflict
        return null;

      case 'UPDATE_BACKGROUND_CONFIG':
      case 'UPDATE_ASSET_BACKGROUND':
        // Conflict if asset doesn't exist
        if (!serverAsset) {
          return {
            operation: op,
            serverState: null,
            clientState: clientAsset,
            reason: 'Asset does not exist on server'
          };
        }
        return null;

      case 'UPDATE_VIEWPORT':
      case 'UPDATE_GLOBAL_BACKGROUNDS':
        // These are user-specific, not conflicting
        return null;

      default:
        return null;
    }
  }

  /**
   * Attempt to merge conflicting operations
   * Returns merged operation or null if merge not possible
   */
  private attemptMerge(op: DocumentOperation, conflict: Conflict): DocumentOperation | null {
    switch (op.op) {
      case 'UPDATE_CUSTOM_FIELDS':
        // Custom fields can always be merged
        return op;
        
      case 'UPDATE_POSITION':
        // If only z-index changed, that's safe to merge
        if (conflict.field === 'position') {
          const serverPos = conflict.serverState;
          const clientPos = conflict.clientState;
          
          // Check if only z-index differs
          if (serverPos.x === clientPos.x && 
              serverPos.y === clientPos.y && 
              serverPos.width === clientPos.width && 
              serverPos.height === clientPos.height) {
            // Only z-index changed, safe to apply
            return op;
          }
        }
        return null;
        
      default:
        return null;
    }
  }

  /**
   * Filter operations that are safe to apply given server state
   */
  filterNonConflictingOps(
    ops: DocumentOperation[],
    serverDoc: any
  ): DocumentOperation[] {
    const serverAssets = serverDoc?.world_document?.assets || {};

    return ops.filter(op => {
      const assetId = this.getOperationAssetId(op);
      
      switch (op.op) {
        case 'DELETE_ASSET':
          // Only keep if asset still exists
          return !!serverAssets[assetId];
          
        case 'UPDATE_POSITION':
        case 'UPDATE_METADATA':
        case 'UPDATE_BACKGROUND_CONFIG':
        case 'UPDATE_ASSET_BACKGROUND':
        case 'UPDATE_CUSTOM_FIELDS':
        case 'MOVE_ASSET':
          // Only keep if asset exists
          return !!serverAssets[assetId];
          
        case 'CREATE_ASSET':
          // CREATE is always safe (may update existing)
          return true;
          
        case 'UPDATE_VIEWPORT':
        case 'UPDATE_GLOBAL_BACKGROUNDS':
          // Always safe
          return true;
          
        default:
          return true;
      }
    });
  }

  /**
   * Check if an asset has changed between client and server
   */
  private hasAssetChanged(serverAsset: any, clientAsset: any): boolean {
    if (!serverAsset || !clientAsset) return true;
    
    return serverAsset.name !== clientAsset.name ||
           serverAsset.parentId !== clientAsset.parentId ||
           this.hasPositionChanged(serverAsset.position, clientAsset.position);
  }

  /**
   * Check if position has changed
   */
  private hasPositionChanged(serverPos: any, clientPos: any): boolean {
    if (!serverPos || !clientPos) return true;
    
    return serverPos.x !== clientPos.x ||
           serverPos.y !== clientPos.y ||
           serverPos.width !== clientPos.width ||
           serverPos.height !== clientPos.height ||
           serverPos.zIndex !== clientPos.zIndex;
  }

  /**
   * Extract asset ID from operation
   */
  private getOperationAssetId(op: DocumentOperation): string | null {
    switch (op.op) {
      case 'CREATE_ASSET':
      case 'DELETE_ASSET':
      case 'MOVE_ASSET':
      case 'UPDATE_POSITION':
      case 'UPDATE_METADATA':
      case 'UPDATE_BACKGROUND_CONFIG':
      case 'UPDATE_ASSET_BACKGROUND':
      case 'UPDATE_CUSTOM_FIELDS':
        return op.assetId;
      case 'UPDATE_VIEWPORT':
      case 'UPDATE_GLOBAL_BACKGROUNDS':
        return null;
      default:
        return null;
    }
  }

  /**
   * Update resolver options
   */
  setOptions(options: Partial<ConflictResolverOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current strategy
   */
  getStrategy(): ConflictStrategy {
    return this.options.strategy;
  }
}

// Export singleton instance with default strategy
export const conflictResolver = new ConflictResolver({ strategy: 'server-wins' });
