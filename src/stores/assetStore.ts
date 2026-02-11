import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Asset } from '@/components/AssetItem';
import type { CustomField, CustomFieldValue, GlobalCustomField, ViewportDisplaySettings } from '@/types/extendedAsset';
import { DEFAULT_VIEWPORT_DISPLAY_SETTINGS } from '@/types/extendedAsset';
import { useBookStore } from './bookStoreSimple';

interface AssetStore {
  // Registry for O(1) lookups
  assets: Record<string, Asset>;
  
  // Active asset state
  currentActiveId: string | null;
  currentViewportId: string | null; // Current viewport context (enteredAssetId)
  
  // Global custom fields
  globalCustomFields: GlobalCustomField[];

  // Viewport UI settings
  viewportOffset: { x: number; y: number };
  viewportScale: number;
  
  // World-aware actions
  loadWorldData: (worldData: any) => void;
  getWorldData: () => any;
  clearWorldData: () => void;
  
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
  
  // Viewport Display Settings
  updateViewportDisplaySettings: (assetId: string, settings: Partial<ViewportDisplaySettings>) => void;

  // Viewport UI Settings
  setViewportOffset: (offset: { x: number; y: number }) => void;
  setViewportScale: (scale: number) => void;
}

export const useAssetStore = create<AssetStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    assets: {},
    currentActiveId: null,
    currentViewportId: null,
    globalCustomFields: [],
    viewportOffset: { x: -45, y: -20 },
    viewportScale: 1,

  // Create a new asset
  createAsset: (assetData: Omit<Asset, 'id' | 'children'>, parentId?: string) => {
    const id = crypto.randomUUID();
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
    };

    set((state) => {
      const newAssets = { ...state.assets };
      
      // Add the new asset to registry
      newAssets[id] = newAsset;
      
      // If it has a parent, add this asset to parent's children array
      if (parentId && newAssets[parentId]) {
        newAssets[parentId] = {
          ...newAssets[parentId],
          children: [...newAssets[parentId].children, id],
        };
      }
      
      return { assets: newAssets };
    });

    return id;
  },

  // Reparent an asset (move from one parent to another)
  reparentAsset: (assetId: string, newParentId?: string) => {
    set((state) => {
      const newAssets = { ...state.assets };
      const asset = newAssets[assetId];
      
      if (!asset) return state;

      const oldParentId = asset.parentId;

      // Remove from old parent's children array
      if (oldParentId && newAssets[oldParentId]) {
        newAssets[oldParentId] = {
          ...newAssets[oldParentId],
          children: newAssets[oldParentId].children.filter(id => id !== assetId),
        };
      }

      // Add to new parent's children array
      if (newParentId && newAssets[newParentId]) {
        newAssets[newParentId] = {
          ...newAssets[newParentId],
          children: [...newAssets[newParentId].children, assetId],
        };
      }

      // Update the asset's parent reference
      newAssets[assetId] = {
        ...asset,
        parentId: newParentId,
      };

      return { assets: newAssets };
    });
  },

  // Update asset position
  updateAssetPosition: (assetId: string, x: number, y: number) => {
    set((state) => {
      const asset = state.assets[assetId];
      if (!asset) return state;

      return {
        assets: {
          ...state.assets,
          [assetId]: {
            ...asset,
            x,
            y,
          },
        },
      };
    });
  },

  // Update asset size
  updateAssetSize: (assetId: string, width: number, height: number) => {
    set((state) => {
      const asset = state.assets[assetId];
      if (!asset) return state;

      return {
        assets: {
          ...state.assets,
          [assetId]: {
            ...asset,
            width: Math.max(100, width), // Minimum width of 100px
            height: Math.max(80, height), // Minimum height of 80px
          },
        },
      };
    });
  },

  // Update asset properties
  updateAsset: (assetId: string, updates: Partial<Omit<Asset, 'id' | 'children' | 'parentId'>>) => {
    set((state) => {
      const asset = state.assets[assetId];
      if (!asset) return state;

      return {
        assets: {
          ...state.assets,
          [assetId]: {
            ...asset,
            ...updates,
          },
        },
      };
    });
  },

  // Delete an asset and all its descendants recursively
  deleteAsset: (assetId: string) => {
    set((state) => {
      const newAssets = { ...state.assets };
      const asset = newAssets[assetId];
      
      if (!asset) return state;

      // Recursive function to collect all descendant IDs
      const collectDescendants = (id: string): string[] => {
        const currentAsset = newAssets[id];
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
      if (asset.parentId && newAssets[asset.parentId]) {
        newAssets[asset.parentId] = {
          ...newAssets[asset.parentId],
          children: newAssets[asset.parentId].children.filter(id => !idsToDelete.includes(id)),
        };
      }

      // Delete all assets from registry
      idsToDelete.forEach(id => {
        delete newAssets[id];
      });

      // Clear active asset if it was deleted
      const newActiveId = state.currentActiveId && idsToDelete.includes(state.currentActiveId) 
        ? null 
        : state.currentActiveId;

      return { 
        assets: newAssets,
        currentActiveId: newActiveId,
      };
    });
  },

  // Set the active asset
  setActiveAsset: (assetId: string | null) => {
    set({ currentActiveId: assetId });
  },

  // Set the current viewport context
  setCurrentViewportId: (assetId: string | null) => {
    set({ currentViewportId: assetId });
  },

  // Get the active asset object
  getActiveAsset: () => {
    const state = get();
    return state.currentActiveId ? state.assets[state.currentActiveId] || null : null;
  },

  // Get all root-level assets (no parent)
  getRootAssets: () => {
    const state = get();
    return Object.values(state.assets).filter(asset => !asset.parentId);
  },

  // Get direct children of a specific asset
  getAssetChildren: (parentId: string) => {
    const state = get();
    const parent = state.assets[parentId];
    if (!parent) return [];
    
    return parent.children
      .map(childId => state.assets[childId])
      .filter(Boolean);
  },

  // Get entire tree starting from root or specific asset
  getAssetTree: (rootId?: string) => {
    const state = get();
    const result: Asset[] = [];
    
    const traverse = (assetId: string) => {
      const asset = state.assets[assetId];
      if (!asset) return;
      
      result.push(asset);
      asset.children.forEach(traverse);
    };

    if (rootId) {
      traverse(rootId);
    } else {
      // Start from all root assets
      state.getRootAssets().forEach(asset => traverse(asset.id));
    }
    
    return result;
  },

  // Custom Fields
  addCustomField: (assetId: string, field: Omit<CustomField, 'id'>) => {
    const newField: CustomField = {
      ...field,
      id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    
    set((state) => ({
      assets: {
        ...state.assets,
        [assetId]: {
          ...state.assets[assetId],
          customFields: [...(state.assets[assetId].customFields || []), newField],
          updatedAt: Date.now(),
        },
      },
    }));
  },

  updateCustomField: (assetId: string, fieldId: string, updates: Partial<CustomField>) => {
    set((state) => ({
      assets: {
        ...state.assets,
        [assetId]: {
          ...state.assets[assetId],
          customFields: (state.assets[assetId].customFields || []).map((field) =>
            field.id === fieldId ? { ...field, ...updates } : field
          ),
          updatedAt: Date.now(),
        },
      },
    }));
  },

  removeCustomField: (assetId: string, fieldId: string) => {
    set((state) => ({
      assets: {
        ...state.assets,
        [assetId]: {
          ...state.assets[assetId],
          customFields: (state.assets[assetId].customFields || []).filter((field) => field.id !== fieldId),
          customFieldValues: (state.assets[assetId].customFieldValues || []).filter((value) => value.fieldId !== fieldId),
          updatedAt: Date.now(),
        },
      },
    }));
  },

  updateCustomFieldValue: (assetId: string, fieldId: string, value: string) => {
    set((state) => {
      const asset = state.assets[assetId];
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
      
      return {
        assets: {
          ...state.assets,
          [assetId]: {
            ...asset,
            customFieldValues: newValues,
            updatedAt: Date.now(),
          },
        },
      };
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
    
    set((state) => ({
      globalCustomFields: [...state.globalCustomFields, newField],
    }));
  },

  updateGlobalCustomField: (fieldId: string, updates: Partial<GlobalCustomField>) => {
    set((state) => ({
      globalCustomFields: state.globalCustomFields.map((field) =>
        field.id === fieldId ? { ...field, ...updates, updatedAt: Date.now() } : field
      ),
    }));
  },

  removeGlobalCustomField: (fieldId: string) => {
    set((state) => {
      const newGlobalFields = state.globalCustomFields.filter((field) => field.id !== fieldId);
      const newAssets = { ...state.assets };
      
      // Remove this field from all assets
      Object.keys(newAssets).forEach((assetId) => {
        const asset = newAssets[assetId];
        newAssets[assetId] = {
          ...asset,
          customFields: (asset.customFields || []).filter((field) => field.id !== fieldId),
          customFieldValues: (asset.customFieldValues || []).filter((value) => value.fieldId !== fieldId),
          updatedAt: Date.now(),
        };
      });
      
      return {
        globalCustomFields: newGlobalFields,
        assets: newAssets,
      };
    });
  },

  applyGlobalFieldsToAsset: (assetId: string) => {
    const state = get();
    const asset = state.assets[assetId];
    if (!asset) return;
    
    const existingFieldIds = new Set((asset.customFields || []).map((field) => field.id));
    const newGlobalFields = state.globalCustomFields.filter(
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
    
    set((state) => ({
      assets: {
        ...state.assets,
        [assetId]: {
          ...asset,
          customFields: [...(asset.customFields || []), ...newCustomFields],
          updatedAt: Date.now(),
        },
      },
    }));
  },

  // Viewport Display Settings
  updateViewportDisplaySettings: (assetId: string, settings: Partial<ViewportDisplaySettings>) => {
    set((state) => ({
      assets: {
        ...state.assets,
        [assetId]: {
          ...state.assets[assetId],
          viewportDisplaySettings: {
            ...(state.assets[assetId].viewportDisplaySettings || { ...DEFAULT_VIEWPORT_DISPLAY_SETTINGS }),
            ...settings,
          },
          updatedAt: Date.now(),
        },
      },
    }));
  },

  // Viewport UI Settings
  setViewportOffset: (offset: { x: number; y: number }) => {
    set({ viewportOffset: offset });
  },
  setViewportScale: (scale: number) => {
    set({ viewportScale: scale });
  },

  // World-aware methods
  loadWorldData: (worldData) => {
    if (worldData) {
      set({
        assets: worldData.assets || {},
        currentActiveId: null,
        currentViewportId: null,
        globalCustomFields: worldData.globalCustomFields || [],
        viewportOffset: worldData.viewportOffset || { x: -45, y: -20 },
        viewportScale: worldData.viewportScale || 1,
      });
    }
  },

  getWorldData: () => {
    const state = get();
    return {
      assets: state.assets,
      globalCustomFields: state.globalCustomFields,
      viewportOffset: state.viewportOffset,
      viewportScale: state.viewportScale,
    };
  },

  clearWorldData: () => {
    set({
      assets: {},
      currentActiveId: null,
      currentViewportId: null,
      globalCustomFields: [],
      viewportOffset: { x: -45, y: -20 },
      viewportScale: 1,
    });
  },
})));

// Auto-save functionality: subscribe to store changes and save to book store
useAssetStore.subscribe(
  (state) => state,
  (state) => {
    const bookStore = useBookStore.getState();
    if (bookStore.currentBookId) {
      const worldData = {
        assets: state.assets,
        globalCustomFields: state.globalCustomFields,
        viewportOffset: state.viewportOffset,
        viewportScale: state.viewportScale,
      };
      bookStore.updateWorldData(bookStore.currentBookId, worldData);
    }
  },
  {
    equalityFn: (a, b) => {
      // Only trigger auto-save for relevant changes
      return (
        a.assets === b.assets &&
        a.globalCustomFields === b.globalCustomFields &&
        a.viewportOffset.x === b.viewportOffset.x &&
        a.viewportOffset.y === b.viewportOffset.y &&
        a.viewportScale === b.viewportScale
      );
    },
  }
);
