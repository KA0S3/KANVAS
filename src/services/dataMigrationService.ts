import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useCloudStore } from '@/stores/cloudStore';

export type MigrationStrategy = 'delete-old' | 'delete-current' | 'merge-as-new' | 'cancel';

export interface LocalProjectData {
  assets: Record<string, any>;
  backgrounds: any;
  books: Record<string, any>;
  globalCustomFields: any[];
  timestamp: number;
}

export interface CloudProjectData {
  id: string;
  name: string;
  description?: string;
  assets: Record<string, any>;
  backgrounds: any;
  books: Record<string, any>;
  globalCustomFields: any[];
  createdAt: string;
  updatedAt: string;
}

export interface MigrationConflict {
  type: 'free-plan-conflict' | 'data-exists' | 'quota-exceeded';
  localData: LocalProjectData;
  cloudData?: CloudProjectData[];
  recommendedStrategy: MigrationStrategy[];
  message: string;
}

export interface MigrationResult {
  success: boolean;
  strategy: MigrationStrategy;
  message: string;
  projectId?: string;
  migratedAssets?: number;
  migratedBooks?: number;
  progress?: number; // 0-100 for progress tracking
}

class DataMigrationService {
  private static instance: DataMigrationService;

  static getInstance(): DataMigrationService {
    if (!DataMigrationService.instance) {
      DataMigrationService.instance = new DataMigrationService();
    }
    return DataMigrationService.instance;
  }

  /**
   * Check for migration conflicts when user signs in
   */
  async checkMigrationConflicts(userId: string): Promise<MigrationConflict | null> {
    const { plan } = useAuthStore.getState();
    
    // Get local data
    const localData = this.getLocalData();
    if (!localData || Object.keys(localData.assets).length === 0) {
      return null; // No local data to migrate
    }

    // Get cloud data
    const cloudData = await this.getCloudData(userId);
    
    // Check for free plan conflicts
    if (plan === 'free' && cloudData.length > 0) {
      return {
        type: 'free-plan-conflict',
        localData,
        cloudData,
        recommendedStrategy: ['delete-old', 'delete-current', 'cancel'],
        message: 'Free account detected with existing cloud data. Choose how to handle local data.'
      };
    }

    // Check for quota exceeded
    const { quota } = useCloudStore.getState();
    const estimatedSize = this.estimateDataSize(localData);
    if (estimatedSize > quota.available) {
      return {
        type: 'quota-exceeded',
        localData,
        cloudData,
        recommendedStrategy: ['delete-current', 'cancel'],
        message: 'Local data exceeds available storage quota.'
      };
    }

    // General data exists conflict
    if (cloudData.length > 0) {
      return {
        type: 'data-exists',
        localData,
        cloudData,
        recommendedStrategy: ['merge-as-new'],
        message: 'Existing cloud data found. Local data will be merged as new project.'
      };
    }

    return null;
  }

