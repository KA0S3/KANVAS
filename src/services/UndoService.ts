import { useBookStore } from '@/stores/bookStoreSimple';
import { useAssetStore } from '@/stores/assetStore';
import { useTagStore } from '@/stores/tagStore';
import { useBackgroundStore } from '@/stores/backgroundStore';
import type { Book } from '@/types/book';
import type { Asset } from '@/components/AssetItem';
import type { Tag } from '@/stores/tagStore';

interface UndoState {
  action: 'create' | 'update' | 'delete';
  type: 'book' | 'asset' | 'tag' | 'background';
  data: any;
  previousState?: any;
  timestamp: number;
}

interface UndoStack {
  past: UndoState[];
  present: any;
  future: UndoState[];
}

class UndoService {
  private static instance: UndoService;
  private stacks: Map<string, UndoStack> = new Map();
  private maxStackSize = 50;
  private currentProjectId: string | null = null;

  static getInstance(): UndoService {
    if (!UndoService.instance) {
      UndoService.instance = new UndoService();
    }
    return UndoService.instance;
  }

  // Set current project context
  setCurrentProject(projectId: string): void {
    this.currentProjectId = projectId;
    if (!this.stacks.has(projectId)) {
      this.stacks.set(projectId, {
        past: [],
        present: null,
        future: []
      });
    }
  }

  // Record an action for undo
  recordAction(
    action: 'create' | 'update' | 'delete',
    type: 'book' | 'asset' | 'tag' | 'background',
    data: any,
    previousState?: any
  ): void {
    if (!this.currentProjectId) return;

    const stack = this.stacks.get(this.currentProjectId);
    if (!stack) return;

    const undoState: UndoState = {
      action,
      type,
      data,
      previousState,
      timestamp: Date.now()
    };

    // Add to past and clear future (new action branch)
    stack.past.push(undoState);
    stack.future = [];

    // Limit stack size
    if (stack.past.length > this.maxStackSize) {
      stack.past.shift();
    }

    console.log(`[UndoService] Recorded ${action} ${type}:`, data.id || data.name);
  }

  // Undo last action
  async undo(): Promise<boolean> {
    if (!this.currentProjectId) return false;

    const stack = this.stacks.get(this.currentProjectId);
    if (!stack || stack.past.length === 0) return false;

    const lastAction = stack.past.pop()!;
    stack.future.push(lastAction);

    try {
      await this.revertAction(lastAction);
      console.log(`[UndoService] Undid ${lastAction.action} ${lastAction.type}`);
      return true;
    } catch (error) {
      console.error('[UndoService] Failed to undo:', error);
      // Put it back in past if failed
      stack.past.push(lastAction);
      stack.future.pop();
      return false;
    }
  }

  // Redo last undone action
  async redo(): Promise<boolean> {
    if (!this.currentProjectId) return false;

    const stack = this.stacks.get(this.currentProjectId);
    if (!stack || stack.future.length === 0) return false;

    const actionToRedo = stack.future.pop()!;
    stack.past.push(actionToRedo);

    try {
      await this.replayAction(actionToRedo);
      console.log(`[UndoService] Redid ${actionToRedo.action} ${actionToRedo.type}`);
      return true;
    } catch (error) {
      console.error('[UndoService] Failed to redo:', error);
      // Put it back in future if failed
      stack.future.push(actionToRedo);
      stack.past.pop();
      return false;
    }
  }

  // Check if undo is available
  canUndo(): boolean {
    if (!this.currentProjectId) return false;
    const stack = this.stacks.get(this.currentProjectId);
    return stack ? stack.past.length > 0 : false;
  }

  // Check if redo is available
  canRedo(): boolean {
    if (!this.currentProjectId) return false;
    const stack = this.stacks.get(this.currentProjectId);
    return stack ? stack.future.length > 0 : false;
  }

  // Get description of next undo action
  getNextUndoDescription(): string | null {
    if (!this.currentProjectId) return null;
    const stack = this.stacks.get(this.currentProjectId);
    if (!stack || stack.past.length === 0) return null;

    const next = stack.past[stack.past.length - 1];
    return this.getActionDescription(next);
  }

