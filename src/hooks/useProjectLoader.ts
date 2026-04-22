/**
 * Project Loader Hook - Phase 3/4 Integration
 * 
 * Integrates the asset load service with the asset store
 * Provides automatic project loading with change tracking
 */

import { useCallback } from 'react';
import { useAssetStore } from '@/stores/assetStore';
import { loadProject as loadProjectService, clearLoadedNodesCache } from '@/services/assetLoadService';
import { setCurrentProjectVersion, startAutoSave } from '@/services/changeTrackingService';
import type { DbProject } from '@/services/assetLoadService';

interface LoadProjectResult {
  project: DbProject;
  assets: any[];
}

/**
 * Hook to load a project with automatic change tracking setup
 */
export function useProjectLoader() {
  const { loadWorldData, clearWorldData } = useAssetStore();

  const loadProject = useCallback(async (projectId: string): Promise<LoadProjectResult> => {
    try {
      // Clear previous state
      clearWorldData();
      clearLoadedNodesCache();

      // Load project from service
      const { project, assets } = await loadProjectService(projectId);

      // Load assets into store
      loadWorldData(assets);

      // Version is already set by loadProjectService
      // Auto-save is already started by loadProjectService

      return { project, assets };
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    }
  }, [loadWorldData, clearWorldData]);

  const unloadProject = useCallback(() => {
    clearWorldData();
    clearLoadedNodesCache();
    // stopAutoSave is called by the change tracking hook
  }, [clearWorldData]);

  return {
    loadProject,
    unloadProject
  };
}
