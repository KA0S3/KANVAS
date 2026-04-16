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
   */
  async executeMigration(strategy: MigrationStrategy, userId: string): Promise<MigrationResult> {
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
          return await this.deleteOldAndMigrate(localData, userId);
        case 'delete-current':
          return await this.deleteCurrentAndMigrate(localData, userId);
        case 'merge-as-new':
          return await this.mergeAsNewProject(localData, userId);
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

      const assets = assetStore.assets;
      const books = bookStore.books;
      const backgrounds = backgroundStore.configs;
      const globalCustomFields = assetStore.globalCustomFields;

      if (Object.keys(assets).length === 0 && Object.keys(books).length === 0) {
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
  private async deleteOldAndMigrate(localData: LocalProjectData, userId: string): Promise<MigrationResult> {
    // Delete existing projects
    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    // Create new project with local data
    return await this.createProjectFromLocalData(localData, userId);
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
  private async mergeAsNewProject(localData: LocalProjectData, userId: string): Promise<MigrationResult> {
    return await this.createProjectFromLocalData(localData, userId, `Migrated Project ${new Date().toLocaleDateString()}`);
  }

  /**
   * Create project from local data
   */
  private async createProjectFromLocalData(
    localData: LocalProjectData, 
    userId: string, 
    projectName?: string
  ): Promise<MigrationResult> {
    try {
      const projectId = crypto.randomUUID();
      const name = projectName || `Imported Project ${new Date().toLocaleDateString()}`;

      // Create project with world data
      const worldData = {
        assets: localData.assets,
        globalCustomFields: localData.globalCustomFields,
      };

      const { error: projectError } = await supabase
        .from('projects')
        .insert({
          id: projectId,
          user_id: userId,
          name,
          description: JSON.stringify(worldData),
          updated_at: new Date().toISOString(),
        });

      if (projectError) throw projectError;

      // Create background configs
      if (Object.keys(localData.backgrounds).length > 0) {
        const { error: backgroundError } = await supabase
          .from('assets')
          .insert({
            id: `${projectId}-backgrounds`,
            user_id: userId,
            project_id: projectId,
            name: 'Background Configurations',
            file_path: `backgrounds/${projectId}.json`,
            file_type: 'application/json',
            file_size_bytes: JSON.stringify(localData.backgrounds).length,
            mime_type: 'application/json',
            metadata: { configs: localData.backgrounds, type: 'background_configurations' },
            updated_at: new Date().toISOString(),
          });

        if (backgroundError) throw backgroundError;
      }

      // Migrate books
      let migratedBooks = 0;
      for (const [bookId, bookData] of Object.entries(localData.books)) {
        const { error: bookError } = await supabase
          .from('projects')
          .insert({
            id: crypto.randomUUID(), // Generate new ID for book
            user_id: userId,
            name: (bookData as any).name || 'Untitled Book',
            description: JSON.stringify(bookData),
            updated_at: new Date().toISOString(),
          });

        if (!bookError) {
          migratedBooks++;
        }
      }

      // Update quota usage
      const dataSize = this.estimateDataSize(localData);
      useCloudStore.getState().updateQuotaUsage(dataSize);

      return {
        success: true,
        strategy: 'merge-as-new',
        message: `Successfully migrated project "${name}" to cloud.`,
        projectId,
        migratedAssets: Object.keys(localData.assets).length,
        migratedBooks
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
