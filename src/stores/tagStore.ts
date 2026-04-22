import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useBookStore } from './bookStoreSimple';
import { useAssetStore } from './assetStore';
import { documentMutationService } from '@/services/DocumentMutationService';

const TAG_STORAGE_KEY = 'kaos_tags';
const ASSET_TAGS_STORAGE_KEY = 'kaos_asset_tags';

export interface Tag {
  id: string;
  name: string;
  color: string; // CSS color class
}

interface TagStore {
  // State
  tags: Record<string, Tag>;
  assetTags: Record<string, string[]>; // assetId -> tagIds
  selectedTags: Set<string>;
  activeFilters: string[]; // For backward compatibility
  
  // World-aware actions
  loadWorldData: (worldData: any) => void;
  getWorldData: () => any;
  clearWorldData: () => void;
  
  // Actions
  createTag: (tagData: Omit<Tag, 'id'>) => string;
  deleteTag: (tagId: string) => void;
  updateTag: (tagId: string, updates: Partial<Tag>) => void;
  
  // Asset-Tag associations
  addTagToAsset: (assetId: string, tagId: string) => void;
  removeTagFromAsset: (assetId: string, tagId: string) => void;
  getAssetTags: (assetId: string) => Tag[];
  
  // Selection
  toggleTagSelection: (tagId: string) => void;
  clearTagSelection: () => void;
  setSelectedTags: (tagIds: string[]) => void;
  
  // Filtering
  getSelectedTags: () => Tag[];
  isAssetFiltered: (assetId: string) => boolean;
  getFilteredAssetIds: () => string[];
  
  // New filter methods for compatibility
  toggleFilter: (tagId: string) => void;
  clearFilters: () => void;
  setFilters: (tagIds: string[]) => void;
}

// Helper functions for localStorage persistence
const loadTagsFromStorage = (): Record<string, Tag> => {
  try {
    const stored = localStorage.getItem(TAG_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('[TagStore] Failed to load tags from localStorage:', error);
    return {};
  }
};

const loadAssetTagsFromStorage = (): Record<string, string[]> => {
  try {
    const stored = localStorage.getItem(ASSET_TAGS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('[TagStore] Failed to load asset tags from localStorage:', error);
    return {};
  }
};

const saveTagsToStorage = (tags: Record<string, Tag>) => {
  try {
    localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(tags));
  } catch (error) {
    console.error('[TagStore] Failed to save tags to localStorage:', error);
  }
};

const saveAssetTagsToStorage = (assetTags: Record<string, string[]>) => {
  try {
    localStorage.setItem(ASSET_TAGS_STORAGE_KEY, JSON.stringify(assetTags));
  } catch (error) {
    console.error('[TagStore] Failed to save asset tags to localStorage:', error);
  }
};

export const useTagStore = create<TagStore>()(
  subscribeWithSelector((set, get) => ({
  // Initial state - load from localStorage
  tags: loadTagsFromStorage(),
  assetTags: loadAssetTagsFromStorage(),
  selectedTags: new Set(),
  activeFilters: [],

  // Create a new tag
  createTag: (tagData: Omit<Tag, 'id'>) => {
    const id = crypto.randomUUID();
    const newTag: Tag = {
      ...tagData,
      id,
    };

    set((state) => {
      const updatedTags = {
        ...state.tags,
        [id]: newTag,
      };

      // Save to localStorage immediately
      saveTagsToStorage(updatedTags);

      // Sync tags using saveGlobalTags (MASTER_PLAN.md state-based tracking)
      if (documentMutationService.getCurrentProjectId()) {
        documentMutationService.saveGlobalTags(updatedTags);
      }

      return {
        tags: updatedTags,
      };
    });

    return id;
  },

  // Delete a tag
  deleteTag: (tagId: string) => {
    set((state) => {
      const newTags = { ...state.tags };
      const newAssetTags = { ...state.assetTags };
      const newSelectedTags = new Set(state.selectedTags);

      // Remove tag
      delete newTags[tagId];

      // Remove tag from all assets
      Object.keys(newAssetTags).forEach(assetId => {
        newAssetTags[assetId] = newAssetTags[assetId].filter(id => id !== tagId);
      });

      // Remove from selection
      newSelectedTags.delete(tagId);

      // Save to localStorage immediately
      saveTagsToStorage(newTags);
      saveAssetTagsToStorage(newAssetTags);

      // Sync tags using saveGlobalTags (MASTER_PLAN.md state-based tracking)
      if (documentMutationService.getCurrentProjectId()) {
        documentMutationService.saveGlobalTags(newTags);
      }

      return {
        tags: newTags,
        assetTags: newAssetTags,
        selectedTags: newSelectedTags,
      };
    });
  },

  // Update a tag
  updateTag: (tagId: string, updates: Partial<Tag>) => {
    set((state) => {
      const tag = state.tags[tagId];
      if (!tag) return state;

      const updatedTags = {
        ...state.tags,
        [tagId]: {
          ...tag,
          ...updates,
        },
      };

      // Save to localStorage immediately
      saveTagsToStorage(updatedTags);

      // Sync tags using saveGlobalTags (MASTER_PLAN.md state-based tracking)
      if (documentMutationService.getCurrentProjectId()) {
        documentMutationService.saveGlobalTags(updatedTags);
      }

      return {
        tags: updatedTags,
      };
    });
  },

  // Add tag to asset
  addTagToAsset: (assetId: string, tagId: string) => {
    set((state) => {
      const assetTags = state.assetTags[assetId] || [];
      
      // Don't add if already exists
      if (assetTags.includes(tagId)) return state;

      const updatedAssetTags = {
        ...state.assetTags,
        [assetId]: [...assetTags, tagId],
      };

      // Save to localStorage immediately
      saveAssetTagsToStorage(updatedAssetTags);

      // Sync asset tags using markAssetChanged (MASTER_PLAN.md state-based tracking)
      // Tags are stored in custom_fields, so we mark the asset as changed
      if (documentMutationService.getCurrentProjectId()) {
        const assetStore = useAssetStore.getState();
        const bookId = assetStore.getCurrentBookId();
        if (bookId) {
          const bookAssets = assetStore.bookAssets[bookId] || {};
          const asset = bookAssets[assetId];
          if (asset) {
            const updatedAsset = { ...asset, tags: updatedAssetTags[assetId] };
            documentMutationService.markAssetChanged(assetId, updatedAsset);
          }
        }
      }

      return {
        assetTags: updatedAssetTags,
      };
    });
  },

  // Remove tag from asset
  removeTagFromAsset: (assetId: string, tagId: string) => {
    set((state) => {
      const assetTags = state.assetTags[assetId] || [];
      
      const updatedAssetTags = {
        ...state.assetTags,
        [assetId]: assetTags.filter(id => id !== tagId),
      };

      // Save to localStorage immediately
      saveAssetTagsToStorage(updatedAssetTags);

      // Sync asset tags using markAssetChanged (MASTER_PLAN.md state-based tracking)
      // Tags are stored in custom_fields, so we mark the asset as changed
      if (documentMutationService.getCurrentProjectId()) {
        const assetStore = useAssetStore.getState();
        const bookId = assetStore.getCurrentBookId();
        if (bookId) {
          const bookAssets = assetStore.bookAssets[bookId] || {};
          const asset = bookAssets[assetId];
          if (asset) {
            const updatedAsset = { ...asset, tags: updatedAssetTags[assetId] };
            documentMutationService.markAssetChanged(assetId, updatedAsset);
          }
        }
      }

      return {
        assetTags: updatedAssetTags,
      };
    });
  },

  // Get tags for an asset
  getAssetTags: (assetId: string) => {
    const state = get();
    const tagIds = state.assetTags[assetId] || [];
    return tagIds.map(id => state.tags[id]).filter(Boolean);
  },

  // Toggle tag selection
  toggleTagSelection: (tagId: string) => {
    set((state) => {
      const newSelectedTags = new Set(state.selectedTags);
      
      if (newSelectedTags.has(tagId)) {
        newSelectedTags.delete(tagId);
      } else {
        newSelectedTags.add(tagId);
      }

      return { selectedTags: newSelectedTags };
    });
  },

  // Clear tag selection
  clearTagSelection: () => {
    set({ selectedTags: new Set() });
  },

  // Set selected tags
  setSelectedTags: (tagIds: string[]) => {
    set({ selectedTags: new Set(tagIds) });
  },

  // Get selected tags
  getSelectedTags: () => {
    const state = get();
    return Array.from(state.selectedTags)
      .map(id => state.tags[id])
      .filter(Boolean);
  },

  // Check if asset matches current filter
  isAssetFiltered: (assetId: string) => {
    const state = get();
    
    // If no tags selected, show all assets
    if (state.selectedTags.size === 0) return true;
    
    const assetTagIds = state.assetTags[assetId] || [];
    
    // Show asset if it has any selected tag
    return assetTagIds.some(tagId => state.selectedTags.has(tagId));
  },

  // Get all filtered asset IDs
  getFilteredAssetIds: () => {
    const state = get();
    const filteredIds: string[] = [];
    
    Object.keys(state.assetTags).forEach(assetId => {
      if (state.isAssetFiltered(assetId)) {
        filteredIds.push(assetId);
      }
    });
    
    return filteredIds;
  },

  // New filter methods for compatibility
  toggleFilter: (tagId: string) => {
    const state = get();
    const newActiveFilters = state.activeFilters.includes(tagId)
      ? state.activeFilters.filter(id => id !== tagId)
      : [...state.activeFilters, tagId];
    
    set({ activeFilters: newActiveFilters });
    
    // Also update selectedTags for backward compatibility
    const newSelectedTags = new Set(state.selectedTags);
    if (newSelectedTags.has(tagId)) {
      newSelectedTags.delete(tagId);
    } else {
      newSelectedTags.add(tagId);
    }
    set({ selectedTags: newSelectedTags });
  },

  clearFilters: () => {
    set({ 
      activeFilters: [],
      selectedTags: new Set()
    });
  },

  setFilters: (tagIds: string[]) => {
    set({ 
      activeFilters: tagIds,
      selectedTags: new Set(tagIds)
    });
  },

  // World-aware methods
  loadWorldData: (worldData) => {
    if (worldData) {
      const state = get();
      // Only load from world_document if it has data, otherwise preserve localStorage data
      const hasTagData = worldData.tags && Object.keys(worldData.tags).length > 0;
      const hasAssetTagData = worldData.assetTags && Object.keys(worldData.assetTags).length > 0;

      set({
        tags: hasTagData ? worldData.tags : state.tags,
        assetTags: hasAssetTagData ? worldData.assetTags : state.assetTags,
        selectedTags: new Set(),
        activeFilters: [],
      });

      // If we loaded from world_document, also save to localStorage for persistence
      if (hasTagData || hasAssetTagData) {
        saveTagsToStorage(hasTagData ? worldData.tags : state.tags);
        saveAssetTagsToStorage(hasAssetTagData ? worldData.assetTags : state.assetTags);
      }
    }
  },

  getWorldData: () => {
    const state = get();
    return {
      tags: state.tags,
      assetTags: state.assetTags,
    };
  },

  clearWorldData: () => {
    set({
      tags: {},
      assetTags: {},
      selectedTags: new Set(),
      activeFilters: [],
    });
  },
})));

// Note: Tags are now persisted to localStorage and synced via DocumentMutationService
// following the same pattern as backgrounds (Phase 12)

