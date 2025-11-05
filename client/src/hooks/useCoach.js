// useCoach.js

import { useAuth } from '../contexts/AuthContext';
import {
  updateCoachSettings,
  getCoachSettings,
  getVerificationUploadSignature,
  submitVerificationDocument
} from '../services/coachAPI';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useTranslation } from 'react-i18next';

export const useCoach = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const queryClient = useQueryClient();

  const saveCoachSettings = useCallback(async (newSettings) => {
    if (!user?.id) {
      console.error('[useCoach] saveCoachSettings: User ID not available');
      throw new Error('User ID not available');
    }
    console.log('[useCoach] Saving coach settings for user:', user.id);
    try {
      const updatedSettings = await updateCoachSettings(user.id, newSettings);
      console.log('[useCoach] Coach settings updated successfully:', updatedSettings);
      setSettings(updatedSettings);
      queryClient.invalidateQueries(['coachSettings', user.id]);
      return updatedSettings;
    } catch (error) {
      console.error('[useCoach] Error saving coach settings:', error);
      throw error;
    }
  }, [user, queryClient]);

  const fetchCoachSettings = useCallback(async () => {
    if (!user?.id) {
      console.error('[useCoach] fetchCoachSettings: User ID not available');
      return null;
    }
    console.log('[useCoach] Fetching coach settings for user:', user.id);
    try {
      const fetchedSettings = await getCoachSettings(user.id);
      console.log('[useCoach] Coach settings fetched successfully:', fetchedSettings);
      setSettings(fetchedSettings);
      return fetchedSettings;
    } catch (error) {
      console.error('[useCoach] Error fetching coach settings:', error);
      throw error;
    }
  }, [user]);

  return { settings, saveCoachSettings, fetchCoachSettings };
};

export const useSubmitVerificationDocument = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation(['coachSettings', 'common']);

  return useMutation(
    (payload) => submitVerificationDocument(payload), 
    {
    onSuccess: (updatedInsuranceRecognitionData) => {
      toast.success(t('verification.submitSuccess', 'Verification document submitted for review.'));
      queryClient.setQueryData(['coachSettings', user?.id], (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          insuranceRecognition: updatedInsuranceRecognitionData,
        };
      });
    },
    onError: (error) => {
      toast.error(t('verification.submitError', 'Submission failed: {{message}}', {
        message: error.response?.data?.message || error.message || t('common:error.generic')
      }));
    },
  });
};