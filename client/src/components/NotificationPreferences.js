import React, { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../contexts/AuthContext';
import { 
  Bell, Mail, Smartphone, Globe, Calendar, CheckCircle, 
  AlertTriangle, Save, Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { NotificationTypes } from '../utils/notificationHelpers';
import { updateNotificationPreferences, getNotificationPreferences } from '../services/notificationAPI';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';
import { Label } from './ui/label.tsx';
import { Switch } from './ui/switch.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { Input } from './ui/input.tsx';

const NotificationPreferences = () => {
  const { t } = useTranslation(['notifications', 'common']);
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState({
    channels: { email: true, push: true, inApp: true },
    types: {
      [NotificationTypes.BOOKING_REQUEST]: true,
      [NotificationTypes.BOOKING_CONFIRMED]: true,
      [NotificationTypes.BOOKING_DECLINED]: true,
      [NotificationTypes.BOOKING_CANCELLED]: true,
      [NotificationTypes.SESSION_STARTING]: true,
      [NotificationTypes.PAYMENT_RECEIVED]: true,
      [NotificationTypes.PAYMENT_FAILED]: true
    },
    timing: {
      sessionReminders: 30, dailyDigest: true, digestTime: '09:00',
      quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '07:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    toastNotifications: { enabled: true, priority: 'high_medium', duration: 5000 }
  });

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        setLoading(true);
        const userPreferences = await getNotificationPreferences();
        if (userPreferences) {
          setPreferences(prev => ({ ...prev, ...userPreferences }));
        }
      } catch (error) {
        console.error('Error fetching notification preferences:', error);
        toast.error(t('notifications:errorFetchingPreferences'));
      } finally {
        setLoading(false);
      }
    };
    fetchPreferences();
  }, [user?.id, t]);

  const handleValueChange = (category, key, value) => {
    setPreferences(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value
      }
    }));
  };
  
  const savePreferences = async () => {
    try {
      setSaving(true);
      await updateNotificationPreferences(preferences);
      toast.success(t('notifications:preferencesSaved'));
    } catch (error) {
      console.error('Error saving notification preferences:', error);
      toast.error(t('notifications:errorSavingPreferences'));
    } finally {
      setSaving(false);
    }
  };

  const PreferenceItem = ({ id, label, icon: Icon, checked, onCheckedChange }) => (
    <div className="flex items-center justify-between space-x-2 rounded-lg border p-4 bg-white dark:bg-slate-900">
      <Label htmlFor={id} className="flex items-center gap-3 font-normal cursor-pointer">
        <Icon className="h-5 w-5 text-slate-500 dark:text-slate-400" />
        <span>{label}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {t('notifications:preferencesTitle')}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('notifications:preferencesDescription')}
          </p>
        </div>
        <Button onClick={savePreferences} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? t('common:saving') : t('common:save')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('notifications:channels')}</CardTitle>
          <CardDescription>{t('notifications:channelsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PreferenceItem id="email" label={t('notifications:emailNotifications')} icon={Mail} checked={preferences.channels.email} onCheckedChange={(val) => handleValueChange('channels', 'email', val)} />
          <PreferenceItem id="push" label={t('notifications:pushNotifications')} icon={Smartphone} checked={preferences.channels.push} onCheckedChange={(val) => handleValueChange('channels', 'push', val)} />
          <PreferenceItem id="inApp" label={t('notifications:inAppNotifications')} icon={Globe} checked={preferences.channels.inApp} onCheckedChange={(val) => handleValueChange('channels', 'inApp', val)} />
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>{t('notifications:notificationTypes')}</CardTitle>
          <CardDescription>{t('notifications:notificationTypesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {Object.values(NotificationTypes).map((type) => (
            <PreferenceItem key={type} id={type} label={t(`notifications:types.${type}`)} icon={getNotificationTypeIcon(type)} checked={preferences.types[type] ?? false} onCheckedChange={(val) => handleValueChange('types', type, val)} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('notifications:timing')}</CardTitle>
          <CardDescription>{t('notifications:timingDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2 sm:grid-cols-2">
            <Label htmlFor="sessionReminders">{t('notifications:sessionReminders')}</Label>
            <Select value={String(preferences.timing.sessionReminders)} onValueChange={(val) => handleValueChange('timing', 'sessionReminders', parseInt(val))}>
              <SelectTrigger id="sessionReminders"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 {t('common:minutes')}</SelectItem>
                <SelectItem value="30">30 {t('common:minutes')}</SelectItem>
                <SelectItem value="60">1 {t('common:hour')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <PreferenceItem id="dailyDigest" label={t('notifications:dailyDigest')} icon={Calendar} checked={preferences.timing.dailyDigest} onCheckedChange={(val) => handleValueChange('timing', 'dailyDigest', val)} />
          {preferences.timing.dailyDigest && (
             <div className="grid gap-2 sm:grid-cols-2 pl-6 sm:pl-12">
              <Label htmlFor="digestTime">{t('notifications:digestTime')}</Label>
              <Input id="digestTime" type="time" value={preferences.timing.digestTime} onChange={(e) => handleValueChange('timing', 'digestTime', e.target.value)} />
            </div>
          )}
          <PreferenceItem id="quietHours" label={t('notifications:quietHours')} icon={Bell} checked={preferences.timing.quietHoursEnabled} onCheckedChange={(val) => handleValueChange('timing', 'quietHoursEnabled', val)} />
          {preferences.timing.quietHoursEnabled && (
            <div className="grid gap-4 sm:grid-cols-2 pl-6 sm:pl-12">
               <Input id="quietStart" type="time" value={preferences.timing.quietHoursStart} onChange={(e) => handleValueChange('timing', 'quietHoursStart', e.target.value)} />
               <Input id="quietEnd" type="time" value={preferences.timing.quietHoursEnd} onChange={(e) => handleValueChange('timing', 'quietHoursEnd', e.target.value)} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const getNotificationTypeIcon = (type) => {
  switch (type) {
    case NotificationTypes.BOOKING_REQUEST:
    case NotificationTypes.BOOKING_CONFIRMED:
    case NotificationTypes.BOOKING_DECLINED:
    case NotificationTypes.BOOKING_CANCELLED:
      return Calendar;
    case NotificationTypes.SESSION_STARTING:
      return Bell;
    case NotificationTypes.PAYMENT_RECEIVED:
      return CheckCircle;
    case NotificationTypes.PAYMENT_FAILED:
      return AlertTriangle;
    default:
      return Bell;
  }
};

export default NotificationPreferences;