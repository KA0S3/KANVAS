import { create } from 'zustand';
import type { Book, BookViewMode, BookLibrarySettings, BookCoverPreset, WorldData } from '@/types/book';

interface BookStore {
  // State
  books: Record<string, Book>;
  currentBookId: string | null;
  viewMode: BookViewMode;
  settings: BookLibrarySettings;
  
  // Cover presets
  coverPresets: BookCoverPreset[];
  
  // Actions
  createBook: (bookData: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateBook: (bookId: string, updates: Partial<Book>) => void;
  deleteBook: (bookId: string) => void;
  setCurrentBook: (bookId: string | null) => void;
  getCurrentBook: () => Book | null;
  
  // World data management
  updateWorldData: (bookId: string, worldData: Partial<WorldData>) => void;
  getWorldData: (bookId: string) => WorldData | null;
  
  // Settings
  setViewMode: (mode: BookViewMode) => void;
  updateSettings: (settings: Partial<BookLibrarySettings>) => void;
  
  // Utility
  getAllBooks: () => Book[];
  getBookCount: () => number;
  exportBooks: () => string;
  importBooks: (data: string) => boolean;
}

const defaultSettings: BookLibrarySettings = {
  defaultViewMode: 'carousel',
  autoSave: true,
  showBookDescriptions: true,
};

const defaultCoverPresets: BookCoverPreset[] = [
  { id: 'cosmic-blue', name: 'Cosmic Blue', color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' },
  { id: 'emerald-green', name: 'Emerald Green', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #06b6d4)' },
  { id: 'royal-purple', name: 'Royal Purple', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #ec4899)' },
  { id: 'sunset-orange', name: 'Sunset Orange', color: '#f97316', gradient: 'linear-gradient(135deg, #f97316, #ef4444)' },
  { id: 'midnight-dark', name: 'Midnight Dark', color: '#1f2937', gradient: 'linear-gradient(135deg, #1f2937, #374151)' },
  { id: 'rose-pink', name: 'Rose Pink', color: '#f43f5e', gradient: 'linear-gradient(135deg, #f43f5e, #ec4899)' },
];

const createDefaultWorldData = (): WorldData => ({
  assets: {},
  tags: {},
  globalCustomFields: [],
  viewportOffset: { x: -45, y: -20 },
  viewportScale: 1,
});

export const useBookStore = create<BookStore>((set, get) => ({
      // Initial state
      books: {},
      currentBookId: null,
      viewMode: 'carousel',
      settings: defaultSettings,
      coverPresets: defaultCoverPresets,

      // Create a new book
      createBook: (bookData) => {
        const id = crypto.randomUUID();
        const now = Date.now();
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
        }));

        return id;
      },

      // Update an existing book
      updateBook: (bookId, updates) => {
        set((state) => {
          const book = state.books[bookId];
          if (!book) return state;

          return {
            books: {
              ...state.books,
              [bookId]: {
                ...book,
                ...updates,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      // Delete a book
      deleteBook: (bookId) => {
        set((state) => {
          const newBooks = { ...state.books };
          delete newBooks[bookId];

          // Clear current book if it was deleted
          const newCurrentBookId = state.currentBookId === bookId ? null : state.currentBookId;

          return {
            books: newBooks,
            currentBookId: newCurrentBookId,
          };
        });
      },

      // Set current active book
      setCurrentBook: (bookId) => {
        set({ currentBookId: bookId });
      },

      // Get current active book
      getCurrentBook: () => {
        const state = get();
        return state.currentBookId ? state.books[state.currentBookId] || null : null;
      },

      // Update world data for a book
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

      // Get world data for a book
      getWorldData: (bookId) => {
        const state = get();
        const book = state.books[bookId];
        return book ? book.worldData : null;
      },

      // Set view mode
      setViewMode: (mode) => {
        set({ viewMode: mode });
      },

      // Update settings
      updateSettings: (settingsUpdates) => {
        set((state) => ({
          settings: {
            ...state.settings,
            ...settingsUpdates,
          },
        }));
      },

      // Get all books
      getAllBooks: () => {
        const state = get();
        return Object.values(state.books);
      },

      // Get book count
      getBookCount: () => {
        const state = get();
        return Object.keys(state.books).length;
      },

      // Export books data
      exportBooks: () => {
        const state = get();
        return JSON.stringify({
          books: state.books,
          settings: state.settings,
          exportedAt: new Date().toISOString(),
        }, null, 2);
      },

      // Import books data
      importBooks: (data) => {
        try {
          const parsed = JSON.parse(data);
          
          if (!parsed.books || typeof parsed.books !== 'object') {
            throw new Error('Invalid data format');
          }

          set((state) => ({
            books: parsed.books,
            settings: parsed.settings ? { ...state.settings, ...parsed.settings } : state.settings,
          }));

          return true;
        } catch (error) {
          console.error('Failed to import books:', error);
          return false;
        }
      },
    }),
}));
