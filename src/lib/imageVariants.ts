import imageCompression from 'browser-image-compression';

export type ImageVariant = {
  type: 'thumb' | 'medium' | 'original';
  blob: Blob;
  size: number;
};

export async function createImageVariants(file: File): Promise<ImageVariant[]> {
  const variants: ImageVariant[] = [];

  // Thumb variant (300px max width)
  const thumbOptions = {
    maxSizeMB: 0.1,
    maxWidthOrHeight: 300,
    useWebWorker: true,
    preserveExif: false,
  };
  
  const thumbBlob = await imageCompression(file, thumbOptions);
  variants.push({
    type: 'thumb',
    blob: thumbBlob,
    size: thumbBlob.size,
  });

  // Medium variant (1200px max width)
  const mediumOptions = {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
    preserveExif: false,
  };
  
  const mediumBlob = await imageCompression(file, mediumOptions);
  variants.push({
    type: 'medium',
    blob: mediumBlob,
    size: mediumBlob.size,
  });

  // Original optimized (no resize, compressed)
  const originalOptions = {
    maxSizeMB: 2,
    maxWidthOrHeight: undefined, // No resizing
    useWebWorker: true,
    preserveExif: false,
  };
  
  const originalBlob = await imageCompression(file, originalOptions);
  variants.push({
    type: 'original',
    blob: originalBlob,
    size: originalBlob.size,
  });

  return variants;
}
