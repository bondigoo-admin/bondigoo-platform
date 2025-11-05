import { useAuth } from '../contexts/AuthContext';

export const useUserSettings = () => {
    const { user, loading } = useAuth();

    const defaultSettings = {
        language: 'de',
        dateFormat: 'dd.MM.yyyy',
        timeFormat: '24h',
        timeZone: 'Europe/Zurich',
    };

    const settings = user?.settings 
        ? {
            ...defaultSettings,
            ...user.settings,
            // Ensure essential keys are not empty strings from the DB
            dateFormat: user.settings.dateFormat || defaultSettings.dateFormat,
            timeZone: user.settings.timeZone || defaultSettings.timeZone,
          }
        : defaultSettings;

    return {
        settings,
        isLoading: loading,
    };
};