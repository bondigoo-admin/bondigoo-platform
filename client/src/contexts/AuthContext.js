import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import api, { logout as apiLogout } from '../services/api';
import { registerCoach, updateCoachProfile, updateCoachAvailability } from '../services/coachService';
import { getCoachProfile } from '../services/coachAPI';
import PropTypes from 'prop-types';
import { getUserStatus, updateUserStatus } from '../services/statusAPI';
import { useTranslation } from 'react-i18next';
import { logger } from '../utils/logger';
import { useQueryClient } from 'react-query';

const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const { t } = useTranslation(['availability']);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [userId, setUserId] = useState(null);
  
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [notifications, setNotifications] = useState([]);
  const [liveSessionRequests, setLiveSessionRequests] = useState([]);
  const [coachData, setCoachData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authData, setAuthData] = useState(null);
  const [token, setToken] = useState(null); // Initial state is null, will be checked from localStorage

  const logout = useCallback(async () => {
    logger.warn('[AuthContext] Logout function initiated', new Error('Logout Trace'));
    try {
      try {
        await apiLogout();
      } catch (e) {
        logger.warn('[AuthContext] Server logout failed, proceeding with client-side cleanup', e);
      }
      
      // Clear all potential storage locations.
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      
      setUser(null);
      setIsAuthenticated(false);
      setUserRole(null);
      setUserEmail(null);
      setUserId(null);
      
      setNotifications([]);
      setLiveSessionRequests([]);
      setToken(null);
      delete api.defaults.headers.common['Authorization'];
      
    } catch (error) {
      logger.error('[AuthContext] Logout process failed:', error);
      // Ensure local state is cleared even if server request fails
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      setUser(null);
      setIsAuthenticated(false);
      setUserRole(null);
      setUserEmail(null);
      setUserId(null);
      
      setNotifications([]);
      setLiveSessionRequests([]);
      setToken(null);
      delete api.defaults.headers.common['Authorization'];
   } finally {
        // Add this block to ensure invalidation happens even if server logout fails
        logger.info('[AuthContext] Invalidating activeAnnouncements query on logout.');
        await queryClient.invalidateQueries('activeAnnouncements');
    }
  }, [queryClient]);


  // **REFACTORED LOGIC**
  // This single useEffect hook now handles all initial authentication logic.
  useEffect(() => {
    const checkAuthStatus = async () => {
      logger.info('[AuthContext] Verifying authentication status...');
      const storedToken = localStorage.getItem('token');

      if (!storedToken) {
        // This is the normal, expected state for a logged-out user. Not an error.
        logger.info('[AuthContext] No token found. Setting application to public/unauthenticated state.');
        setLoading(false);
        return; // Exit early, leaving the state as unauthenticated.
      }
      
      // We have a token. Let's try to use it.
      api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      setToken(storedToken);

      try {
        const response = await api.get('/users/me');
        const userData = response.data;
        let finalUserData = { ...userData };

        if (userData.role === 'coach' && (userData.id || userData._id)) {
           try {
              const coachId = userData.id || userData._id;
              const coachResponse = await api.get(`/coaches/${coachId}`);
              const coachProfile = coachResponse.data;
              if (coachProfile) {
                  setCoachData(coachProfile);
                  finalUserData.coachProfile = coachProfile;
                  if (coachProfile.profilePicture) {
                      finalUserData.coachProfilePicture = coachProfile.profilePicture;
                  }
              }
              logger.info(`[AuthContext] Successfully fetched coach profile during auth check.`);
          } catch (err) {
              logger.error(`[AuthContext] Failed to fetch coach profile during auth check.`, { error: err.message });
          }
        }

        setUser(finalUserData);
        setIsAuthenticated(true);
        setUserRole(finalUserData.role);
        setUserEmail(finalUserData.email);
        setUserId(finalUserData.id);
        localStorage.setItem('user', JSON.stringify(finalUserData));
        logger.info('[AuthContext] Token is valid. User session established successfully.');

      } catch (error) {
        // This is the "reset mechanism": the token was invalid or expired.
        logger.warn('[AuthContext] Token validation failed. It might be expired or invalid. Clearing session.', { message: error.message });
        await logout(); // Re-use the logout function for a clean reset.
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, [logout]); // We include logout as a dependency because we call it.

  useEffect(() => {
    const handleActivity = () => setLastActivity(Date.now());
    
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, []);

  const updateUserContext = useCallback((updatedUserData) => {
    logger.info('[AuthContext] Updating user context with new data.', updatedUserData);
    setUser(updatedUserData);
    localStorage.setItem('user', JSON.stringify(updatedUserData));
  }, []);

  const addNotification = useCallback((notification) => {
    setNotifications(prev => [notification, ...prev]);
  }, []);

  const markNotificationAsRead = useCallback((notificationId) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === notificationId ? { ...notif, read: true } : notif
      )
    );
  }, []);

  const deleteNotification = useCallback((notificationId) => {
    setNotifications(prev => prev.filter(notif => notif.id !== notificationId));
  }, []);

  const requestLiveSession = useCallback((requestId) => {
    setLiveSessionRequests(prev => prev.filter(request => request.id !== requestId));
  }, []);

  const login = useCallback(async (loginData, rememberMe = false) => {
    if (!loginData.user || !loginData.token) {
      logger.error('[AuthContext] Invalid login data received');
      throw new Error('Invalid login data');
    }

    try {
      const storage = localStorage;
      logger.info(`[AuthContext] Storing session in localStorage for cross-tab compatibility.`);

      storage.setItem('token', loginData.token);
      api.defaults.headers.common['Authorization'] = `Bearer ${loginData.token}`;

      const response = await api.get('/api/users/me');
      let fullUserData = response.data;

      const userToSet = {
        ...fullUserData,
        _id: fullUserData._id || fullUserData.id,
        id: fullUserData._id || fullUserData.id,
        status: 'online',
      };

      if (userToSet.role === 'coach' && (userToSet.id || userToSet._id)) {
        try {
            const coachId = userToSet.id || userToSet._id;
             const coachProfile = await getCoachProfile(coachId);
            if (coachProfile) {
                setCoachData(coachProfile);
                userToSet.coachProfile = coachProfile;
                if (coachProfile.profilePicture) {
                    userToSet.coachProfilePicture = coachProfile.profilePicture;
                }
                userToSet.coachProfile = coachProfile; 
            }
        } catch (err) {
            logger.error(`[AuthContext] Failed to fetch full coach profile for user ${userToSet.id} during login.`, err);
        }
      }

      setUser(userToSet);
      setIsAuthenticated(true);
      storage.setItem('user', JSON.stringify(userToSet));
      setToken(loginData.token);
      setUserRole(userToSet.role);
      setUserEmail(userToSet.email);
      setUserId(userToSet._id);
      logger.info('[AuthContext] User authenticated. Final User ID:', userToSet._id, 'Role:', userToSet.role);

      logger.info('[AuthContext] Invalidating activeAnnouncements query on login.');
      await queryClient.invalidateQueries('activeAnnouncements');

      try {
        await updateUserStatus('online');
        logger.info('[AuthContext] User status set to online after login.');
      } catch (statusError) {
        logger.error('[AuthContext] Failed to set user status to online after login.', statusError);
      }

    } catch (error) {
      logger.error('[AuthContext] Error during login user fetch:', error);
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      throw error;
    }
  }, [queryClient]);

  const registerNewCoach = useCallback(async (coachData) => {
    try {
      const result = await registerCoach(coachData);
      login(result.user);
      setCoachData(result.coachData);
      return result;
    } catch (error) {
      logger.error('[AuthContext] Coach registration failed:', error);
      throw error;
    }
  }, [login]);

  const updateCoach = useCallback(async (coachProfileData) => {
    try {
      const updatedCoachData = await updateCoachProfile(coachProfileData);
      setCoachData(updatedCoachData);
      setUser(prevUser => ({
        ...prevUser,
        ...updatedCoachData.user
      }));
      return updatedCoachData;
    } catch (error) {
      logger.error('[AuthContext] Failed to update coach profile:', error);
      throw error;
    }
  }, []);

  const updateCoachAvailabilityStatus = useCallback(async (availabilityData) => {
    try {
      const updatedAvailability = await updateCoachAvailability(availabilityData);
      setCoachData(prev => ({ ...prev, availability: updatedAvailability }));
      return updatedAvailability;
    } catch (error) {
      logger.error('[AuthContext] Failed to update coach availability:', error);
      throw error;
    }
  }, []);

  const contextValue = useMemo(() => ({
    user,
    setUser,
    loading,
    isAuthenticated,
    updateUserContext,
    token,
    userRole,
    userEmail,
    userId: user ? user._id : null,
    coachId: user && user.role === 'coach' ? user.coachId : null,
    notifications,
    liveSessionRequests,
    coachData,
    login,
    logout,
    markNotificationAsRead,
    deleteNotification,
    requestLiveSession,
    registerNewCoach,
    updateCoach,
    updateCoachAvailabilityStatus
  }), [
    user, 
    loading, 
    isAuthenticated, 
    updateUserContext,
    token, 
    userRole, 
    userEmail, 
    notifications, 
    liveSessionRequests, 
    coachData, 
    login, 
    logout, 
    markNotificationAsRead, 
    deleteNotification, 
    requestLiveSession, 
    registerNewCoach, 
    updateCoach, 
    updateCoachAvailabilityStatus
  ]);


  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export { AuthContext, AuthProvider, useAuth };