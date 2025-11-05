import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import Cropper from 'react-easy-crop';
import { Upload, X } from 'lucide-react';

const ProfilePictureUpload = ({ isOpen, onClose, onUpload }) => {
  const { t } = useTranslation(['common', 'coachprofile']);
  const [image, setImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target.result);
    reader.readAsDataURL(file);
  }, []);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    fileRejections
  } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp']
    },
    maxFiles: 1,
    multiple: false
  });

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleUpload = useCallback(() => {
    if (croppedAreaPixels) {
      // Here you would typically send the cropped image to your server
      // For this example, we'll just pass the cropped image data to the parent
      onUpload(croppedAreaPixels);
      onClose();
    }
  }, [croppedAreaPixels, onUpload, onClose]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        className="bg-white rounded-lg p-8 max-w-md w-full"
      >
        <h2 className="text-2xl font-bold mb-4">{t('coachprofile:uploadProfilePicture')}</h2>
        {!image ? (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer ${
              isDragActive ? 'border-indigo-500' : ''
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">
              {isDragActive
                ? t('coachprofile:dropImageHere')
                : t('coachprofile:dragDropImage')}
            </p>
          </div>
        ) : (
          <div className="relative h-64">
            <Cropper
              image={image}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
        )}
        {image && (
          <div className="mt-4">
            <label htmlFor="zoom" className="block text-sm font-medium text-gray-700">
              {t('coachprofile:zoom')}
            </label>
            <input
              type="range"
              id="zoom"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </div>
        )}
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            <X className="mr-2 h-5 w-5" />
            {t('common:cancel')}
          </button>
          {image && (
            <button
              onClick={handleUpload}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Upload className="mr-2 h-5 w-5" />
              {t('coachprofile:upload')}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ProfilePictureUpload;