import React, { useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import BookingCalendar from './BookingCalendar';
import { useAuth } from '../contexts/AuthContext';

import { getCoachSettings } from '../services/coachAPI';
import * as coachAPI from '../services/coachAPI';
import { getSessionTypes } from '../services/adminAPI';
import ManageSessions from './ManageSessions';

const AvailabilityTab = ({ userId, isOwnProfile: propIsOwnProfile, coachSettings: propCoachSettings, connectionStatus: propConnectionStatus, isLoadingConnection: propIsLoadingConnection }) => {
  const { t } = useTranslation(['common', 'coachprofile']);
  const { user } = useAuth();

  const isConnected = propConnectionStatus === 'accepted';
  const isLoadingConnection = propIsLoadingConnection;

   useEffect(() => {
    console.log('[AvailabilityTab] Connection status from props:', {
        propConnectionStatus,
        isLoadingConnection,
        derivedIsConnected: isConnected
    });
  }, [propConnectionStatus, isLoadingConnection, isConnected]);

  const { data: coachProfile } = useQuery(
    ['coachProfile', userId],
    () => coachAPI.getCoachProfile(userId),
    {
      enabled: !!userId,
      onError: (error) => {
        console.error('[AvailabilityTab] Error fetching coach profile:', error);
      }
    }
  );

  const { data: sessionTypes, isLoading: isLoadingSessionTypes } = useQuery(
    'sessionTypes',
    getSessionTypes,
    {
      staleTime: Infinity,
      onSuccess: (data) => {
        console.log('[AvailabilityTab] Session types fetched:', data?.length);
      },
      onError: (error) => {
        console.error('[AvailabilityTab] Error fetching session types:', error);
      }
    }
  );

const { 
    data: fetchedCoachSettings, 
    isLoading: isLoadingCoachSettings,
    error: coachSettingsError 
  } = useQuery(['coachSettings', userId], () => getCoachSettings(userId), {
    // Force this query to run even if props are passed, to ensure we get the complete settings object.
    enabled: !!userId,
    onSuccess: (data) => {
      console.log('[AvailabilityTab] Complete coach settings fetched successfully:', data);
    },
    onError: (error) => {
      console.error('[AvailabilityTab] Error fetching complete coach settings:', error);
    }
  });

  // Memoize the merged settings to prevent unnecessary re-renders.
  // This combines the settings from the parent (propCoachSettings) with the more complete,
  // directly fetched settings. Properties from fetchedCoachSettings will overwrite any
  // incomplete/missing properties from the parent.
  const coachSettings = useMemo(() => {
    if (!propCoachSettings && !fetchedCoachSettings) {
      return null;
    }
    return { ...propCoachSettings, ...fetchedCoachSettings };
  }, [propCoachSettings, fetchedCoachSettings]);

  const isOwnProfile = propIsOwnProfile;
  // Use a combined loading state.
  const isLoadingSettings = (propCoachSettings ? false : isLoadingCoachSettings) || (!fetchedCoachSettings && !coachSettingsError);

  const canViewCalendar = useMemo(() => {
    if (isLoadingConnection || isLoadingSettings) return false;
    
    if (isOwnProfile) {
      console.log('[AvailabilityTab] canViewCalendar: true (own profile)');
      return true;
    }
    
    if (!coachSettings || !coachSettings.privacySettings) {
      console.log('[AvailabilityTab] canViewCalendar: false (no settings or privacy settings)');
      return false;
    }
    
    const { calendarVisibility } = coachSettings.privacySettings;
    console.log('[AvailabilityTab] Calendar visibility setting:', calendarVisibility);
    
    let result;
    switch (calendarVisibility) {
      case 'public':
        result = true;
        break;
      case 'connectedOnly':
        result = isConnected;
        break;
      case 'private':
        result = false;
        break;
      default:
        result = false;
    }
    
   console.log(`[AvailabilityTab] canViewCalendar: ${result} (${calendarVisibility})`);
    return result;
  }, [isLoadingConnection, isLoadingSettings, coachSettings, isConnected, isOwnProfile]);
  
  const coachName = useMemo(() => {
    if (!coachProfile) return 'Unknown Coach';

    if (coachProfile?.firstName && coachProfile?.lastName) {
      return `${coachProfile.firstName} ${coachProfile.lastName}`.trim();
    }
    
    if (coachProfile?.user?.firstName && coachProfile?.user?.lastName) {
      return `${coachProfile.user.firstName} ${coachProfile.user.lastName}`.trim();
    }

    return coachProfile?.user?.email || 'Unknown Coach';
  }, [coachProfile]);

  useEffect(() => {
    console.log('[AvailabilityTab] Current coach name:', coachName);
  }, [coachName]);

  const handleBookingConfirmed = (bookingDetails) => {
    console.log('[AvailabilityTab] Booking confirmed:', bookingDetails);
  };

  const handleBookSession = async (sessionDetails) => {
    try {
      console.log('[AvailabilityTab] Booking session:', sessionDetails);
    } catch (error) {
      console.error('[AvailabilityTab] Error booking session:', error);
    }
  };

  const handleAddUpcomingSession = async (sessionData) => {
    try {
      console.log('[AvailabilityTab] Adding upcoming session:', sessionData);
    } catch (error) {
    }
  };

  const handleAvailabilityUpdate = async (newAvailability) => {
    try {
      console.log('[AvailabilityTab] Updating availability:', newAvailability);
    } catch (error) {
      console.error('[AvailabilityTab] Error updating availability:', error);
    }
  };
  useEffect(() => {
    console.log('[AvailabilityTab] Dependencies updated:', {
      isLoadingConnection,
      isLoadingCoachSettings,
      coachSettings,
      isConnected,
      isOwnProfile
    });
  }, [isLoadingConnection, isLoadingCoachSettings, coachSettings, isConnected, isOwnProfile]);

  if (isLoadingSettings || isLoadingConnection || isLoadingSessionTypes) {
    console.log('[AvailabilityTab] Loading:', {
      settings: isLoadingSettings,
      connection: isLoadingConnection,
      sessionTypes: isLoadingSessionTypes
    });
    return <div className="p-8 text-center text-muted-foreground">{t('common:loading')}</div>;
  }

  if (coachSettingsError) {
    console.error('[AvailabilityTab] Error loading coach settings:', coachSettingsError);
    return (
      <div className="m-4 p-4 bg-destructive/10 border border-destructive/50 text-destructive rounded-lg" role="alert">
        <h3 className="font-semibold">{t('common:error')}</h3>
        <p>{coachSettingsError.message || 'Failed to load coach settings'}</p>
        <p>{t('coachprofile:tryAgainLater')}</p>
      </div>
    );
  }

  if (!coachSettings) {
    console.log('[AvailabilityTab] No settings available');
    return <div className="p-8 text-center text-muted-foreground">{t('coachprofile:noSettingsAvailable')}</div>;
  }

  if (isOwnProfile) {
    return <ManageSessions userId={userId} isEmbedded={true} />;
  }

  if (!canViewCalendar) {
    console.log('[AvailabilityTab] User cannot view calendar');
    return (
      <div className="mt-4 p-4 bg-yellow-100 dark:bg-yellow-900/20 border-l-4 border-yellow-500 dark:border-yellow-400 text-yellow-700 dark:text-yellow-300 rounded-r-md">
        <p className="font-bold">{t('coachprofile:calendarNotAccessible')}</p>
      </div>
    );
  }

  return (
    <div className="bg-card text-card-foreground rounded-lg border shadow-sm">
     
      <BookingCalendar
        userId={userId}
        coachName={coachName}
        availableSlots={coachSettings?.availability || []}
        coachRate={coachSettings?.rate || 0}
        onBookingConfirmed={handleBookingConfirmed}
        onBookSession={handleBookSession}
        addUpcomingSession={handleAddUpcomingSession}
        coachSettings={coachSettings}
        onAvailabilityUpdate={handleAvailabilityUpdate}
        isConnected={isConnected}
        isOwnProfile={isOwnProfile}
        sessionTypes={sessionTypes}
      />
  
    </div>
  );
};

export default AvailabilityTab;