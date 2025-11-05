const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

async function uploadMedia(file, folder = 'general') {
  try {
    let result;
    if (Buffer.isBuffer(file)) {
      // If file is a buffer
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: folder, resource_type: "auto" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(file);
      });
    } else {
      // If file is a path or URL
      result = await cloudinary.uploader.upload(file, {
        resource_type: "auto",
        folder: folder
      });
    }
    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
}

async function deleteMedia(publicId) {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
}

module.exports = { uploadMedia, deleteMedia };