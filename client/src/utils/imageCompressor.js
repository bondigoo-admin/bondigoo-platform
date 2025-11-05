import imageCompression from 'browser-image-compression';
import { toast } from 'react-hot-toast';
import { logger } from './logger';

/**
 * Reads an image file to get its dimensions.
 * @param {File} file The image file.
 * @returns {Promise<{width: number, height: number}>} A promise that resolves with the image's dimensions.
 */
const getImageDimensions = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * A robust, reusable client-side image compression and validation utility.
 * It validates dimensions, checks size, compresses if necessary, and provides clear user feedback.
 *
 * @param {File} file The original image File object.
 * @param {object} [options={}] Configuration options for validation and compression.
 * @param {number} [options.maxSizeMB=5] The absolute maximum file size in megabytes after compression.
 * @param {number} [options.minWidth=0] The required minimum width of the image.
 * @param {number} [options.minHeight=0] The required minimum height of the image.
 * @param {number} [options.maxWidthOrHeight=1920] The maximum width or height of the output image.
 * @returns {Promise<File|null>} A promise that resolves to the processed File object, or null if the file fails validation.
 */
export const processImageForUpload = async (file, options = {}) => {
  const defaultOptions = {
    maxSizeMB: 5,
    minWidth: 0,
    minHeight: 0,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
  };
  const finalOptions = { ...defaultOptions, ...options };

  if (!file.type.startsWith('image/')) {
    logger.info('[ImageProcessor] Bypassing non-image file:', { name: file.name, type: file.type });
    return file;
  }
  const typesToBypass = ['image/gif', 'image/svg+xml'];
  if (typesToBypass.includes(file.type)) {
    logger.info('[ImageProcessor] Bypassing special image type:', { name: file.name, type: file.type });
    return file;
  }

  if (finalOptions.minWidth > 0 || finalOptions.minHeight > 0) {
    try {
      const { width, height } = await getImageDimensions(file);
      if (width < finalOptions.minWidth || height < finalOptions.minHeight) {
        logger.warn('[ImageProcessor] Image rejected: too small.', {
          fileName: file.name,
          dimensions: `${width}x${height}`,
          required: `${finalOptions.minWidth}x${finalOptions.minHeight}`,
        });
        toast.error(`Image is too small. It must be at least ${finalOptions.minWidth}x${finalOptions.minHeight} pixels.`);
        return null;
      }
    } catch (error) {
      logger.error('[ImageProcessor] Could not read image dimensions.', { error });
      toast.error('Could not verify image dimensions. Please try a different image.');
      return null;
    }
  }

  const originalSizeMB = file.size / 1024 / 1024;

  if (originalSizeMB <= finalOptions.maxSizeMB) {
    logger.info('[ImageProcessor] Image is already within size limits. No compression needed.', { name: file.name });
    return file;
  }

  logger.info(`[ImageProcessor] Compressing image: ${file.name}. Original size: ${originalSizeMB.toFixed(2)}MB.`);

  const compressionOptions = {
    maxSizeMB: finalOptions.maxSizeMB,
    maxWidthOrHeight: finalOptions.maxWidthOrHeight,
    useWebWorker: finalOptions.useWebWorker,
    fileType: file.type,
  };

  try {
    const compressedFile = await imageCompression(file, compressionOptions);
    const newSizeMB = compressedFile.size / 1024 / 1024;

    if (newSizeMB > finalOptions.maxSizeMB) {
       logger.error('[ImageProcessor] Compression failed to meet size target.', {
         originalSize: `${originalSizeMB.toFixed(2)}MB`,
         finalSize: `${newSizeMB.toFixed(2)}MB`,
         target: `${finalOptions.maxSizeMB}MB`,
       });
       toast.error(`Could not compress "${file.name}" enough. Please use a smaller file.`);
       return null;
    }

    logger.info(`[ImageProcessor] Compression successful. New size: ${newSizeMB.toFixed(2)}MB`);
    return new File([compressedFile], file.name, { type: compressedFile.type, lastModified: Date.now() });

  } catch (error) {
    logger.error('[ImageProcessor] Compression failed. Fallback to original.', { error });
    return file; // Return original as a fallback
  }
};