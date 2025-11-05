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
  const [token, setToken] = useState(localStorage.getItem('token')); // Always use localStorage

  // Step 1: Your original 'checkAuthStatus' logic is moved here and wrapped in useCallback.
  // This preserves ALL of your original code, including the localStorage check.
 const checkAuthStatus = useCallback(async () => {
    logger.info('[AuthContext] >>>>>>>>>> checkAuthStatus RUNNING...');
    setLoading(true);
    try {
      const token = localStorage.getItem('token'); // Always use localStorage
      const storedUserString = localStorage.getItem('user'); // Always use localStorage
      const storedUser = storedUserString ? JSON.parse(storedUserString) : null;

      if (token && storedUser) {
        // YOUR ORIGINAL LOGIC - PRESERVED
        setUser(storedUser);
        setIsAuthenticated(true);
        setUserRole(storedUser.role);
        setUserEmail(storedUser.email);
        setUserId(storedUser.id);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        logger.info('[AuthContext] >>>>>>>>>> checkAuthStatus successfully restored user from storage.');
      } else if (token) {
        // YOUR ORIGINAL SERVER FETCH LOGIC - PRESERVED
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
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
              logger.info(`[AuthContext] >>>>>>>>>> checkAuthStatus SUCCESSFULLY fetched coach profile from server.`);
          } catch (err) {
              logger.error(`[AuthContext] >>>>>>>>>> checkAuthStatus FAILED to fetch coach profile from server.`, { error: err.message });
          }
        }
        
        setUser(finalUserData);
        setIsAuthenticated(true);
        setUserRole(finalUserData.role);
        setUserEmail(finalUserData.email);
        setUserId(finalUserData.id);
        
        // Always persist to localStorage for cross-tab sessions.
        localStorage.setItem('user', JSON.stringify(finalUserData)); // Persist fully hydrated user
        logger.info(`[AuthContext] >>>>>>>>>> checkAuthStatus successfully hydrated user from server.`);
      } else {
        throw new Error("No token found.");
      }
    } catch (error) {
      logger.error('[AuthContext] >>>>>>>>>> checkAuthStatus FAILED. Clearing session.', { message: error.message });
      setUser(null);
      setIsAuthenticated(false);
      setUserId(null);
      setCoachData(null);
      setToken(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token'); // Keep cleaning sessionStorage for users migrating from old version
      sessionStorage.removeItem('user');
      delete api.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
      logger.info('[AuthContext] >>>>>>>>>> checkAuthStatus FINISHED.');
    }
  }, []);

 useEffect(() => {
    const token = localStorage.getItem('token'); // Always use localStorage
    setToken(token);
    logger.debug('[AuthContext] Current token from storage:', token);
    const storedUserString = localStorage.getItem('user'); // Always use localStorage
    const storedUser = storedUserString ? JSON.parse(storedUserString) : null;
    
    if (token && storedUser) {
      setUser(storedUser);
      setIsAuthenticated(true);
      setUserRole(storedUser.role);
      setUserEmail(storedUser.email);
      setUserId(storedUser.id);
    }
  }, []);
  
 useEffect(() => {
    // This effect now correctly calls the function defined above on initial mount.
    checkAuthStatus();
  }, [checkAuthStatus]);

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
    //logger.info('[AuthContext] Adding notification:', notification);
    setNotifications(prev => [notification, ...prev]);
  }, []);

  const markNotificationAsRead = useCallback((notificationId) => {
    //logger.info('[AuthContext] Marking notification as read:', notificationId);
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === notificationId ? { ...notif, read: true } : notif
      )
    );
  }, []);

  const deleteNotification = useCallback((notificationId) => {
    //logger.info('[AuthContext] Deleting notification:', notificationId);
    setNotifications(prev => prev.filter(notif => notif.id !== notificationId));
  }, []);

  const requestLiveSession = useCallback((requestId) => {
    //logger.info('[AuthContext] Starting live session for request ID:', requestId);
    setLiveSessionRequests(prev => prev.filter(request => request.id !== requestId));
  }, []);

  const login = useCallback(async (loginData, rememberMe = false) => {
    if (!loginData.user || !loginData.token) {
      logger.error('[AuthContext] Invalid login data received');
      throw new Error('Invalid login data');
    }

    try {
      // Always use localStorage to ensure session persists across tabs.
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
                // Add the full coach profile to the user object in storage
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

      logger.info(`[AuthContext] >>>>>>>>>> AUTH CONTEXT LOGIN COMPLETE. User object is now set.`, { user: userToSet });
      logger.info(`[AuthContext] >>>>>>>>>> AUTH CONTEXT LOGIN COMPLETE. Token in state is now: ${loginData.token}`);

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
      localStorage.removeItem('token'); // Clear both on failure just in case
      sessionStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      throw error;
    }
  }, []);

  const registerNewCoach = useCallback(async (coachData) => {
    try {
      //logger.info('[AuthContext] Registering new coach');
      const result = await registerCoach(coachData);
      login(result.user);
      setCoachData(result.coachData);
      //logger.info('[AuthContext] New coach registered successfully');
      return result;
    } catch (error) {
      logger.error('[AuthContext] Coach registration failed:', error);
      throw error;
    }
  }, [login]);

  const updateCoach = useCallback(async (coachProfileData) => {
    try {
      //logger.info('[AuthContext] Updating coach profile:', coachProfileData);
      const updatedCoachData = await updateCoachProfile(coachProfileData);
      setCoachData(updatedCoachData);
      setUser(prevUser => ({
        ...prevUser,
        ...updatedCoachData.user
      }));
      //logger.info('[AuthContext] Coach profile updated successfully');
      return updatedCoachData;
    } catch (error) {
      logger.error('[AuthContext] Failed to update coach profile:', error);
      throw error;
    }
  }, []);

  const updateCoachAvailabilityStatus = useCallback(async (availabilityData) => {
    try {
      //logger.info('[AuthContext] Updating coach availability:', availabilityData);
      const updatedAvailability = await updateCoachAvailability(availabilityData);
      setCoachData(prev => ({ ...prev, availability: updatedAvailability }));
      //logger.info('[AuthContext] Coach availability updated successfully');
      return updatedAvailability;
    } catch (error) {
      logger.error('[AuthContext] Failed to update coach availability:', error);
      throw error;
    }
  }, []);

const logout = useCallback(async () => {
    logger.warn('[AuthContext] Logout function initiated', new Error('Logout Trace'));
    try {
      // The socket logout event is now emitted from the component (e.g., Header)
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
   } finally {
        // Add this block to ensure invalidation happens even if server logout fails
        logger.info('[AuthContext] Invalidating activeAnnouncements query on logout.');
        await queryClient.invalidateQueries('activeAnnouncements');
    }
  }, [queryClient]);

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