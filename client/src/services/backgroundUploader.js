import { logger } from '../utils/logger';
import axios from 'axios';

export const backgroundUploader = async ({
  videoFile,
  thumbnailFile,
  _tempId,
  trimStart,
  trimEnd,
  getSignatureFunc,
  onProgress,
  onComplete,
  onFailure,
}) => {
  if (!videoFile || !(videoFile instanceof File)) {
    const errorMsg = 'No valid videoFile provided to uploader.';
    logger.error(`[backgroundUploader] Validation failed: ${errorMsg}`, { tempId: _tempId });
    onFailure(_tempId, errorMsg);
    return;
  }
  logger.info('[backgroundUploader] Starting orchestrated upload.', { tempId: _tempId, videoName: videoFile.name });

  let thumbnailUploadResult;

  try {
    if (thumbnailFile) {
      logger.info('[backgroundUploader] Requesting signature for thumbnail.', { tempId: _tempId });
      const thumbSignatureData = await getSignatureFunc({ uploadType: 'lessonThumbnail' });
      logger.info('[backgroundUploader] Received thumbnail signature.', { tempId: _tempId, data: thumbSignatureData });
      
      const thumbFormData = new FormData();
      thumbFormData.append('file', thumbnailFile);
      thumbFormData.append('api_key', thumbSignatureData.apiKey);
      thumbFormData.append('timestamp', thumbSignatureData.timestamp);
      thumbFormData.append('signature', thumbSignatureData.signature);
      thumbFormData.append('upload_preset', thumbSignatureData.upload_preset);
      if (thumbSignatureData.folder) thumbFormData.append('folder', thumbSignatureData.folder);

      const thumbEndpointUrl = `https://api.cloudinary.com/v1_1/${thumbSignatureData.cloudName}/image/upload`;
      
      const thumbResponse = await axios.post(thumbEndpointUrl, thumbFormData, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      
      thumbnailUploadResult = thumbResponse.data;
      logger.info('[backgroundUploader] Thumbnail upload successful.', { tempId: _tempId, url: thumbnailUploadResult.secure_url });
    }

    logger.info('[backgroundUploader] Requesting signature for video.', { tempId: _tempId });
   const videoSignatureData = await getSignatureFunc({ uploadType: 'lessonContent' });
    logger.info('[backgroundUploader] Received video signature.', { tempId: _tempId, data: videoSignatureData });
    logger.info('[!!!] VIDEO SIGNATURE DATA RECEIVED FROM BACKEND:', { tempId: _tempId, data: videoSignatureData });
    
    const videoFormData = new FormData();
    videoFormData.append('file', videoFile);
    videoFormData.append('api_key', videoSignatureData.apiKey);
    videoFormData.append('timestamp', videoSignatureData.timestamp);
    videoFormData.append('signature', videoSignatureData.signature);
    videoFormData.append('upload_preset', videoSignatureData.upload_preset);
    if (videoSignatureData.folder) videoFormData.append('folder', videoSignatureData.folder);
    if (videoSignatureData.eager_async) {
      const eagerAsyncValue = videoSignatureData.eager_async === true ? '1' : '0';
      videoFormData.append('eager_async', eagerAsyncValue);
      logger.info(`[!!!] CONVERTED eager_async from boolean to string '${eagerAsyncValue}' for FormData.`, { tempId: _tempId });
    }

    const formDataEntries = {};
    for (const [key, value] of videoFormData.entries()) {
        if (key !== 'file') {
            formDataEntries[key] = value;
        } else {
            formDataEntries[key] = { name: value.name, size: value.size, type: value.type };
        }
    }
    logger.info('[!!!] FINAL FORM DATA BEING SENT TO CLOUDINARY API:', { tempId: _tempId, formData: formDataEntries });

    const videoEndpointUrl = `https://api.cloudinary.com/v1_1/${videoSignatureData.cloudName}/video/upload`;
    
    const videoCloudinaryResponse = await axios.post(videoEndpointUrl, videoFormData, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(_tempId, percentCompleted);
        }
      },
    });
    
    const videoResult = videoCloudinaryResponse.data;
    const trimmedDuration = trimEnd - trimStart;

    const finalVideoData = {
      publicId: videoResult.public_id,
      url: videoResult.secure_url,
      duration: trimmedDuration,
      thumbnail: thumbnailUploadResult ? thumbnailUploadResult.secure_url : null,
      trimStart: trimStart,
      trimEnd: trimEnd,
      fileName: videoFile.name,
      resourceType: 'video',
      mimeType: videoFile.type,
      size: videoResult.bytes,
      width: videoResult.width,
      height: videoResult.height,
    };
    
    logger.info('[backgroundUploader] Video upload successful. Completing job.', { tempId: _tempId });
    onComplete(_tempId, finalVideoData);

  } catch (error) {
    const errorDetails = {
        message: error.message,
        isAxiosError: error.isAxiosError,
        responseStatus: error.response?.status,
        responseData: error.response?.data,
    };
    const errorMessage = error.response?.data?.error?.message || error.message || 'Upload failed';
    logger.error('[backgroundUploader] Background upload failed.', { tempId: _tempId, fileName: videoFile.name, error: errorDetails });
    onFailure(_tempId, errorMessage);
  }
};

export const directUploader = async ({ file, trimStart, trimEnd, getSignatureFunc }) => {
  logger.info('[directUploader] Starting direct upload.', { fileName: file.name });
  const signatureData = await getSignatureFunc();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signatureData.apiKey);
  formData.append('timestamp', signatureData.timestamp);
  formData.append('signature', signatureData.signature);
  formData.append('upload_preset', signatureData.upload_preset);
  if (signatureData.folder) formData.append('folder', signatureData.folder);
  if (signatureData.eager) formData.append('eager', signatureData.eager);

  const resourceType = signatureData.resource_type || 'video';
  const endpointUrl = `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/${resourceType}/upload`;

  const cloudinaryResponse = await axios.post(endpointUrl, formData, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  const result = cloudinaryResponse.data;
  const thumbnailUrl = result.eager?.[0]?.secure_url;
  const trimmedDuration = trimEnd - trimStart;

return {
    publicId: result.public_id,
    url: result.secure_url,
    duration: trimmedDuration,
    thumbnail: thumbnailUrl,
    trimStart: trimStart,
    trimEnd: trimEnd,
    fileName: file.name,
    resourceType: 'video',
    width: result.width,
    height: result.height,
  };
};