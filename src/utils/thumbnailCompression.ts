/**
 * Utility functions for compressing thumbnails to meet database size constraints
 */

const MAX_THUMBNAIL_SIZE = 200; // Maximum width/height for thumbnails
const THUMBNAIL_QUALITY = 0.7; // Quality for JPEG compression
const MAX_BASE64_SIZE = 50000; // Maximum base64 string size (50KB)

/**
 * Compress an image file and return a base64 string that meets size constraints
 */
export async function compressImageToThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      try {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        const aspectRatio = width / height;

        if (width > MAX_THUMBNAIL_SIZE || height > MAX_THUMBNAIL_SIZE) {
          if (width > height) {
            width = MAX_THUMBNAIL_SIZE;
            height = width / aspectRatio;
          } else {
            height = MAX_THUMBNAIL_SIZE;
            width = height * aspectRatio;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and resize the image
        ctx?.drawImage(img, 0, 0, width, height);

        // Try different quality levels until we get under the size limit
        let quality = THUMBNAIL_QUALITY;
        let base64String = '';
        
        const tryCompression = (attemptQuality: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create image blob'));
                return;
              }

              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                
                // Check if the result is under the size limit
                if (result.length <= MAX_BASE64_SIZE || attemptQuality <= 0.1) {
                  resolve(result);
                } else {
                  // Try again with lower quality
                  tryCompression(Math.max(0.1, attemptQuality - 0.1));
                }
              };
              reader.onerror = () => reject(new Error('Failed to read blob'));
              reader.readAsDataURL(blob);
            },
            'image/jpeg',
            attemptQuality
          );
        };

        tryCompression(quality);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Compress an existing base64 image string
 */
export async function compressBase64Thumbnail(base64String: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      try {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        const aspectRatio = width / height;

        if (width > MAX_THUMBNAIL_SIZE || height > MAX_THUMBNAIL_SIZE) {
          if (width > height) {
            width = MAX_THUMBNAIL_SIZE;
            height = width / aspectRatio;
          } else {
            height = MAX_THUMBNAIL_SIZE;
            width = height * aspectRatio;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and resize the image
        ctx?.drawImage(img, 0, 0, width, height);

        // Try different quality levels until we get under the size limit
        let quality = THUMBNAIL_QUALITY;
        
        const tryCompression = (attemptQuality: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create image blob'));
                return;
              }

              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                
                // Check if the result is under the size limit
                if (result.length <= MAX_BASE64_SIZE || attemptQuality <= 0.1) {
                  resolve(result);
                } else {
                  // Try again with lower quality
                  tryCompression(Math.max(0.1, attemptQuality - 0.1));
                }
              };
              reader.onerror = () => reject(new Error('Failed to read blob'));
              reader.readAsDataURL(blob);
            },
            'image/jpeg',
            attemptQuality
          );
        };

        tryCompression(quality);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64String;
  });
}

/**
 * Check if a base64 string exceeds the size limit
 */
export function isThumbnailTooLarge(base64String: string): boolean {
  return base64String.length > MAX_BASE64_SIZE;
}

/**
 * Get the size of a base64 string in bytes
 */
export function getBase64Size(base64String: string): number {
  return base64String.length;
}
