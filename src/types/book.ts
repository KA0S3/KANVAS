export interface Book {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  color: string;
  gradient?: string;
  createdAt: number;
  updatedAt: number;
  worldData: WorldData;
  isDefault?: boolean;
}

export interface WorldData {
  assets: Record<string, any>;
  tags: Record<string, any>;
  globalCustomFields: any[];
  viewportOffset: { x: number; y: number };
  viewportScale: number;
}

export interface BookCoverPreset {
  id: string;
  name: string;
  color: string;
  gradient?: string;
  pattern?: string;
}

export type BookViewMode = 'carousel' | 'grid';

export interface BookLibrarySettings {
  defaultViewMode: BookViewMode;
  autoSave: boolean;
  showBookDescriptions: boolean;
}
