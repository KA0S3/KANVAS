import { create } from 'zustand';
import type { Book } from '@/types/book';

interface TestBookStore {
  books: Record<string, Book>;
  currentBookId: string | null;
  getAllBooks: () => Book[];
}

export const useTestBookStore = create<TestBookStore>((set, get) => ({
  books: {},
  currentBookId: null,
  getAllBooks: () => {
    const state = get();
    return Object.values(state.books);
  },
}));
