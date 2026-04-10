import { useAssetStore } from '@/stores/assetStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAuthStore } from '@/stores/authStore';
import { r2UploadService } from '@/services/R2UploadService';
import { UpgradePromptModal } from '@/components/UpgradePromptModal';
import type { Asset } from '@/components/AssetItem';
import { useState } from 'react';

interface UpgradeModalState {
  isOpen: boolean;
  currentUsage: number;
  quotaLimit: number;
  requiredBytes: number;
}

export function useAssetCreation() {
  const { createAsset, updateAsset } = useAssetStore();
  const { syncEnabled, quota } = useCloudStore();
  const { isAuthenticated, user, plan, effectiveLimits } = useAuthStore();
  const [upgradeModal, setUpgradeModal] = useState<UpgradeModalState>({
    isOpen: false,
    currentUsage: 0,
    quotaLimit: 0,
    requiredBytes: 0
  });

  const createNewAsset = async (
    assetData: Omit<Asset, 'id' | 'children'>, 
    parentId?: string, 
    options?: { 
      fromUserClick?: boolean;
      file?: File;
      projectId?: string;
      skipCloud?: boolean;
    }
  ): Promise<string> => {
    // SAFEGUARD: Only allow creation if explicitly triggered by user click
    if (!options?.fromUserClick) {
      throw new Error("Asset creation blocked: not triggered by user click");
    }
    
    console.log('Creating asset from modal');
    
    // Create local asset first (local-first principle)
    const assetId = createAsset(assetData, parentId);
    
    // If file is provided and cloud sync is enabled, attempt cloud upload
    if (options.file && syncEnabled && isAuthenticated && !options.skipCloud) {
      await uploadAssetToCloud(assetId, options.file, options.projectId);
    }
    
    return assetId;
  };

  const uploadAssetToCloud = async (assetId: string, file: File, projectId?: string): Promise<void> => {
    if (!syncEnabled || !isAuthenticated || !user) {
      console.log('Cloud sync disabled or user not authenticated, skipping upload');
      return;
    }

    if (!projectId) {
      console.warn('No project ID provided, skipping cloud upload');
      return;
    }

    try {
      // Update asset status to uploading
      updateAsset(assetId, { 
        cloudStatus: 'uploading',
        cloudError: undefined 
      });

      // Upload with variants using R2UploadService
      // Note: Quota check is handled by the getUploadUrls Edge Function
      const result = await r2UploadService.uploadWithVariants(
        file,
        assetId,
        projectId,
        {
          generateThumbnail: true,
          generatePreview: true
        },
        (stage, progress) => {
          console.log(`[useAssetCreation] Upload ${stage}: ${progress.percentage}%`);
        }
      );

      if (result.success) {
        // Update asset with cloud metadata
        updateAsset(assetId, {
          cloudStatus: 'synced',
          cloudPath: result.r2Key,
          cloudSize: file.size,
          cloudUpdatedAt: new Date().toISOString(),
          cloudError: undefined
        });
        
        console.log('Asset successfully uploaded to cloud:', result.r2Key);
      } else {
        // Check if it's a quota error
        if (result.error?.includes('quota') || result.error?.includes('Quota')) {
          const quotaLimit = effectiveLimits?.quotaBytes || quota.available;
          
          setUpgradeModal({
            isOpen: true,
            currentUsage: quota.used,
            quotaLimit,
            requiredBytes: file.size
          });
        }
        
        // Handle upload failure but keep local asset
        updateAsset(assetId, { 
          cloudStatus: 'failed',
          cloudError: result.error || 'Unknown upload error'
        });
        
        console.error('Cloud upload failed:', result.error);
      }
    } catch (error) {
      // Handle unexpected errors but preserve local asset
      updateAsset(assetId, { 
        cloudStatus: 'failed',
        cloudError: error instanceof Error ? error.message : 'Unexpected error'
      });
      
      console.error('Unexpected error during cloud upload:', error);
    }
  };

  const retryCloudUpload = async (assetId: string, file: File, projectId?: string): Promise<void> => {
    await uploadAssetToCloud(assetId, file, projectId);
  };

  const canUploadToCloud = async (file: File): Promise<boolean> => {
    if (!syncEnabled || !isAuthenticated) {
      return false;
    }

    // Quota check is now handled server-side by getUploadUrls Edge Function
    // We do a client-side estimate based on current quota
    const quotaLimit = effectiveLimits?.quotaBytes || quota.available;
    return (quota.used + file.size) <= quotaLimit;
  };

  const closeUpgradeModal = () => {
    setUpgradeModal(prev => ({ ...prev, isOpen: false }));
  };

  // Check if user is over quota to determine modal type
  const isOverQuota = effectiveLimits?.quotaBytes && quota.used >= effectiveLimits.quotaBytes;

  return { 
    createNewAsset,
    uploadAssetToCloud,
    retryCloudUpload,
    canUploadToCloud,
    upgradeModal,
    closeUpgradeModal,
    isOverQuota
  };
}
