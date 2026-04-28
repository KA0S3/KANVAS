import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book, BookViewMode, BookLibrarySettings, BookCoverPreset, LeatherColorPreset, WorldData } from '@/types/book';
import { performanceMonitor } from '@/utils/performanceMonitor';
import { hybridStorage } from '@/utils/compressedStorage';
import { deleteProject } from '@/services/ProjectService';
import { documentMutationService } from '@/services/DocumentMutationService';

const defaultCoverPresets: BookCoverPreset[] = [
  { id: 'cosmic-blue', name: 'Cosmic Blue', color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' },
  { id: 'emerald-green', name: 'Emerald Green', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #06b6d4)' },
  { id: 'royal-purple', name: 'Royal Purple', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #ec4899)' },
  { id: 'sunset-orange', name: 'Sunset Orange', color: '#f97316', gradient: 'linear-gradient(135deg, #f97316, #ef4444)' },
  { id: 'midnight-dark', name: 'Midnight Dark', color: '#1f2937', gradient: 'linear-gradient(135deg, #1f2937, #374151)' },
  { id: 'rose-pink', name: 'Rose Pink', color: '#f43f5e', gradient: 'linear-gradient(135deg, #f43f5e, #ec4899)' },
];

const defaultLeatherPresets: LeatherColorPreset[] = [
  { id: 'classic-brown', name: 'Classic Brown', color: '#8B4513', darkVariant: '#654321', lightVariant: '#A0522D' },
  { id: 'rich-black', name: 'Rich Black', color: '#1a1a1a', darkVariant: '#0d0d0d', lightVariant: '#2d2d2d' },
  { id: 'navy-blue', name: 'Navy Blue', color: '#1e3a8a', darkVariant: '#1e2f5a', lightVariant: '#2563eb' },
  { id: 'royal-purple', name: 'Royal Purple', color: '#6b46c1', darkVariant: '#553c9a', lightVariant: '#8b5cf6' },
  { id: 'forest-green', name: 'Forest Green', color: '#2d5016', darkVariant: '#1f3a0f', lightVariant: '#3a6b1e' },
  { id: 'arctic-white', name: 'Arctic White', color: '#f5f5f0', darkVariant: '#e8e8e0', lightVariant: '#fafaf5' },
];

interface BookStore {
  books: Record<string, Book>;
  currentBookId: string | null;
  viewMode: BookViewMode;
  settings: BookLibrarySettings;
  coverPresets: BookCoverPreset[];
  leatherPresets: LeatherColorPreset[];
  
  // Creation protection
  _isCreating: boolean;
  _lastCreationTime: number;
  _pendingCreationTitle?: string;
  
  createBook: (bookData: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateBook: (bookId: string, updates: Partial<Book>) => void;
  deleteBook: (bookId: string) => Promise<void>;
  reorderBooks: (fromIndex: number, toIndex: number) => void;
  setCurrentBook: (bookId: string | null) => void;
  getCurrentBook: () => Book | null;
  getAllBooks: () => Book[];
  updateWorldData: (bookId: string, worldData: Partial<WorldData>) => void;
  getWorldData: (bookId: string) => WorldData | null;
  setViewMode: (mode: BookViewMode) => void;
  updateSettings: (settings: Partial<BookLibrarySettings>) => void;
  exportBooks: () => string;
  exportSingleBook: (bookId: string) => string;
  importBooks: (data: string, mode?: 'replace' | 'new') => boolean;
}

const defaultSettings: BookLibrarySettings = {
  defaultViewMode: 'single',
  autoSave: true,
  showBookDescriptions: true,
};

export const createDefaultWorldData = (): WorldData => ({
  assets: {},
  tags: {},
  globalCustomFields: [],
  viewportOffset: { x: -45, y: -20 },
  viewportScale: 1,
});

export const useBookStore = create<BookStore>()(
  persist(
    (set, get) => {
      return {
        books: {},
        currentBookId: null,
        viewMode: 'single' as BookViewMode,
        settings: defaultSettings,
        coverPresets: defaultCoverPresets,
        leatherPresets: defaultLeatherPresets,
        
        // Creation protection defaults
        _isCreating: false,
        _lastCreationTime: 0,
        _pendingCreationTitle: undefined,

        createBook: (bookData) => {
          const state = get();
          const now = Date.now();
          
          // Track book creation attempts
          performanceMonitor.incrementBookCreations();
          
          // Debounce check - prevent rapid successive creations
          if (state._isCreating) {
            console.warn('[BookStore] Book creation already in progress, ignoring duplicate request');
            return '';
          }
          
          // Check for recent creation of same title (prevent duplicates)
          const timeSinceLastCreation = now - state._lastCreationTime;
          const debounceTime = 1000; // 1 second debounce
          
          if (timeSinceLastCreation < debounceTime && state._pendingCreationTitle === bookData.title) {
            console.warn('[BookStore] Duplicate book creation detected, ignoring request');
            return '';
          }
          
          // Allow multiple books with same title - user wants this flexibility
          // No longer checking for duplicate titles
          
          // Set creation protection
          set({ 
            _isCreating: true, 
            _lastCreationTime: now,
            _pendingCreationTitle: bookData.title
          });
          
          const id = crypto.randomUUID();
          const newBook: Book = {
            ...bookData,
            id,
            createdAt: now,
            updatedAt: now,
            worldData: bookData.worldData || createDefaultWorldData(),
          };

          set((state) => ({
            books: {
              ...state.books,
              [id]: newBook,
            },
            _isCreating: false, // Reset creation flag
          }));

          console.log('[BookStore] Created new book:', newBook.title);
          return id;
        },

        updateBook: (bookId, updates) => {
          const state = get();
          const book = state.books[bookId];
          if (!book) return;

          // Update local state immediately (local-first philosophy)
          set((state) => ({
            books: {
              ...state.books,
              [bookId]: {
                ...book,
                ...updates,
                updatedAt: Date.now(),
              },
            },
          }));

          // NOTE: Per MASTER_PLAN.md low IO philosophy:
          // - NO immediate Supabase saves (violates "NO per-action writes")
          // - Metadata changes are batched by DocumentMutationService
          // - Saves happen on 40-second timer OR manual save only
          // - Project metadata (viewport, backgrounds, tags) syncs via DocumentMutationService.saveGlobalBackgrounds/saveViewport/saveGlobalTags
          
          // If this is the current book, trigger DocumentMutationService batching for metadata
          const currentBookId = get().currentBookId;
          if (bookId === currentBookId && documentMutationService.getCurrentProjectId() === bookId) {
            // Sync cover page settings via global backgrounds
            if (updates.coverPageSettings) {
              documentMutationService.saveGlobalBackgrounds(updates.coverPageSettings);
            }
            
            // Sync viewport settings
            if (updates.worldData?.viewportOffset || updates.worldData?.viewportScale) {
              documentMutationService.saveViewport(
                updates.worldData.viewportOffset?.x || book.worldData?.viewportOffset?.x || 0,
                updates.worldData.viewportOffset?.y || book.worldData?.viewportOffset?.y || 0,
                updates.worldData.viewportScale || book.worldData?.viewportScale || 1
              );
            }
            
            // Sync tags config
            if (updates.worldData?.tags) {
              documentMutationService.saveGlobalTags(updates.worldData.tags);
            }
          }
        },

        deleteBook: async (bookId) => {
          const state = get();
          const book = state.books[bookId];
          
          // Delete from Supabase if this is a synced project (has valid UUID format)
          if (book && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookId)) {
            try {
              console.log('[BookStore] Deleting project from Supabase:', bookId);
              await deleteProject(bookId);
              console.log('[BookStore] Successfully deleted project from Supabase');
            } catch (error: any) {
              // If project doesn't exist in Supabase, that's okay - it might be local-only
              if (error.message && error.message.includes('not found or unauthorized')) {
                console.log('[BookStore] Project not found in Supabase (local-only), skipping remote deletion');
              } else {
                console.error('[BookStore] Failed to delete project from Supabase:', error);
              }
              // Continue with local deletion even if remote fails
            }
          }
          
          // Always delete from local storage
          set((state) => {
            const newBooks = { ...state.books };
            delete newBooks[bookId];

            const newCurrentBookId = state.currentBookId === bookId ? null : state.currentBookId;

            return {
              books: newBooks,
              currentBookId: newCurrentBookId,
            };
          });
          
          console.log('[BookStore] Deleted book locally:', book?.title || bookId);
        },

        reorderBooks: (fromIndex, toIndex) => {
          set((state) => {
            const currentBooks = Object.values(state.books);
            const reorderedBooks = [...currentBooks];
            const [movedBook] = reorderedBooks.splice(fromIndex, 1);
            reorderedBooks.splice(toIndex, 0, movedBook);

            // Reconstruct the books object with new order
            const newBooks: Record<string, Book> = {};
            reorderedBooks.forEach((book, index) => {
              newBooks[book.id] = { ...book, order: index };
            });

            return {
              books: newBooks,
            };
          });
        },

        setCurrentBook: (bookId) => {
          set({ currentBookId: bookId });
        },

        getCurrentBook: () => {
          const state = get();
          return state.currentBookId ? state.books[state.currentBookId] || null : null;
        },

        getAllBooks: () => {
          const state = get();
          return Object.values(state.books).sort((a, b) => (a.order || 0) - (b.order || 0));
        },

        updateWorldData: (bookId, worldDataUpdates) => {
          set((state) => {
            const book = state.books[bookId];
            if (!book) return state;

            return {
              books: {
                ...state.books,
                [bookId]: {
                  ...book,
                  worldData: {
                    ...book.worldData,
                    ...worldDataUpdates,
                  },
                  updatedAt: Date.now(),
                },
              },
            };
          });
        },

        getWorldData: (bookId) => {
          const state = get();
          const book = state.books[bookId];
          return book ? book.worldData : null;
        },

        setViewMode: (mode) => {
          set({ viewMode: mode });
        },

        updateSettings: (settingsUpdates) => {
          set((state) => ({
            settings: {
              ...state.settings,
              ...settingsUpdates,
            },
          }));
        },

        exportBooks: () => {
          const state = get();
          return JSON.stringify({
            books: state.books,
            settings: state.settings,
            exportedAt: new Date().toISOString(),
          }, null, 2);
        },

        exportSingleBook: (bookId) => {
          const state = get();
          const book = state.books[bookId];
          if (!book) {
            throw new Error(`Book with ID ${bookId} not found`);
          }
          return JSON.stringify({
            books: { [bookId]: book },
            settings: state.settings,
            exportedAt: new Date().toISOString(),
          }, null, 2);
        },

        importBooks: (data, mode = 'replace') => {
          try {
            const parsed = JSON.parse(data);
            
            if (!parsed.books || typeof parsed.books !== 'object') {
              throw new Error('Invalid data format');
            }

            if (mode === 'new') {
              // Import as new - add to existing books
              set((state) => {
                const newBooks = { ...state.books };
                Object.entries(parsed.books).forEach(([id, book]) => {
                  // Generate new ID for imported book to avoid conflicts
                  const newId = `imported_${Date.now()}_${id}`;
                  newBooks[newId] = {
                    ...book as Book,
                    id: newId,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    order: Object.keys(state.books).length, // Add to end
                  };
                });
                return {
                  books: newBooks,
                  settings: parsed.settings ? { ...state.settings, ...parsed.settings } : state.settings,
                };
              });
            } else {
              // Replace mode - replace all existing books
              set((state) => ({
                books: parsed.books,
                settings: parsed.settings ? { ...state.settings, ...parsed.settings } : state.settings,
              }));
            }

            return true;
          } catch (error) {
            console.error('Failed to import books:', error);
            return false;
          }
        },
      };
    },
    {
      name: 'kanvas-world-storage',
      storage: hybridStorage,
      partialize: (state) => ({
        books: state.books,
        currentBookId: state.currentBookId,
        settings: state.settings,
      }),
    }
  )
);