  // Get description of next redo action
  getNextRedoDescription(): string | null {
    if (!this.currentProjectId) return null;
    const stack = this.stacks.get(this.currentProjectId);
    if (!stack || stack.future.length === 0) return null;

    const next = stack.future[stack.future.length - 1];
    return this.getActionDescription(next);
  }

  // Clear undo stack for current project
  clearStack(): void {
    if (!this.currentProjectId) return;
    const stack = this.stacks.get(this.currentProjectId);
    if (stack) {
      stack.past = [];
      stack.future = [];
    }
  }

  // Private methods

  private async revertAction(action: UndoState): Promise<void> {
    const { action: actionType, type, data, previousState } = action;

    switch (type) {
      case 'book':
        await this.revertBookAction(actionType, data, previousState);
        break;
      case 'asset':
        await this.revertAssetAction(actionType, data, previousState);
        break;
      case 'tag':
        await this.revertTagAction(actionType, data, previousState);
        break;
      case 'background':
        await this.revertBackgroundAction(actionType, data, previousState);
        break;
    }
  }

  private async replayAction(action: UndoState): Promise<void> {
    const { action: actionType, type, data } = action;

    switch (type) {
      case 'book':
        await this.replayBookAction(actionType, data);
        break;
      case 'asset':
        await this.replayAssetAction(actionType, data);
        break;
      case 'tag':
        await this.replayTagAction(actionType, data);
        break;
      case 'background':
        await this.replayBackgroundAction(actionType, data);
        break;
    }
  }

  private async revertBookAction(actionType: string, data: Book, previousState?: Book): Promise<void> {
    const bookStore = useBookStore.getState();

    switch (actionType) {
      case 'create':
        // Undo create = delete the book (use soft delete for UUID projects)
        await bookStore.deleteBook(data.id);
        break;
      case 'delete':
        // Undo delete = restore the book with original ID
        if (previousState) {
          const tempId = bookStore.createBook(previousState);
          // Replace with original ID
          const currentBooks = bookStore.books;
          delete currentBooks[tempId];
          currentBooks[previousState.id] = previousState;
        }
        break;
      case 'update':
        // Undo update = restore previous state
        if (previousState) {
          bookStore.updateBook(data.id, previousState);
        }
        break;
    }
  }

  private async replayBookAction(actionType: string, data: Book): Promise<void> {
    const bookStore = useBookStore.getState();

    switch (actionType) {
      case 'create':
        // Redo create = create the book again with original ID
        const tempId = bookStore.createBook(data);
        const currentBooks = bookStore.books;
        delete currentBooks[tempId];
        currentBooks[data.id] = data;
        break;
      case 'delete':
        // Redo delete = delete the book again
        await bookStore.deleteBook(data.id);
        break;
      case 'update':
        // Redo update = apply the update again
        bookStore.updateBook(data.id, data);
        break;
    }
  }

  private async revertAssetAction(actionType: string, data: Asset, previousState?: Asset): Promise<void> {
    const assetStore = useAssetStore.getState();

    switch (actionType) {
      case 'create':
        // Undo create = delete the asset (local only)
        assetStore.deleteAsset(data.id);
        break;
      case 'delete':
        // Undo delete = restore the asset locally
        if (previousState) {
          // Manually restore to local store with original ID
          const currentAssets = assetStore.getCurrentBookAssets();
          if (!currentAssets[previousState.id]) {
            // Create with temp ID first
            const tempId = assetStore.createAsset(previousState, previousState.parentId);
            // Replace with original ID
            delete currentAssets[tempId];
            currentAssets[previousState.id] = previousState;
            // Restore parent-child relationship
            if (previousState.parentId && currentAssets[previousState.parentId]) {
              const parent = currentAssets[previousState.parentId];
              if (!parent.children.includes(previousState.id)) {
                currentAssets[previousState.parentId] = {
                  ...parent,
                  children: [...parent.children, previousState.id]
                };
              }
            }
          }
        }
        break;
      case 'update':
        // Undo update = restore previous state (local only)
        if (previousState) {
          assetStore.updateAsset(previousState.id, previousState);
        }
        break;
    }
  }

