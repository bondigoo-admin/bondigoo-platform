import React, { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../contexts/AuthContext';
import { updateUserSettings, getUserSettings } from '../services/userAPI';
import { toast } from 'react-hot-toast';
import TimezoneSelect from 'react-timezone-select';
import { 
  User, Lock, Bell, Globe, Shield, Mail, Phone, 
  Calendar, BookOpen, Monitor, Database, Trash2 
} from 'lucide-react';

const GeneralSettings = () => {
  const { t } = useTranslation(['common', 'settings']);
  const { user, updateUser } = useContext(AuthContext);
  const [settings, setSettings] = useState({
    accountManagement: {
      twoFactorAuth: false,
      linkedAccounts: {
        google: false,
        facebook: false,
        apple: false,
      },
    },
    communicationPreferences: {
      preferredContactMethod: 'email',
      language: 'en',
      timeZone: 'UTC',
    },
    notificationPreferences: {
      sessionReminders: {
        oneDay: true,
        oneHour: true,
        fifteenMinutes: true,
      },
      newMessageAlerts: true,
      connectionRequests: true,
      platformUpdates: true,
      marketingCommunications: false,
    },
    privacyAndData: {
      cookiePreferences: {
        necessary: true,
        functional: true,
        performance: true,
        advertising: false,
      },
    },
    accessibility: {
      fontSize: 'medium',
      colorContrast: 'normal',
      screenReaderCompatible: false,
    },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        console.log('[GeneralSettings] Fetching settings for user:', user.id);
        setIsLoading(true);
        const data = await getUserSettings(user.id);
        console.log('[GeneralSettings] Received settings:', data);
        setSettings(prevSettings => ({ ...prevSettings, ...data.settings }));
        setIsLoading(false);
      } catch (error) {
        console.error('[GeneralSettings] Error fetching settings:', error);
        toast.error(t('settings:errorFetchingSettings'));
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [user.id, t]);

  const handleInputChange = (section, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const handleNestedInputChange = (section, nestedSection, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [nestedSection]: {
          ...prev[section]?.[nestedSection],
          [field]: value,
        },
      },
    }));
  };

  const handleSaveSettings = async () => {
    console.log('[GeneralSettings] Saving settings:', settings);
    setIsSaving(true);
    try {
      const updatedUser = await updateUserSettings(user.id, settings);
      updateUser(updatedUser);
      toast.success(t('settings:settingsSaved'));
    } catch (error) {
      console.error('[GeneralSettings] Error saving settings:', error);
      toast.error(t('settings:errorSavingSettings'));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = () => {
    toast.info(t('settings:passwordChangeNotImplemented'));
  };

  const handleDataExport = () => {
    toast.info(t('settings:dataExportNotImplemented'));
  };

  const handleAccountDeletion = () => {
    toast.info(t('settings:accountDeletionNotImplemented'));
  };

  if (isLoading) {
    return <div className="settings-loading">{t('common:loading')}</div>;
  }

  return (
    <div className="general-settings">
      <h1 className="settings-title">{t('settings:generalSettings')}</h1>
      
      <section className="settings-section">
        <h2><User className="inline-icon" /> {t('settings:accountManagement')}</h2>
        <div className="setting-group">
          <button onClick={handlePasswordChange} className="btn btn-secondary">
            <Lock className="inline-icon" /> {t('settings:changePassword')}
          </button>
        </div>
        <div className="setting-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.accountManagement?.twoFactorAuth ?? false}
              onChange={(e) => handleInputChange('accountManagement', 'twoFactorAuth', e.target.checked)}
            />
            <span className="checkbox-text">{t('settings:enableTwoFactorAuth')}</span>
          </label>
        </div>
        <h3>{t('settings:linkedAccounts')}</h3>
        {Object.entries(settings.accountManagement?.linkedAccounts ?? {}).map(([account, isLinked]) => (
          <div key={account} className="setting-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isLinked}
                onChange={(e) => handleNestedInputChange('accountManagement', 'linkedAccounts', account, e.target.checked)}
              />
              <span className="checkbox-text">{t(`settings:${account}Account`)}</span>
            </label>
          </div>
        ))}
      </section>

      <section className="settings-section">
        <h2><Bell className="inline-icon" /> {t('settings:communicationPreferences')}</h2>
        <div className="setting-row">
          <label htmlFor="preferredContactMethod">{t('settings:preferredContactMethod')}</label>
          <select
            id="preferredContactMethod"
            value={settings.communicationPreferences?.preferredContactMethod ?? 'email'}
            onChange={(e) => handleInputChange('communicationPreferences', 'preferredContactMethod', e.target.value)}
            className="select-input"
          >
            <option value="email">{t('settings:email')}</option>
            <option value="inApp">{t('settings:inApp')}</option>
            <option value="sms">{t('settings:sms')}</option>
          </select>
        </div>
        <div className="setting-row">
          <label htmlFor="language">{t('settings:language')}</label>
          <select
            id="language"
            value={settings.communicationPreferences?.language ?? 'en'}
            onChange={(e) => handleInputChange('communicationPreferences', 'language', e.target.value)}
            className="select-input"
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
          </select>
        </div>
        <div className="setting-row">
          <label htmlFor="timeZone">{t('settings:timeZone')}</label>
          <TimezoneSelect
            value={settings.communicationPreferences?.timeZone ?? 'UTC'}
            onChange={(tz) => handleInputChange('communicationPreferences', 'timeZone', tz.value)}
            className="select-input"
          />
        </div>
      </section>

      <section className="settings-section">
        <h2><Bell className="inline-icon" /> {t('settings:notificationPreferences')}</h2>
        <h3>{t('settings:sessionReminders')}</h3>
        {Object.entries(settings.notificationPreferences?.sessionReminders ?? {}).map(([timing, isEnabled]) => (
          <div key={timing} className="setting-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => handleNestedInputChange('notificationPreferences', 'sessionReminders', timing, e.target.checked)}
              />
              <span className="checkbox-text">{t(`settings:${timing}Reminder`)}</span>
            </label>
          </div>
        ))}
        <div className="setting-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.notificationPreferences?.newMessageAlerts ?? false}
              onChange={(e) => handleInputChange('notificationPreferences', 'newMessageAlerts', e.target.checked)}
            />
            <span className="checkbox-text">{t('settings:newMessageAlerts')}</span>
          </label>
        </div>
        <div className="setting-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.notificationPreferences?.connectionRequests ?? false}
              onChange={(e) => handleInputChange('notificationPreferences', 'connectionRequests', e.target.checked)}
            />
            <span className="checkbox-text">{t('settings:connectionRequests')}</span>
          </label>
        </div>
        <div className="setting-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.notificationPreferences?.platformUpdates ?? false}
              onChange={(e) => handleInputChange('notificationPreferences', 'platformUpdates', e.target.checked)}
            />
            <span className="checkbox-text">{t('settings:platformUpdates')}</span>
          </label>
        </div>
        <div className="setting-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.notificationPreferences?.marketingCommunications ?? false}
              onChange={(e) => handleInputChange('notificationPreferences', 'marketingCommunications', e.target.checked)}
            />
            <span className="checkbox-text">{t('settings:marketingCommunications')}</span>
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2><Shield className="inline-icon" /> {t('settings:privacyAndData')}</h2>
        <h3>{t('settings:cookiePreferences')}</h3>
        {Object.entries(settings.privacyAndData?.cookiePreferences ?? {}).map(([cookieType, isEnabled]) => (
          <div key={cookieType} className="setting-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => handleNestedInputChange('privacyAndData', 'cookiePreferences', cookieType, e.target.checked)}
                disabled={cookieType === 'necessary'}
              />
              <span className="checkbox-text">{t(`settings:${cookieType}Cookies`)}</span>
            </label>
          </div>
        ))}
        <div className="setting-group">
          <button onClick={handleDataExport} className="btn btn-secondary">
            <Database className="inline-icon" /> {t('settings:exportData')}
          </button>
        </div>
        <div className="setting-group">
          <button onClick={handleAccountDeletion} className="btn btn-danger">
            <Trash2 className="inline-icon" /> {t('settings:deleteAccount')}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2><Monitor className="inline-icon" /> {t('settings:accessibility')}</h2>
        <div className="setting-row">
          <label htmlFor="fontSize">{t('settings:fontSize')}</label>
          <select
            id="fontSize"
            value={settings.accessibility?.fontSize ?? 'medium'}
            onChange={(e) => handleInputChange('accessibility', 'fontSize', e.target.value)}
            className="select-input"
          >
            <option value="small">{t('settings:small')}</option>
            <option value="medium">{t('settings:medium')}</option>
            <option value="large">{t('settings:large')}</option>
          </select>
        </div>
        <div className="setting-row">
          <label htmlFor="colorContrast">{t('settings:colorContrast')}</label>
          <select
            id="colorContrast"
            value={settings.accessibility?.colorContrast ?? 'normal'}
            onChange={(e) => handleInputChange('accessibility', 'colorContrast', e.target.value)}
            className="select-input"
          >
            <option value="normal">{t('settings:normal')}</option>
            <option value="high">{t('settings:highContrast')}</option>
          </select>
        </div>
        <div className="setting-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.accessibility?.screenReaderCompatible ?? false}
              onChange={(e) => handleInputChange('accessibility', 'screenReaderCompatible', e.target.checked)}
            />
            <span className="checkbox-text">{t('settings:screenReaderCompatible')}</span>
          </label>
        </div>
      </section>

      <div className="settings-actions">
        <button onClick={handleSaveSettings} className="btn btn-primary" disabled={isSaving}>
          {isSaving ? t('common:saving') : t('common:saveChanges')}
        </button>
      </div>
    </div>
  );
};

export default GeneralSettings;