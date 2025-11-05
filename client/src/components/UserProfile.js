import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { getUserProfile } from '../services/userAPI';
import { toast } from 'react-hot-toast';
import UserProfileHeader from './UserProfileHeader';
import UserProfileTabs from './UserProfileTabs';
import UserProfileAbout from './UserProfileAbout';
import UserProfileSettings from './UserProfileSettings';
import ConnectionsTab from './ConnectionsTab';
import { logger } from '../utils/logger';
import LoadingSpinner from './LoadingSpinner';

const UserProfile = ({ userId: propUserId, isOwnProfile: propIsOwnProfileFromNav }) => {
  const { t } = useTranslation(['common', 'userprofile']);
  const { id: paramId } = useParams();
  const { user: loggedInUser, isAuthenticated, loading: authLoading } = useAuth();
  
  const [profile, setProfile] = useState(null);
  const [componentLoading, setComponentLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('about');
  const [isOwnProfileState, setIsOwnProfileState] = useState(false);
  const navigate = useNavigate();

  // The logic for determining the ID is moved inside the useEffect for clarity and safety.
  
  useEffect(() => {
    const determineProfileIdToFetch = () => {
      if (propIsOwnProfileFromNav && propUserId) return propUserId;
      if (paramId) return paramId;
      if (isAuthenticated && loggedInUser?._id && !propIsOwnProfileFromNav && !paramId) {
        return loggedInUser._id;
      }
      return null;
    };
  
    const profileIdToFetch = determineProfileIdToFetch();

    logger.info(`[UserProfile] Effect triggered. ID to fetch: ${profileIdToFetch}, AuthLoading: ${authLoading}, IsAuthenticated: ${isAuthenticated}`);
    
    if (authLoading) {
      logger.info('[UserProfile] AuthContext is loading. Waiting for auth.');
      setComponentLoading(true);
      return;
    }

    // Simplified and more robust check for a valid ID before proceeding.
    // This replaces the complex nested conditional.
    if (!profileIdToFetch) {
        // This can happen briefly during navigation before router params are available.
        // By returning, we wait for a re-render when the ID is available.
        // If it remains null, it's a genuine issue.
        if (!paramId && !propUserId) { // Only show error if no ID is expected from URL or props
            logger.error('[UserProfile] No valid profile ID could be determined.');
            setError(t('userprofile:errorInvalidUserId'));
            setComponentLoading(false);
        }
        return;
    }

    const fetchUserProfileData = async () => {
      logger.info(`[UserProfile] Attempting to fetch user profile for ID: ${profileIdToFetch}.`);
      setComponentLoading(true);
      setError(null);
      try {
        const data = await getUserProfile(profileIdToFetch);
        logger.info(`[UserProfile] Data fetched for ID ${profileIdToFetch}.`);
        setProfile(data);
        
        let ownCheck = false;
        if (propIsOwnProfileFromNav) {
            ownCheck = true;
        } else if (isAuthenticated && loggedInUser && data) {
            ownCheck = loggedInUser._id === data._id;
        }
        setIsOwnProfileState(ownCheck);
        setActiveTab('about');
        logger.info(`[UserProfile] isOwnProfileState set to: ${ownCheck}`);

      } catch (err) {
        logger.error(`[UserProfile] Fetch failed for ID ${profileIdToFetch}:`, err.message, err.response?.data);
        // This error handling is correct, but likely bypassed by a global interceptor on 401 errors.
        let errorMessage = t('userprofile:errorFetchProfile');
        if (err.response?.status === 401) errorMessage = t('common:authenticationRequired');
        else if (err.response?.status === 403) errorMessage = t('common:authorizationError');
        else if (err.response?.status === 404) errorMessage = t('userprofile:errorProfileNotFound');
        else if (err.response?.data?.message || err.response?.data?.msg) {
          errorMessage = err.response.data.message || err.response.data.msg;
        }
        setError(errorMessage);
        
        if (err.response?.status !== 401 && err.response?.status !== 403 && err.response?.status !== 404) {
             toast.error(t('userprofile:errorFetchProfile'));
        }
      } finally {
        setComponentLoading(false);
      }
    };
    
    fetchUserProfileData();
    // Simplified the dependency array to the core values that should trigger a refetch.
  }, [loggedInUser?._id, isAuthenticated, authLoading, t, propIsOwnProfileFromNav, propUserId, paramId]);

  const handleProfileUpdate = (updatedProfile) => {
    setProfile(prevProfile => ({ ...prevProfile, ...updatedProfile }));
    logger.info('[UserProfile] Profile state updated.');
  };

  if (authLoading || (componentLoading && !profile && !error)) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 p-4 bg-red-100 border border-red-400 rounded-lg max-w-2xl mx-auto my-8">
        <h3 className="font-bold text-lg mb-2">{t('common:error')}</h3>
        <p>{error}</p>
      </div>
    );
  }
  
  if (!profile) {
    return (
      <div className="text-center p-4 text-gray-500">{t('userprofile:errorProfileNotFound')}</div>
    );
  }

  return (
    <div className="user-profile max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <UserProfileHeader 
        profile={profile} 
        onProfileUpdate={handleProfileUpdate} 
        isOwnProfile={isOwnProfileState} 
      />
      
      <div className="mt-6">
        <UserProfileTabs 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          isOwnProfile={isOwnProfileState} 
        />
      </div>

      <div className="mt-8">
        {activeTab === 'about' && (
          <UserProfileAbout 
            profile={profile} 
            isOwnProfile={isOwnProfileState} 
            onProfileUpdate={handleProfileUpdate} 
          />
        )}
        {activeTab === 'connections' && profile?._id && <ConnectionsTab userId={profile._id} />}
        {activeTab === 'settings' && isOwnProfileState && (
          <UserProfileSettings 
            profile={profile}
            onProfileUpdate={handleProfileUpdate} 
          />
        )}
      </div>
    </div>
  );
};

export default UserProfile;