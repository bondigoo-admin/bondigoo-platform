// hooks/useProfilePicture.js
import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as userAPI from '../services/userAPI';
import * as coachAPI from '../services/coachAPI';
import { logger } from '../utils/logger';

export const useProfilePicture = (userId, userType = 'user') => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const { user: currentUser } = useAuth();

  const isOwnProfile = currentUser?._id === userId;

  const uploadProfilePicture = useCallback(async (file) => {
    try {
      logger.info('[useProfilePicture] Starting profile picture upload');
      setIsUploading(true);
      setError(null);
      
      const api = userType === 'coach' ? coachAPI : userAPI;
      const result = await api.uploadProfilePicture(file);
      
      logger.info('[useProfilePicture] Profile picture uploaded successfully');
      return result;
    } catch (error) {
      logger.error('[useProfilePicture] Error uploading profile picture:', error);
      setError(error.message || 'Error uploading profile picture');
      throw error;
    } finally {
      setIsUploading(false);
    }
  }, [userType]);

  const removeProfilePicture = useCallback(async () => {
    try {
      logger.info('[useProfilePicture] Removing profile picture');
      setError(null);
      const api = userType === 'coach' ? coachAPI : userAPI;
      const result = await api.removeProfilePicture();
      
      logger.info('[useProfilePicture] Profile picture removed successfully');
      return result;
    } catch (error) {
      logger.error('[useProfilePicture] Error removing profile picture:', error);
      setError(error.message || 'Error removing profile picture');
      throw error;
    }
  }, [userType]);

  return {
    isUploading,
    error,
    isOwnProfile,
    uploadProfilePicture,
    removeProfilePicture
  };
};

