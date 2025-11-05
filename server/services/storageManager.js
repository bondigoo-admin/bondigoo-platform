// server/services/storageManager.js
const cloudinary = require('cloudinary').v2;
const { logger } = require('../utils/logger');

class StorageManager {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  // Upload video with signed URL
  async uploadVideo(filePath, publicId, options = {}) {
    try {
      const uploadResult = await cloudinary.uploader.upload(filePath, {
        resource_type: 'video',
        public_id: publicId,
        overwrite: true,
        eager: [{ width: 1280, crop: 'scale' }],
        ...options,
      });

      // Generate signed URL with 30-day expiration
      const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days
      const signedUrl = cloudinary.url(uploadResult.public_id, {
        resource_type: 'video',
        secure: true,
        sign_url: true,
        expires_at: expiresAt,
      });

      logger.info('[storageManager.uploadVideo] Video uploaded:', {
        publicId: uploadResult.public_id,
        url: signedUrl,
      });

      return {
        url: signedUrl,
        publicId: uploadResult.public_id,
        duration: uploadResult.duration,
        size: uploadResult.bytes,
      };
    } catch (error) {
      logger.error('[storageManager.uploadVideo] Error:', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  // Future methods (e.g., for images, deletion)
  async uploadImage(filePath, publicId, options = {}) {
    // Implement if needed for profile pictures, etc.
  }

  async deleteAsset(publicId, resourceType = 'video') {
    try {
      const result = await cloudinary.uploader.destroy(publicId, { resource_type });
      logger.info('[storageManager.deleteAsset] Asset deleted:', { publicId });
      return result;
    } catch (error) {
      logger.error('[storageManager.deleteAsset] Error:', { error: error.message, stack: error.stack });
      throw error;
    }
  }
  async uploadBackground(file, userId) {
    try {
      const publicId = `backgrounds/${userId}/${Date.now()}`;
      const uploadResult = await cloudinary.uploader.upload(file.path, {
        resource_type: 'image',
        public_id: publicId,
        overwrite: true,
      });

      const backgroundUrl = cloudinary.url(publicId, { secure: true });
      logger.info('[storageManager.uploadBackground] Background uploaded', { userId, publicId: uploadResult.public_id });

      return { id: publicId, label: file.originalname, url: backgroundUrl };
    } catch (error) {
      logger.error('[storageManager.uploadBackground] Error', { error: error.message });
      throw error;
    }
  }
}

module.exports = StorageManager;