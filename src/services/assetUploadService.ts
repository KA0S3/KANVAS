import { supabase } from '@/lib/supabase';
import { useCloudStore } from '@/stores/cloudStore';
import { useAuthStore } from '@/stores/authStore';

export interface AssetVariant {
  id: string;
  type: 'thumbnail' | 'preview' | 'original';
  size: number;
  blob: Blob;
  mimeType: string;
}

export interface UploadRequest {
  assetId: string;
  variants: AssetVariant[];
  projectId: string;
}

export interface UploadUrlsResponse {
  uploadUrls: Array<{
    asset_id: string;
    signedUrl: string;
    path: string;
  }>;
}

export interface CloudAssetMetadata {
  id: string;
  project_id: string;
  user_id: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  cloud_path: string;
  variants: Array<{
    type: string;
    path: string;
    size: number;
  }>;
  created_at: string;
  updated_at: string;
}

class AssetUploadService {
  private static instance: AssetUploadService;

  static getInstance(): AssetUploadService {
    if (!AssetUploadService.instance) {
      AssetUploadService.instance = new AssetUploadService();
    }
    return AssetUploadService.instance;
  }

  /**
   * Check if upload is possible within quota
   */
  async canUpload(totalBytes: number): Promise<boolean> {
    const cloudStore = useCloudStore.getState();
    return cloudStore.canUpload(totalBytes);
  }

  /**
   * Generate variants for an asset (thumbnail, preview, original)
   */
  async generateVariants(file: File): Promise<AssetVariant[]> {
    const variants: AssetVariant[] = [];
    
    // Original variant
    variants.push({
      id: `${crypto.randomUUID()}-original`,
      type: 'original',
      size: file.size,
      blob: file,
      mimeType: file.type
    });

    // Generate thumbnail and preview for images
    if (file.type.startsWith('image/')) {
      try {
        // Thumbnail (max 200x200)
        const thumbnailBlob = await this.createImageVariant(file, 200, 200, 0.8);
        variants.push({
          id: `${crypto.randomUUID()}-thumbnail`,
          type: 'thumbnail',
          size: thumbnailBlob.size,
          blob: thumbnailBlob,
          mimeType: file.type
        });

        // Preview (max 800x800)
        const previewBlob = await this.createImageVariant(file, 800, 800, 0.9);
        variants.push({
          id: `${crypto.randomUUID()}-preview`,
          type: 'preview',
          size: previewBlob.size,
          blob: previewBlob,
          mimeType: file.type
        });
      } catch (error) {
        console.warn('Failed to generate image variants:', error);
        // Continue with just the original if variant generation fails
      }
    }

    return variants;
  }

  /**
   * Create resized image variant
   */
  private async createImageVariant(file: File, maxWidth: number, maxHeight: number, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        const aspectRatio = width / height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            width = maxWidth;
            height = width / aspectRatio;
          } else {
            height = maxHeight;
            width = height * aspectRatio;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and resize
        ctx?.drawImage(img, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create image blob'));
            }
          },
          file.type,
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Get signed URLs for upload
   */
  async getUploadUrls(assetId: string, variants: AssetVariant[], projectId: string): Promise<UploadUrlsResponse> {
    const authStore = useAuthStore.getState();
    if (!authStore.user || !authStore.isAuthenticated) {
      throw new Error('User not authenticated');
    }

    // Check quota before proceeding
    const totalBytes = variants.reduce((sum, variant) => sum + variant.size, 0);
    const canUpload = await this.canUpload(totalBytes);
    
    if (!canUpload) {
      throw new Error('Storage quota exceeded. Please upgrade your plan to continue uploading.');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const files = variants.map(variant => ({
      asset_id: `${assetId}-${variant.type}`,
      size_bytes: variant.size
    }));

    const { data, error } = await supabase.functions.invoke<UploadUrlsResponse>('getUploadUrls', {
      body: {
        project_id: projectId,
        files
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    if (error) {
      console.error('Failed to get upload URLs:', error);
      throw new Error(`Failed to get upload URLs: ${error.message}`);
    }

    return data;
  }

  /**
   * Upload blob to signed URL
   */
  async uploadBlob(signedUrl: string, blob: Blob): Promise<void> {
    const response = await fetch(signedUrl, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': blob.type,
        'Content-Length': blob.size.toString()
      }
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Register asset metadata in Supabase
   */
  async registerAsset(metadata: Omit<CloudAssetMetadata, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<CloudAssetMetadata> {
    const authStore = useAuthStore.getState();
    if (!authStore.user || !authStore.isAuthenticated) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('assets')
      .insert({
        ...metadata,
        user_id: authStore.user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to register asset:', error);
      throw new Error(`Failed to register asset: ${error.message}`);
    }

    return data;
  }

  /**
   * Complete upload flow
   */
  async uploadAsset(request: UploadRequest): Promise<{ success: boolean; cloudMetadata?: CloudAssetMetadata; error?: string }> {
    try {
      // 1. Check quota
      const totalBytes = request.variants.reduce((sum, variant) => sum + variant.size, 0);
      const canUpload = await this.canUpload(totalBytes);
      
      if (!canUpload) {
        return { 
          success: false, 
          error: 'Storage quota exceeded. Please upgrade your plan.' 
        };
      }

      // 2. Get upload URLs
      const uploadUrls = await this.getUploadUrls(request.assetId, request.variants, request.projectId);

      // 3. Upload all variants
      const uploadPromises = request.variants.map(async (variant) => {
        const uploadInfo = uploadUrls.uploadUrls.find(url => url.asset_id === `${request.assetId}-${variant.type}`);
        if (!uploadInfo) {
          throw new Error(`No upload URL found for variant: ${variant.type}`);
        }

        await this.uploadBlob(uploadInfo.signedUrl, variant.blob);
        return {
          type: variant.type,
          path: uploadInfo.path,
          size: variant.size
        };
      });

      const uploadedVariants = await Promise.all(uploadPromises);

      // 4. Register asset metadata
      const originalVariant = request.variants.find(v => v.type === 'original');
      if (!originalVariant) {
        throw new Error('Original variant not found');
      }

      const cloudMetadata = await this.registerAsset({
        project_id: request.projectId,
        original_filename: originalVariant.blob instanceof File ? originalVariant.blob.name : `asset-${request.assetId}`,
        file_size: originalVariant.size,
        mime_type: originalVariant.mimeType,
        cloud_path: uploadedVariants.find(v => v.type === 'original')?.path || '',
        variants: uploadedVariants
      });

      // 5. Update quota
      const cloudStore = useCloudStore.getState();
      cloudStore.setQuota(
        cloudStore.quota.used + totalBytes,
        cloudStore.quota.available
      );

      return { success: true, cloudMetadata };

    } catch (error) {
      console.error('Upload failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Upload failed' 
      };
    }
  }
}

export const assetUploadService = AssetUploadService.getInstance();
