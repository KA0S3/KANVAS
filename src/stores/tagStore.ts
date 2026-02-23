import { create } from 'zustand';

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

export const useTagStore = create<TagStore>((set, get) => ({
  // Initial state
  tags: {},
  assetTags: {},
  selectedTags: new Set(),
  activeFilters: [],

  // Create a new tag
  createTag: (tagData: Omit<Tag, 'id'>) => {
    const id = crypto.randomUUID();
    const newTag: Tag = {
      ...tagData,
      id,
    };

    set((state) => ({
      tags: {
        ...state.tags,
        [id]: newTag,
      },
    }));

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

      return {
        tags: {
          ...state.tags,
          [tagId]: {
            ...tag,
            ...updates,
          },
        },
      };
    });
  },

  // Add tag to asset
  addTagToAsset: (assetId: string, tagId: string) => {
    set((state) => {
      const assetTags = state.assetTags[assetId] || [];
      
      // Don't add if already exists
      if (assetTags.includes(tagId)) return state;

      return {
        assetTags: {
          ...state.assetTags,
          [assetId]: [...assetTags, tagId],
        },
      };
    });
  },

  // Remove tag from asset
  removeTagFromAsset: (assetId: string, tagId: string) => {
    set((state) => {
      const assetTags = state.assetTags[assetId] || [];
      
      return {
        assetTags: {
          ...state.assetTags,
          [assetId]: assetTags.filter(id => id !== tagId),
        },
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
}));
