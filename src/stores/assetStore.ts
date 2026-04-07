import { create } from 'zustand';
import { subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware';
import type { Asset } from '@/components/AssetItem';
import type { CustomField, CustomFieldValue, GlobalCustomField, ViewportDisplaySettings } from '@/types/extendedAsset';
import { DEFAULT_VIEWPORT_DISPLAY_SETTINGS } from '@/types/extendedAsset';
import { useBookStore } from './bookStoreSimple';
import { StorageCleanup } from '@/utils/storageCleanup';

interface AssetStore {
  // Book-scoped asset registry for isolation
  bookAssets: Record<string, Record<string, Asset>>;
  
  // Active asset state
  currentActiveId: string | null;
  currentViewportId: string | null; // Current viewport context (enteredAssetId)
  
  // Global custom fields (book-scoped)
  bookGlobalCustomFields: Record<string, GlobalCustomField[]>;
  
  // Background editing state
  isEditingBackground: boolean;
  
  // Helper methods
  getCurrentBookId: () => string | null;
  
  // Get current book's assets
  getCurrentBookAssets: () => Record<string, Asset>;
  getCurrentBookGlobalCustomFields: () => GlobalCustomField[];
  
  // World-aware actions
  loadWorldData: (worldData: any) => void;
  getWorldData: () => any;
  clearWorldData: () => void;
  clearBookData: (bookId: string) => void;
  
  // Actions
  createAsset: (assetData: Omit<Asset, 'id' | 'children'>, parentId?: string) => string;
  reparentAsset: (assetId: string, newParentId?: string) => void;
  deleteAsset: (assetId: string) => void;
  updateAssetPosition: (assetId: string, x: number, y: number) => void;
  updateAssetSize: (assetId: string, width: number, height: number) => void;
  updateAsset: (assetId: string, updates: Partial<Omit<Asset, 'id' | 'children' | 'parentId'>>) => void;
  setActiveAsset: (assetId: string | null) => void;
  setCurrentViewportId: (assetId: string | null) => void;
  getActiveAsset: () => Asset | null;
  getRootAssets: () => Asset[];
  getAssetChildren: (parentId: string) => Asset[];
  getAssetTree: (rootId?: string) => Asset[];
  
  // Custom Fields
  addCustomField: (assetId: string, field: Omit<CustomField, 'id'>) => void;
  updateCustomField: (assetId: string, fieldId: string, updates: Partial<CustomField>) => void;
  removeCustomField: (assetId: string, fieldId: string) => void;
  updateCustomFieldValue: (assetId: string, fieldId: string, value: string) => void;
  
  // Global Custom Fields
  addGlobalCustomField: (field: Omit<GlobalCustomField, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateGlobalCustomField: (fieldId: string, updates: Partial<GlobalCustomField>) => void;
  removeGlobalCustomField: (fieldId: string) => void;
  applyGlobalFieldsToAsset: (assetId: string) => void;
  
  // Background editing actions
  setIsEditingBackground: (editing: boolean) => void;
  
  // Expansion state management
  expandAll: () => void;
  collapseAll: () => void;
  toggleAssetExpansion: (assetId: string) => void;
}

export const useAssetStore = create<AssetStore>()(
  persist(
    subscribeWithSelector(
      (set, get) => ({
    // Initial state
    bookAssets: {},
    currentActiveId: null,
    currentViewportId: null,
    bookGlobalCustomFields: {},
    isEditingBackground: false,

  // Helper to get current book ID
  getCurrentBookId: () => {
    const bookStore = useBookStore.getState();
    return bookStore.currentBookId;
  },

  // Get current book's assets
  getCurrentBookAssets: () => {
    const state = get();
    const bookId = state.getCurrentBookId();
    return state.bookAssets[bookId] || {};
  },

  // Get current book's global custom fields
  getCurrentBookGlobalCustomFields: () => {
    const state = get();
    const bookId = state.getCurrentBookId();
    return state.bookGlobalCustomFields[bookId] || [];
  },

  // Create a new asset
  createAsset: (assetData: Omit<Asset, 'id' | 'children'>, parentId?: string) => {
    try {
      const id = crypto.randomUUID();
      const now = Date.now();
      const newAsset: Asset = {
        ...assetData,
        id,
        children: [],
        parentId,
        width: assetData.width || 200,
        height: assetData.height || 150,
        customFields: assetData.customFields || [],
        customFieldValues: assetData.customFieldValues || [],
        tags: assetData.tags || [],
        viewportConfig: assetData.viewportConfig || {
          zoom: 1,
          panX: 0,
          panY: 0,
        },
        backgroundConfig: assetData.backgroundConfig || {
          gridSize: 40,
        },
        viewportDisplaySettings: assetData.viewportDisplaySettings || { ...DEFAULT_VIEWPORT_DISPLAY_SETTINGS },
        createdAt: now,
        updatedAt: now,
      };

      set((state) => {
        const bookId = state.getCurrentBookId();
        if (!bookId) {
          console.warn('[AssetStore] Cannot create asset - no current book');
          return state;
        }
        
        const newBookAssets = { ...state.bookAssets };
        if (!newBookAssets[bookId]) {
          newBookAssets[bookId] = {};
        }
        
        // Atomic operation: Add the new asset to book-specific registry
        newBookAssets[bookId][id] = newAsset;
        
        // If it has a parent, add this asset to parent's children array and expand the parent
        if (parentId && newBookAssets[bookId][parentId]) {
          newBookAssets[bookId][parentId] = {
            ...newBookAssets[bookId][parentId],
            children: [...newBookAssets[bookId][parentId].children, id],
            isExpanded: true, // Auto-expand parent to show new asset
            updatedAt: now,
          };
        }
        
        return { bookAssets: newBookAssets };
      });
      
      return id;
    } catch (error) {
      console.error('[AssetStore] Failed to create asset:', error);
      // Return a fallback ID or throw a more descriptive error
      const fallbackId = `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      console.warn('[AssetStore] Using fallback asset ID:', fallbackId);
      return fallbackId;
    }
  },

  // Reparent an asset (move from one parent to another)
  reparentAsset: (assetId: string, newParentId?: string) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const newBookAssets = { ...state.bookAssets };
      const bookAssets = newBookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      
      if (!asset) return state;

      const oldParentId = asset.parentId;

      // Remove from old parent's children array
      if (oldParentId && bookAssets[oldParentId]) {
        newBookAssets[bookId][oldParentId] = {
          ...bookAssets[oldParentId],
          children: bookAssets[oldParentId].children.filter(id => id !== assetId),
        };
      }

      // Add to new parent's children array
      if (newParentId && bookAssets[newParentId]) {
        newBookAssets[bookId][newParentId] = {
          ...bookAssets[newParentId],
          children: [...bookAssets[newParentId].children, assetId],
        };
      }

      // Update the asset's parent reference
      newBookAssets[bookId][assetId] = {
        ...asset,
        parentId: newParentId,
      };

      return { bookAssets: newBookAssets };
    });
  },

  // Update asset position
  updateAssetPosition: (assetId: string, x: number, y: number) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;

      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          x,
          y,
        },
      };

      return { bookAssets: newBookAssets };
    });
  },

  // Update asset size
  updateAssetSize: (assetId: string, width: number, height: number) => {
    try {
      set((state) => {
        const bookId = state.getCurrentBookId();
        if (!bookId) return state;
        
        const bookAssets = state.bookAssets[bookId] || {};
        const asset = bookAssets[assetId];
        if (!asset) return state;

        const newBookAssets = { ...state.bookAssets };
        newBookAssets[bookId] = {
          ...bookAssets,
          [assetId]: {
            ...asset,
            width: Math.max(100, width), // Minimum width of 100px
            height: Math.max(80, height), // Minimum height of 80px
          },
        };

        return { bookAssets: newBookAssets };
      });
    } catch (error) {
      console.error('[AssetStore] Failed to update asset size:', error);
      // Continue without updating size to prevent crashes
    }
  },

  // Update asset properties
  updateAsset: (assetId: string, updates: Partial<Omit<Asset, 'id' | 'children' | 'parentId'>>) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;

      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          ...updates,
        },
      };

      return { bookAssets: newBookAssets };
    });
  },

  // Delete an asset and all its descendants recursively
  deleteAsset: (assetId: string) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const newBookAssets = { ...state.bookAssets };
      const bookAssets = newBookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      
      if (!asset) return state;

      // Recursive function to collect all descendant IDs
      const collectDescendants = (id: string): string[] => {
        const currentAsset = bookAssets[id];
        if (!currentAsset || currentAsset.children.length === 0) return [];
        
        let descendants: string[] = [];
        for (const childId of currentAsset.children) {
          descendants.push(childId);
          descendants = descendants.concat(collectDescendants(childId));
        }
        return descendants;
      };

      // Collect all IDs to delete (asset + all descendants)
      const idsToDelete = [assetId, ...collectDescendants(assetId)];

      // Remove from parent's children array if it has a parent
      if (asset.parentId && bookAssets[asset.parentId]) {
        newBookAssets[bookId][asset.parentId] = {
          ...bookAssets[asset.parentId],
          children: bookAssets[asset.parentId].children.filter(id => !idsToDelete.includes(id)),
        };
      }

      // Delete all assets from registry
      idsToDelete.forEach(id => {
        delete newBookAssets[bookId][id];
      });

      // Clear active asset if it was deleted
      const newActiveId = state.currentActiveId && idsToDelete.includes(state.currentActiveId) 
        ? null 
        : state.currentActiveId;

      return { 
        bookAssets: newBookAssets,
        currentActiveId: newActiveId,
      };
    });
  },

  // Set the active asset
  setActiveAsset: (assetId: string | null) => {
    try {
      set({ currentActiveId: assetId });
    } catch (error) {
      console.error('[AssetStore] Failed to set active asset:', error);
      // Continue with null active asset to prevent crashes
      set({ currentActiveId: null });
    }
  },

  // Set the current viewport context
  setCurrentViewportId: (assetId: string | null) => {
    set({ currentViewportId: assetId });
  },

  // Get the active asset object
  getActiveAsset: () => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId || !state.currentActiveId) return null;
    
    const bookAssets = state.bookAssets[bookId] || {};
    return bookAssets[state.currentActiveId] || null;
  },

  // Get all root-level assets (no parent)
  getRootAssets: () => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) return [];
    
    const bookAssets = state.bookAssets[bookId] || {};
    return Object.values(bookAssets).filter(asset => !asset.parentId);
  },

  // Get direct children of a specific asset
  getAssetChildren: (parentId: string) => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) return [];
    
    const bookAssets = state.bookAssets[bookId] || {};
    const parent = bookAssets[parentId];
    if (!parent) return [];
    
    return parent.children
      .map(childId => bookAssets[childId])
      .filter(Boolean) as Asset[];
  },

  // Get entire tree starting from root or specific asset
  getAssetTree: (rootId?: string) => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) return [];
    
    const bookAssets = state.bookAssets[bookId] || {};
    const result: Asset[] = [];
    
    const traverse = (assetId: string) => {
      const asset = bookAssets[assetId];
      if (!asset) return;
      
      result.push(asset);
      asset.children.forEach(traverse);
    };

    if (rootId) {
      traverse(rootId);
    } else {
      // Start from all root assets
      Object.values(bookAssets).filter(asset => !asset.parentId).forEach(asset => traverse(asset.id));
    }
    
    return result;
  },

  // Custom Fields
  addCustomField: (assetId: string, field: Omit<CustomField, 'id'>) => {
    const newField: CustomField = {
      ...field,
      id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;
      
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          customFields: [...(asset.customFields || []), newField],
          updatedAt: Date.now(),
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  updateCustomField: (assetId: string, fieldId: string, updates: Partial<CustomField>) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;
      
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          customFields: (asset.customFields || []).map((field) =>
            field.id === fieldId ? { ...field, ...updates } : field
          ),
          updatedAt: Date.now(),
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  removeCustomField: (assetId: string, fieldId: string) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;
      
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          customFields: (asset.customFields || []).filter((field) => field.id !== fieldId),
          customFieldValues: (asset.customFieldValues || []).filter((value) => value.fieldId !== fieldId),
          updatedAt: Date.now(),
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  updateCustomFieldValue: (assetId: string, fieldId: string, value: string) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;
      
      const existingValues = asset.customFieldValues || [];
      const existingValueIndex = existingValues.findIndex((v) => v.fieldId === fieldId);
      
      let newValues;
      if (existingValueIndex >= 0) {
        // Update existing value
        newValues = [...existingValues];
        newValues[existingValueIndex] = { fieldId, value };
      } else {
        // Add new value
        newValues = [...existingValues, { fieldId, value }];
      }
      
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          customFieldValues: newValues,
          updatedAt: Date.now(),
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  // Global Custom Fields
  addGlobalCustomField: (field: Omit<GlobalCustomField, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newField: GlobalCustomField = {
      ...field,
      id: `global-field-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };
      const currentFields = newBookGlobalCustomFields[bookId] || [];
      newBookGlobalCustomFields[bookId] = [...currentFields, newField];
      
      return { bookGlobalCustomFields: newBookGlobalCustomFields };
    });
  },

  updateGlobalCustomField: (fieldId: string, updates: Partial<GlobalCustomField>) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };
      const currentFields = newBookGlobalCustomFields[bookId] || [];
      newBookGlobalCustomFields[bookId] = currentFields.map((field) =>
        field.id === fieldId ? { ...field, ...updates, updatedAt: Date.now() } : field
      );
      
      return { bookGlobalCustomFields: newBookGlobalCustomFields };
    });
  },

  removeGlobalCustomField: (fieldId: string) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };
      const currentFields = newBookGlobalCustomFields[bookId] || [];
      newBookGlobalCustomFields[bookId] = currentFields.filter((field) => field.id !== fieldId);
      
      // Remove this field from all assets in the current book
      const newBookAssets = { ...state.bookAssets };
      const bookAssets = newBookAssets[bookId] || {};
      
      Object.keys(bookAssets).forEach((assetId) => {
        const asset = bookAssets[assetId];
        newBookAssets[bookId][assetId] = {
          ...asset,
          customFields: (asset.customFields || []).filter((field) => field.id !== fieldId),
          customFieldValues: (asset.customFieldValues || []).filter((value) => value.fieldId !== fieldId),
          updatedAt: Date.now(),
        };
      });
      
      return {
        bookGlobalCustomFields: newBookGlobalCustomFields,
        bookAssets: newBookAssets,
      };
    });
  },

  applyGlobalFieldsToAsset: (assetId: string) => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) return;
    
    const bookAssets = state.bookAssets[bookId] || {};
    const asset = bookAssets[assetId];
    if (!asset) return;
    
    const globalFields = state.bookGlobalCustomFields[bookId] || [];
    const existingFieldIds = new Set((asset.customFields || []).map((field) => field.id));
    const newGlobalFields = globalFields.filter(
      (globalField) => !existingFieldIds.has(globalField.id)
    );
    
    if (newGlobalFields.length === 0) return;
    
    const newCustomFields = newGlobalFields.map((globalField): CustomField => ({
      id: globalField.id,
      label: globalField.label,
      type: globalField.type,
      displayInViewport: globalField.displayInViewport,
      isGlobal: true,
    }));
    
    set((state) => {
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          customFields: [...(asset.customFields || []), ...newCustomFields],
          updatedAt: Date.now(),
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  // Viewport Display Settings
  updateViewportDisplaySettings: (assetId: string, settings: Partial<ViewportDisplaySettings>) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;
      
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          viewportDisplaySettings: {
            ...(asset.viewportDisplaySettings || { ...DEFAULT_VIEWPORT_DISPLAY_SETTINGS }),
            ...settings,
          },
          updatedAt: Date.now(),
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },


  // Background editing actions
  setIsEditingBackground: (editing: boolean) => {
    set({ isEditingBackground: Boolean(editing) });
  },

  // Expansion state management
  expandAll: () => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const newBookAssets = { ...state.bookAssets };
      const bookAssets = newBookAssets[bookId] || {};
      
      // Set all assets with children to expanded
      Object.keys(bookAssets).forEach(assetId => {
        const asset = bookAssets[assetId];
        if (asset.children && asset.children.length > 0) {
          newBookAssets[bookId][assetId] = { ...asset, isExpanded: true };
        }
      });
      
      return { bookAssets: newBookAssets };
    });
  },

  collapseAll: () => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const newBookAssets = { ...state.bookAssets };
      const bookAssets = newBookAssets[bookId] || {};
      
      // Set all assets with children to collapsed
      Object.keys(bookAssets).forEach(assetId => {
        const asset = bookAssets[assetId];
        if (asset.children && asset.children.length > 0) {
          newBookAssets[bookId][assetId] = { ...asset, isExpanded: false };
        }
      });
      
      return { bookAssets: newBookAssets };
    });
  },

  toggleAssetExpansion: (assetId: string) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset || !asset.children || asset.children.length === 0) return state;
      
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          isExpanded: !asset.isExpanded,
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  // World-aware methods
  loadWorldData: (worldData) => {
    if (worldData) {
      const bookId = get().getCurrentBookId();
      if (!bookId) {
        console.warn('[AssetStore] Cannot load world data - no current book');
        return;
      }
      
      set((state) => {
        const newBookAssets = { ...state.bookAssets };
        const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };
        
        newBookAssets[bookId] = worldData.assets || {};
        newBookGlobalCustomFields[bookId] = worldData.globalCustomFields || [];
        
        return {
          bookAssets: newBookAssets,
          currentActiveId: null,
          currentViewportId: null,
          bookGlobalCustomFields: newBookGlobalCustomFields,
        };
      });
    }
  },

  getWorldData: () => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) {
      return { assets: {}, globalCustomFields: [] };
    }
    
    return {
      assets: state.bookAssets[bookId] || {},
      globalCustomFields: state.bookGlobalCustomFields[bookId] || [],
    };
  },

  clearWorldData: () => {
    const bookId = get().getCurrentBookId();
    if (!bookId) {
      console.warn('[AssetStore] Cannot clear world data - no current book');
      return;
    }
    
    set((state) => {
      const newBookAssets = { ...state.bookAssets };
      const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };
      
      newBookAssets[bookId] = {};
      newBookGlobalCustomFields[bookId] = [];
      
      return {
        bookAssets: newBookAssets,
        currentActiveId: null,
        currentViewportId: null,
        bookGlobalCustomFields: newBookGlobalCustomFields,
        isEditingBackground: false,
      };
    });
  },

  clearBookData: (bookId: string) => {
    set((state) => {
      const newBookAssets = { ...state.bookAssets };
      const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };
      
      delete newBookAssets[bookId];
      delete newBookGlobalCustomFields[bookId];
      
      // Clear active state if it was this book
      const currentBookId = state.getCurrentBookId();
      const newActiveId = (currentBookId === bookId) ? null : state.currentActiveId;
      const newViewportId = (currentBookId === bookId) ? null : state.currentViewportId;
      
      return {
        bookAssets: newBookAssets,
        bookGlobalCustomFields: newBookGlobalCustomFields,
        currentActiveId: newActiveId,
        currentViewportId: newViewportId,
      };
    });
  },
})),
      {
        name: 'kanvas-assets',
        storage: createJSONStorage(() => ({
          getItem: (name) => {
            try {
              return localStorage.getItem(name);
            } catch (error) {
              console.warn('[AssetStore] Failed to get item from localStorage:', error);
              return null;
            }
          },
          setItem: (name, value) => {
            try {
              // Check storage quota before setting
              StorageCleanup.checkAndCleanup();
              localStorage.setItem(name, value);
            } catch (error) {
              if (error instanceof Error && error.name === 'QuotaExceededError') {
                console.error('[AssetStore] Storage quota exceeded, attempting cleanup...');
                // Emergency cleanup
                StorageCleanup.cleanupOldBackgrounds();
                StorageCleanup.cleanupExpiredData();
                
                try {
                  localStorage.setItem(name, value);
                } catch (retryError) {
                  console.error('[AssetStore] Still unable to save after cleanup - continuing with in-memory state only:', retryError);
                  // CRITICAL FIX: Don't throw - let state update continue in memory
                  // The app will work without persistence for this session
                }
              } else {
                console.error('[AssetStore] Failed to set item in localStorage - continuing in memory:', error);
                // CRITICAL FIX: Don't throw - let state update continue
              }
            }
          },
          removeItem: (name) => {
            try {
              localStorage.removeItem(name);
            } catch (error) {
              console.warn('[AssetStore] Failed to remove item from localStorage:', error);
            }
          },
        })),
        // Simplified persist - avoid custom serialization issues
        partialize: (state) => ({
          bookAssets: state.bookAssets,
          currentActiveId: state.currentActiveId,
          currentViewportId: state.currentViewportId,
          bookGlobalCustomFields: state.bookGlobalCustomFields,
          isEditingBackground: state.isEditingBackground,
        }),
      }
    )
  );

// Auto-save functionality: Now handled by autosaveService
// This subscription is kept for compatibility but autosaveService handles cloud saves
useAssetStore.subscribe(
  (state) => state,
  (state) => {
    const bookStore = useBookStore.getState();
    if (bookStore.currentBookId) {
      const worldData = {
        assets: state.bookAssets[bookStore.currentBookId] || {},
        globalCustomFields: state.bookGlobalCustomFields[bookStore.currentBookId] || [],
      };
      // Update local book store immediately for UI consistency
      // Cloud sync is handled by autosaveService
      bookStore.updateWorldData(bookStore.currentBookId, worldData);
    }
  },
  {
    equalityFn: (a, b) => {
      // Only trigger auto-save for relevant changes
      return (
        a.bookAssets === b.bookAssets &&
        a.bookGlobalCustomFields === b.bookGlobalCustomFields
      );
    },
  }
);
