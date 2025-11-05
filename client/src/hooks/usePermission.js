import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export const usePermissions = () => {
  const { user } = useContext(AuthContext);

  const isCoach = () => user && user.role === 'coach';

  const canManageAvailability = (coachId) => {
    return isCoach() && user._id === coachId;
  };

  const canViewCoachCalendar = (coachId, calendarVisibility, isConnected) => {
    console.log('[usePermissions] Checking calendar view permission:', { 
      userId: user?._id, 
      coachId, 
      calendarVisibility, 
      isConnected 
    });

    if (calendarVisibility === 'public') {
      console.log('[usePermissions] Calendar is public, access granted');
      return true;
    }

    if (user._id === coachId) {
      console.log('[usePermissions] User is the coach, access granted');
      return true;
    }

    if (calendarVisibility === 'connected' && isConnected) {
      console.log('[usePermissions] User is connected and calendar is visible to connections, access granted');
      return true;
    }

    console.log('[usePermissions] Access denied');
    return false;
  };

  return {
    isCoach,
    canManageAvailability,
    canViewCoachCalendar,
  };
};