  /**
   * Execute migration strategy
   * Phase 3 Fix: Add progress tracking callback
   */
  async executeMigration(strategy: MigrationStrategy, userId: string, onProgress?: (progress: number) => void): Promise<MigrationResult> {
    const localData = this.getLocalData();
    if (!localData) {
      return {
        success: false,
        strategy,
        message: 'No local data found to migrate.'
      };
    }

    try {
      switch (strategy) {
        case 'delete-old':
          return await this.deleteOldAndMigrate(localData, userId, onProgress);
        case 'delete-current':
          return await this.deleteCurrentAndMigrate(localData, userId);
        case 'merge-as-new':
          return await this.mergeAsNewProject(localData, userId, onProgress);
        case 'cancel':
          return {
            success: true,
            strategy,
            message: 'Migration cancelled by user.'
          };
        default:
          throw new Error(`Unknown migration strategy: ${strategy}`);
      }
    } catch (error) {
      console.error('[DataMigration] Migration failed:', error);
      return {
        success: false,
        strategy,
        message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get local data from stores
   */
  private getLocalData(): LocalProjectData | null {
    try {
      const assetStore = useAssetStore.getState();
      const bookStore = useBookStore.getState();
      const backgroundStore = useBackgroundStore.getState();

      // Fix: Use bookAssets instead of assets (AssetStore uses bookAssets)
      const currentBookId = bookStore.currentBookId;
      const assets = currentBookId ? assetStore.bookAssets[currentBookId] : {};
      const books = bookStore.books;
      const backgrounds = backgroundStore.configs;
      const globalCustomFields = currentBookId ? assetStore.bookGlobalCustomFields[currentBookId] : [];

      if (!assets || !books || (Object.keys(assets).length === 0 && Object.keys(books).length === 0)) {
        return null;
      }

      return {
        assets,
        backgrounds,
        books,
        globalCustomFields,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[DataMigration] Failed to get local data:', error);
      return null;
    }
  }

  /**
   * Get cloud data for user
   */
  private async getCloudData(userId: string): Promise<CloudProjectData[]> {
    try {
      // Get projects
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id, name, description, created_at, updated_at')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (projectsError) throw projectsError;

      const cloudData: CloudProjectData[] = [];

      for (const project of projects || []) {
        // Get project structure data
        const { data: structure } = await supabase
          .from('projects')
          .select('description')
          .eq('id', project.id)
          .single();

        // Get background configs
        const { data: backgroundData } = await supabase
          .from('assets')
          .select('metadata')
          .eq('id', `${project.id}-backgrounds`)
          .eq('user_id', userId)
          .single();

        let worldData: any = {};
        let backgrounds: any = {};

        try {
          worldData = structure?.description ? JSON.parse(structure.description) : {};
        } catch (e) {
          console.warn('[DataMigration] Failed to parse world data for project:', project.id);
        }

        if (backgroundData?.metadata?.configs) {
          backgrounds = backgroundData.metadata.configs;
        }

        cloudData.push({
          id: project.id,
          name: project.name,
          description: project.description,
          assets: (worldData as any).assets || {},
          backgrounds,
          books: {}, // Books are stored separately
          globalCustomFields: (worldData as any).globalCustomFields || [],
          createdAt: project.created_at,
          updatedAt: project.updated_at
        });
      }

      return cloudData;
    } catch (error) {
      console.error('[DataMigration] Failed to get cloud data:', error);
      return [];
    }
  }

  /**
   * Estimate data size for quota checking
   */
  private estimateDataSize(data: LocalProjectData): number {
    try {
      const jsonString = JSON.stringify(data);
      return new Blob([jsonString]).size;
    } catch (error) {
      console.error('[DataMigration] Failed to estimate data size:', error);
      return 0;
    }
  }

  /**
   * Delete old cloud data and migrate local data
   */
  private async deleteOldAndMigrate(localData: LocalProjectData, userId: string, onProgress?: (progress: number) => void): Promise<MigrationResult> {
    // Progress: 5% - Deleting old data
    onProgress?.(5);

    // Delete existing projects
    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    // Create new project with local data
    return await this.createProjectFromLocalData(localData, userId, undefined, onProgress);
  }

  /**
   * Delete current local data and keep cloud data
   */
  private async deleteCurrentAndMigrate(localData: LocalProjectData, userId: string): Promise<MigrationResult> {
    // Clear local stores
    const assetStore = useAssetStore.getState();
    const bookStore = useBookStore.getState();
    const backgroundStore = useBackgroundStore.getState();

    assetStore.clearWorldData();
    
    // Clear books by deleting each book individually
    const allBooks = bookStore.getAllBooks();
    allBooks.forEach(book => {
      bookStore.deleteBook(book.id);
    });
    
    // Clear current book
    bookStore.setCurrentBook(null);
    
    // Note: Background configs will be cleared when new data is loaded

    return {
      success: true,
      strategy: 'delete-current',
      message: 'Local data cleared. Cloud data preserved.',
      migratedAssets: 0,
      migratedBooks: 0
    };
  }

  /**
   * Merge local data as new project
   */
  private async mergeAsNewProject(localData: LocalProjectData, userId: string, onProgress?: (progress: number) => void): Promise<MigrationResult> {
    return await this.createProjectFromLocalData(localData, userId, `Migrated Project ${new Date().toLocaleDateString()}`, onProgress);
  }

  /**
   * Create project from local data
   * Phase 3 Fix: Use batched RPC calls instead of individual inserts (low-I/O compliant)
   * Phase 3 Fix: Add progress tracking for large migrations
   */
  private async createProjectFromLocalData(
    localData: LocalProjectData,
    userId: string,
    projectName?: string,
    onProgress?: (progress: number) => void
  ): Promise<MigrationResult> {
    try {
      const projectId = crypto.randomUUID();
      const name = projectName || `Imported Project ${new Date().toLocaleDateString()}`;

      // Progress: 10% - Creating project
      onProgress?.(10);

      // Phase 3 Fix: Use create_project RPC instead of direct table insert
      const { error: projectError } = await supabase.rpc('create_project', {
        p_project_id: projectId,
        p_name: name,
        p_description: null,
        p_cover_config: {}
      });

      if (projectError) throw projectError;

      // Progress: 30% - Preparing assets
      onProgress?.(30);

      // Phase 3 Fix: Batch save all assets using save_assets RPC (single call)
      const assetInputs = Object.entries(localData.assets).map(([assetId, assetData]) => {
        const asset = assetData as any;
        return {
          asset_id: assetId,
          parent_id: asset.parentId || null,
          name: asset.name || 'Untitled',
          type: asset.type || 'card',
          x: Math.round(asset.x || 0),
          y: Math.round(asset.y || 0),
          width: Math.round(asset.width || 200),
          height: Math.round(asset.height || 150),
          z_index: asset.zIndex || 0,
          is_expanded: asset.isExpanded || false,
          content: asset.content || null,
          background_config: asset.backgroundConfig || {},
          viewport_config: asset.viewportConfig || {},
          custom_fields: {
            customFields: asset.customFields || [],
            customFieldValues: asset.customFieldValues || [],
            tags: asset.tags || [],
            thumbnail: asset.cloudPath || null,
            background: asset.background || null,
            description: asset.description || null,
            viewportDisplaySettings: asset.viewportDisplaySettings || {}
          }
        };
      });

      // Progress: 50% - Saving assets
      onProgress?.(50);

      if (assetInputs.length > 0) {
        const { error: assetsError } = await supabase.rpc('save_assets', {
          p_project_id: projectId,
          p_assets: assetInputs
        });

        if (assetsError) {
          console.error('[DataMigration] Failed to batch save assets:', assetsError);
          throw assetsError;
        }
      }

      // Progress: 70% - Saving backgrounds
      onProgress?.(70);

      // Phase 3 Fix: Save backgrounds using save_project RPC (single call)
      if (Object.keys(localData.backgrounds).length > 0) {
        const { error: backgroundsError } = await supabase.rpc('save_project', {
          p_project_id: projectId,
          p_backgrounds: localData.backgrounds
        });

        if (backgroundsError) {
          console.error('[DataMigration] Failed to save backgrounds:', backgroundsError);
          throw backgroundsError;
        }
      }

      // Progress: 80% - Migrating books
      onProgress?.(80);

      // Phase 3 Fix: Batch save books using create_project RPC (multiple calls but necessary for separate projects)
      let migratedBooks = 0;
      const totalBooks = Object.keys(localData.books).length;
      let bookIndex = 0;

      for (const [bookId, bookData] of Object.entries(localData.books)) {
        const book = bookData as any;
        const newBookId = crypto.randomUUID();

        const { error: bookError } = await supabase.rpc('create_project', {
          p_project_id: newBookId,
          p_name: book.name || 'Untitled Book',
          p_description: book.description || null,
          p_cover_config: {
            color: book.color,
            gradient: book.gradient,
            leatherColor: book.leatherColor,
            isLeatherMode: book.isLeatherMode,
            coverPageSettings: book.coverPageSettings
          }
        });

        if (!bookError) {
          migratedBooks++;
        } else {
          console.error('[DataMigration] Failed to migrate book:', bookId, bookError);
        }

        // Update progress during book migration
        bookIndex++;
        if (totalBooks > 0) {
          const bookProgress = 80 + (bookIndex / totalBooks) * 15; // 80-95% for books
          onProgress?.(bookProgress);
        }
      }

      // Progress: 95% - Updating quota
      onProgress?.(95);

      // Update quota usage
      const dataSize = this.estimateDataSize(localData);
      useCloudStore.getState().updateQuotaUsage(dataSize);

      // Progress: 100% - Complete
      onProgress?.(100);

      return {
        success: true,
        strategy: 'merge-as-new',
        message: `Successfully migrated project "${name}" to cloud.`,
        projectId,
        migratedAssets: Object.keys(localData.assets).length,
        migratedBooks,
        progress: 100
      };
    } catch (error) {
      throw new Error(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Ask user if they want to migrate local data (for new sign-ups)
   */
  async shouldMigrateLocalData(): Promise<boolean> {
    const localData = this.getLocalData();
    return localData !== null && localData.assets !== null && Object.keys(localData.assets).length > 0;
  }

  /**
   * Migrate local data for new authenticated users
   */
  async migrateForNewUser(userId: string): Promise<MigrationResult> {
    const localData = this.getLocalData();
    if (!localData) {
      return {
        success: true,
        strategy: 'merge-as-new',
        message: 'No local data to migrate.'
      };
    }

    return await this.mergeAsNewProject(localData, userId);
  }
}

export const dataMigrationService = DataMigrationService.getInstance();
