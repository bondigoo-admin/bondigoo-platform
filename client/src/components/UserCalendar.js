// In UserCalendar.js - replace the entire content
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BookingCalendar } from './BookingCalendar';
import { useQuery } from 'react-query';
import { getUserProfile, getUserSettings } from '../services/userAPI';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const UserCalendar = () => {
  const { user } = useAuth();
  const { t } = useTranslation(['calendar', 'common']);
  
  console.log('[UserCalendar] Initializing for user:', user?.id);

  const { data: userProfile, isLoading: isLoadingProfile, error: profileError } = useQuery(
    ['userProfile', user?.id],
    () => getUserProfile(user?.id),
    {
      enabled: !!user?.id,
      onError: (error) => {
        console.error('[UserCalendar] Error fetching user profile:', error);
      }
    }
  );

  const { data: userSettings, isLoading: isLoadingSettings } = useQuery(
    ['userSettings', user?.id],
    () => getUserSettings(user?.id),
    {
      enabled: !!user?.id,
      onError: (error) => {
        console.error('[UserCalendar] Error fetching user settings:', error);
      }
    }
  );

  const isLoading = isLoadingProfile || isLoadingSettings;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">{t('common:loading')}</span>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="text-red-500 p-4">
        {t('calendar:errorLoadingProfile')}
      </div>
    );
  }

  const minimalSettings = {
    privacySettings: {
      calendarVisibility: 'private'
    },
    timezone: userSettings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...userSettings
  };

  return (
    <BookingCalendar
      userId={user?.id}
      coachName={`${user?.firstName} ${user?.lastName}`}
      coachSettings={minimalSettings}
      viewMode="user"
      isUserCalendar={true}
      onBookingConfirmed={() => {
        console.log('[UserCalendar] Booking confirmed - no action needed in user view');
      }}
    />
  );
};

export default UserCalendar;