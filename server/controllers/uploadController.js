const { logger } = require('../utils/logger');
const cloudinary = require('../utils/cloudinaryConfig');
const mongoose = require('mongoose'); // Import mongoose

const getResourceTypeFromMimetype = (mimetype) => {
  if (!mimetype) return 'raw';
  if (mimetype.startsWith('video')) return 'video';
  if (mimetype.startsWith('image') || mimetype === 'application/pdf') return 'image';
  return 'raw';
};

exports.handleFileUpload = async (req, res) => {
  console.log(`[uploadController] handleFileUpload invoked for file: ${req.file?.originalname}, query: ${JSON.stringify(req.query)}`);
  if (!req.file) {
    console.warn('[UploadController] File upload attempt without a file.');
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const resourceType = getResourceTypeFromMimetype(req.file.mimetype);
  const isPresentation = req.query.uploadType === 'presentation' && req.file.mimetype === 'application/pdf';
  const isLessonContent = req.query.uploadType === 'lessonContent';

  try {
  if (isPresentation) {
    console.log('[uploadController] Entered PRESENTATION processing block. Step 1: Uploading PDF without transformations...');
    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: `programs/${req.user._id}/presentations`,
          type: 'private',
        },
        (error, result) => {
          if (error) {
            console.error('[uploadController] Cloudinary upload_stream callback ERROR:', JSON.stringify(error, null, 2));
            return reject(error);
          }
          resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    const result = await uploadPromise;
    console.log('[uploadController] FULL result from initial PDF upload:', JSON.stringify(result, null, 2));

    if (!result || !result.pages || result.pages === 0) {
      console.error('[uploadController] Upload result did not contain page count. The uploaded file may not be a valid PDF.');
      throw new Error('Failed to process PDF: Invalid file or page count missing.');
    }

    console.log(`[uploadController] Step 2: PDF uploaded with ${result.pages} pages. Now pre-generating individual PNGs synchronously...`);

    const eagerTransforms = [];
    for (let page = 1; page <= result.pages; page++) {
      eagerTransforms.push({ format: 'png', page: page });
    }

    const explicitResult = await cloudinary.uploader.explicit(result.public_id, {
      resource_type: 'image',
      type: 'private',
      eager: eagerTransforms,
      eager_async: false
    });

    console.log('[uploadController] Explicit result with pre-generated assets:', JSON.stringify(explicitResult, null, 2));

    if (!explicitResult.eager || explicitResult.eager.length !== result.pages) {
      console.error('[uploadController] Eager generation incomplete. Expected:', result.pages, 'Got:', explicitResult.eager?.length);
      throw new Error('Failed to pre-generate all slide images.');
    }

    const slides = explicitResult.eager.map((derived, index) => {
      if (index === 0) {
        console.log('[uploadController] CORRECTLY Formatted Slide URL (Page 1):', derived.secure_url);
      }
      return {
        _id: new mongoose.Types.ObjectId(),
        order: index,
        imageUrl: derived.secure_url,
        imagePublicId: result.public_id,
        audioUrl: null,
        audioPublicId: null,
        duration: null,
      };
    });

    const presentationPayload = {
      originalFileUrl: result.secure_url,
      originalFilePublicId: result.public_id,
      slides: slides
    };

    return res.status(200).json({
      isPresentation: true,
      presentationContent: presentationPayload,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
    });
  } else if (isLessonContent) {
    console.log('[uploadController] Entered LESSON CONTENT processing block.');
    const uploadPromise = new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { 
                resource_type: 'auto',
                upload_preset: 'private_lesson_content'
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        uploadStream.end(req.file.buffer);
    });
    const result = await uploadPromise;
    
    const signedUrl = cloudinary.url(result.public_id, {
        resource_type: result.resource_type,
        type: 'private',
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600
    });

    let thumbnailUrl = null;
    if (result.resource_type === 'video') {
        thumbnailUrl = cloudinary.url(result.public_id, {
            resource_type: 'video',
            type: 'private',
            sign_url: true,
            transformation: [{ fetch_format: 'jpg', seek: '1.0' }],
            secure: true,
            expires_at: Math.floor(Date.now() / 1000) + 3600
        });
    }

    const responsePayload = {
      url: signedUrl,
      publicId: result.public_id,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      resourceType: result.resource_type,
      duration: result.duration || null,
      thumbnailUrl: thumbnailUrl,
      size: result.bytes,
      uploadedAt: result.created_at,
    };
    
    console.log('[uploadController] Sending lesson content payload with SIGNED URL.');
    return res.status(200).json(responsePayload);
  } else {
        console.log('[uploadController] Entered NON-PRESENTATION (standard file) processing block.');
        const uploadPromise = new Promise((resolve, reject) => {
            const folder = getResourceTypeFromMimetype(req.file.mimetype) === 'video' ? 'program_content/videos' : `program_content/documents/${req.user._id}`;
            const uploadStream = cloudinary.uploader.upload_stream(
                { 
                    resource_type: 'auto',
                    type: 'private',
                    folder: folder,
                    public_id: req.file.originalname.split('.')[0]
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            uploadStream.end(req.file.buffer);
        });
        const result = await uploadPromise;

        const signedUrl = cloudinary.url(result.public_id, {
            resource_type: result.resource_type,
            type: 'private',
            sign_url: true,
            expires_at: Math.floor(Date.now() / 1000) + 3600
        });

        let thumbnailUrl = null;
        if (result.resource_type === 'video') {
            thumbnailUrl = cloudinary.url(result.public_id, {
                resource_type: 'video',
                type: 'private',
                sign_url: true,
                transformation: [{ fetch_format: 'jpg', seek: '1.0' }],
                secure: true,
                expires_at: Math.floor(Date.now() / 1000) + 3600
            });
        }

        const responsePayload = {
          url: signedUrl,
          publicId: result.public_id,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          resourceType: result.resource_type,
          duration: result.duration || null,
          thumbnailUrl: thumbnailUrl,
          size: result.bytes,
          uploadedAt: result.created_at,
        };
        
        console.log('[uploadController] Sending standard file payload with SIGNED URL.');
        return res.status(200).json(responsePayload);
    }
  } catch (error) {
    console.error('[UploadController] Error processing finalized upload.', { 
        error: error.message, 
        stack: error.stack,
        fileInfo: {
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
          determinedType: resourceType
        }
    });

    console.error('[uploadController] CAUGHT ERROR:', { 
        message: error.message, 
        http_code: error.http_code, 
        name: error.name 
    });
    
    if (!res.headersSent) {
        res.status(500).json({ message: 'Error processing file upload.', error: error.message });
    }
  }
};