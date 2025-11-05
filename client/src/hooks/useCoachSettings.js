import { useState, useEffect, useCallback } from 'react';
import { getCoachSettings } from '../services/coachAPI';

export const useCoachSettings = (coachId) => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSettings = useCallback(async () => {
    if (!coachId) {
      console.warn('[useCoachSettings] No coachId provided');
      setLoading(false);
      return;
    }

    console.log('[useCoachSettings] Fetching settings for coachId:', coachId);
    setLoading(true);
    setError(null);

    try {
      const data = await getCoachSettings(coachId);
      //console.log('[useCoachSettings] Received settings:', JSON.stringify(data, null, 2));
      setSettings(data);
    } catch (err) {
      console.error('[useCoachSettings] Error fetching coach settings:', err);
      setError(err.response?.data?.msg || 'An error occurred while fetching coach settings');
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return { settings, loading, error, refetchSettings: fetchSettings };
};