  private async replayAssetAction(actionType: string, data: Asset): Promise<void> {
    const assetStore = useAssetStore.getState();

    switch (actionType) {
      case 'create':
        // Redo create = create the asset again with original ID (local only)
        const tempId = assetStore.createAsset(data, data.parentId);
        const currentAssets = assetStore.getCurrentBookAssets();
        delete currentAssets[tempId];
        currentAssets[data.id] = data;
        break;
      case 'delete':
        // Redo delete = delete the asset again (local only)
        assetStore.deleteAsset(data.id);
        break;
      case 'update':
        // Redo update = apply the update again (local only)
        assetStore.updateAsset(data.id, data);
        break;
    }
  }

  private async revertTagAction(actionType: string, data: Tag, previousState?: Tag): Promise<void> {
    const tagStore = useTagStore.getState();

    switch (actionType) {
      case 'create':
        // Undo create = delete the tag (local only)
        tagStore.deleteTag(data.id);
        break;
      case 'delete':
        // Undo delete = restore the tag locally
        if (previousState) {
          // Manually restore to local store with original ID
          const tempId = tagStore.createTag(previousState);
          delete tagStore.tags[tempId];
          tagStore.tags[previousState.id] = previousState;
        }
        break;
      case 'update':
        // Undo update = restore previous state (local only)
        if (previousState) {
          tagStore.updateTag(previousState.id, previousState);
        }
        break;
    }
  }

  private async replayTagAction(actionType: string, data: Tag): Promise<void> {
    const tagStore = useTagStore.getState();

    switch (actionType) {
      case 'create':
        // Redo create = create the tag again with original ID (local only)
        const tempId = tagStore.createTag(data);
        delete tagStore.tags[tempId];
        tagStore.tags[data.id] = data;
        break;
      case 'delete':
        // Redo delete = delete the tag again (local only)
        tagStore.deleteTag(data.id);
        break;
      case 'update':
        // Redo update = apply the update again (local only)
        tagStore.updateTag(data.id, data);
        break;
    }
  }

  private revertBackgroundAction(actionType: string, data: any, previousState?: any): void {
    const backgroundStore = useBackgroundStore.getState();

    switch (actionType) {
      case 'create':
        // Undo create = delete the background
        // Backgrounds are stored in localStorage, so we remove them
        localStorage.removeItem(`kanvas-background-${data.id}`);
        break;
      case 'delete':
        // Undo delete = restore the background
        if (previousState) {
          backgroundStore.setBackground(data.id, previousState);
        }
        break;
      case 'update':
        // Undo update = restore previous state
        if (previousState) {
          backgroundStore.setBackground(data.id, previousState);
        }
        break;
    }
  }

  private replayBackgroundAction(actionType: string, data: any): void {
    const backgroundStore = useBackgroundStore.getState();

    switch (actionType) {
      case 'create':
        // Redo create = create the background again
        backgroundStore.setBackground(data.id, data);
        break;
      case 'delete':
        // Redo delete = delete the background again
        // Backgrounds are stored in localStorage, so we remove them
        localStorage.removeItem(`kanvas-background-${data.id}`);
        break;
      case 'update':
        // Redo update = apply the update again
        backgroundStore.setBackground(data.id, data);
        break;
    }
  }

  private getActionDescription(action: UndoState): string {
    const { action: actionType, type, data } = action;
    const name = data.name || data.title || data.id || 'Unknown';
    
    const actionText = actionType === 'create' ? 'Create' : 
                      actionType === 'delete' ? 'Delete' : 'Update';
    
    const typeText = type.charAt(0).toUpperCase() + type.slice(1);
    
    return `${actionText} ${typeText}: ${name}`;
  }

  clearAllStacks(): void {
    this.stacks.clear();
  }
}

export const undoService = UndoService.getInstance();
