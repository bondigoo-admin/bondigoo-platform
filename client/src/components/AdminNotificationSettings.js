import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Bell, Settings, Clock, AlertCircle, Sliders, 
  Mail, MessageCircle, Calendar, Save, RefreshCw
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { 
  getAdminNotificationSettings, 
  updateAdminNotificationSettings 
} from '../services/adminAPI';
import { NotificationTypes } from '../utils/notificationHelpers';

const AdminNotificationSettings = () => {
  const { t } = useTranslation(['admin', 'notifications']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    defaults: {
      channels: {
        email: true,
        push: true,
        inApp: true
      },
      timing: {
        sessionReminders: 30,
        dailyDigest: true,
        digestTime: '09:00',
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00'
      }
    },
    retentionPeriod: {
      read: 30, // days
      unread: 90, // days
      important: 180 // days
    },
    batchProcessing: {
      enabled: true,
      interval: 5, // minutes
      maxBatchSize: 100
    },
    throttling: {
      enabled: true,
      maxPerMinute: 60,
      maxPerHour: 1000,
      cooldownPeriod: 5 // minutes
    },
    templates: {
      emailSubjects: {},
      emailTemplates: {},
      pushTemplates: {},
      inAppTemplates: {}
    },
    deliveryRules: {
      [NotificationTypes.BOOKING_REQUEST]: {
        priority: 'high',
        requiredChannels: ['email', 'inApp'],
        throttleExempt: true
      },
      [NotificationTypes.SESSION_STARTING]: {
        priority: 'high',
        requiredChannels: ['push', 'inApp'],
        throttleExempt: true
      }
      // ... other notification types
    }
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await getAdminNotificationSettings();
      setSettings(response);
    } catch (error) {
      console.error('Error fetching notification settings:', error);
      toast.error(t('admin:errorFetchingSettings'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateAdminNotificationSettings(settings);
      toast.success(t('admin:settingsSaved'));
    } catch (error) {
      console.error('Error saving notification settings:', error);
      toast.error(t('admin:errorSavingSettings'));
    } finally {
      setSaving(false);
    }
  };

  const updateDeliveryRule = (type, field, value) => {
    setSettings(prev => ({
      ...prev,
      deliveryRules: {
        ...prev.deliveryRules,
        [type]: {
          ...prev.deliveryRules[type],
          [field]: value
        }
      }
    }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <RefreshCw className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  return (
    <div className="admin-notification-settings p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Bell size={24} />
          {t('admin:notificationSettings')}
        </h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          <Save size={16} />
          {saving ? t('common:saving') : t('common:save')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Default User Preferences */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Settings size={20} />
            {t('admin:defaultUserPreferences')}
          </h3>
          <div className="space-y-4">
            <div className="form-group">
              <label className="form-label">{t('admin:defaultChannels')}</label>
              {Object.entries(settings.defaults.channels).map(([channel, enabled]) => (
                <label key={channel} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      defaults: {
                        ...prev.defaults,
                        channels: {
                          ...prev.defaults.channels,
                          [channel]: e.target.checked
                        }
                      }
                    }))}
                    className="form-checkbox"
                  />
                  {t(`notifications:channels.${channel}`)}
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Retention Settings */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Clock size={20} />
            {t('admin:retentionSettings')}
          </h3>
          <div className="space-y-4">
            {Object.entries(settings.retentionPeriod).map(([key, value]) => (
              <div key={key} className="form-group">
                <label className="form-label">
                  {t(`admin:retention.${key}`)}
                </label>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    retentionPeriod: {
                      ...prev.retentionPeriod,
                      [key]: parseInt(e.target.value)
                    }
                  }))}
                  min="1"
                  className="form-input"
                />
                <span className="text-sm text-gray-500 ml-2">
                  {t('common:days')}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Delivery Rules */}
        <section className="space-y-4 col-span-full">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sliders size={20} />
            {t('admin:deliveryRules')}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2">{t('admin:notificationType')}</th>
                  <th className="px-4 py-2">{t('admin:priority')}</th>
                  <th className="px-4 py-2">{t('admin:requiredChannels')}</th>
                  <th className="px-4 py-2">{t('admin:throttleExempt')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(settings.deliveryRules).map(([type, rule]) => (
                  <tr key={type}>
                    <td className="px-4 py-2">
                      {t(`notifications:types.${type}`)}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={rule.priority}
                        onChange={(e) => updateDeliveryRule(type, 'priority', e.target.value)}
                        className="form-select"
                      >
                        <option value="high">{t('common:high')}</option>
                        <option value="medium">{t('common:medium')}</option>
                        <option value="low">{t('common:low')}</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        multiple
                        value={rule.requiredChannels}
                        onChange={(e) => updateDeliveryRule(
                          type,
                          'requiredChannels',
                          Array.from(e.target.selectedOptions, option => option.value)
                        )}
                        className="form-multiselect"
                      >
                        <option value="email">Email</option>
                        <option value="push">Push</option>
                        <option value="inApp">In-App</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={rule.throttleExempt}
                        onChange={(e) => updateDeliveryRule(type, 'throttleExempt', e.target.checked)}
                        className="form-checkbox"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Performance Settings */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle size={20} />
            {t('admin:performanceSettings')}
          </h3>
          <div className="space-y-4">
            <div className="form-group">
              <label className="form-label">{t('admin:batchProcessing')}</label>
              <div className="ml-4 space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.batchProcessing.enabled}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      batchProcessing: {
                        ...prev.batchProcessing,
                        enabled: e.target.checked
                      }
                    }))}
                    className="form-checkbox"
                  />
                  {t('admin:enableBatchProcessing')}
                </label>
                {settings.batchProcessing.enabled && (
                  <>
                    <div className="form-group">
                      <label className="form-label">{t('admin:batchInterval')}</label>
                      <input
                        type="number"
                        value={settings.batchProcessing.interval}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          batchProcessing: {
                            ...prev.batchProcessing,
                            interval: parseInt(e.target.value)
                          }
                        }))}
                        min="1"
                        className="form-input"
                      />
                      <span className="text-sm text-gray-500 ml-2">
                        {t('common:minutes')}
                      </span>
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('admin:maxBatchSize')}</label>
                      <input
                        type="number"
                        value={settings.batchProcessing.maxBatchSize}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          batchProcessing: {
                            ...prev.batchProcessing,
                            maxBatchSize: parseInt(e.target.value)
                          }
                        }))}
                        min="1"
                        className="form-input"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminNotificationSettings;