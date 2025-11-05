import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext'; 
import * as coachAPI from '../services/coachAPI';
import { toast } from 'react-hot-toast';
import ConnectionsTab from './ConnectionsTab';
import { requestConnection, getConnectionStatus } from '../services/connectionAPI';
import { getCoachReviews } from '../services/ReviewAPI';
import { getPriceConfiguration } from '../services/priceAPI';
import { getSessionTypes as fetchAllSessionTypes } from '../services/adminAPI';
import { logger } from '../utils/logger';
import ProfileHeader from './ProfileHeader';
import ProfileTabs from './ProfileTabs';
import AboutTab from './AboutTab';
import AvailabilityTab from './AvailabilityTab';
import PackagesTab from './PackagesTab';
import ReviewsTab from './ReviewsTab';
import LiveSessionWaitingRoom from './LiveSessionWaitingRoom';
import LoadingSpinner from './LoadingSpinner';
import PoliciesTab from './PoliciesTab';
import ProgramsTab from './ProgramsTab';
import ProgramCreator from './programs/ProgramCreator';
import CoachProgramsTab from './CoachProgramsTab';
import { useNotificationSocket } from '../contexts/SocketContext';
import { useLiveSession } from '../contexts/LiveSessionContext';
import SettingsPage from './SettingsPage';
import ServicesAndPricingTab from './ServicesAndPricingTab';
import { Button } from './ui/button.tsx';
import { ArrowRight, Megaphone } from 'lucide-react';

const CoachProfile = ({ userId: propUserIdForOwnProfile, isOwnProfile: propIsOwnProfileFlag }) => {
  const { t } = useTranslation(['common', 'coachprofile', 'liveSession']);
  const { id: paramIdFromUrl } = useParams();
  const { user: loggedInUser, isAuthenticated, loading: authLoading } = useAuth(); 
  const { isConnected } = useNotificationSocket();
  const { requestLiveSession, outgoingRequestStatus, sessionId, sessionInfo, cancelLiveSessionRequest, resetOutgoingRequest } = useLiveSession();
  
  const [coach, setCoach] = useState(null);
  const [componentIsLoading, setComponentIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCoach, setEditedCoach] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'about');
  const [isLiveSessionWaitingRoomOpen, setIsLiveSessionWaitingRoomOpen] = useState(false);
  const [showPictureUpload, setShowPictureUpload] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');

  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [programToEdit, setProgramToEdit] = useState(null);

  const isPreviewing = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('preview') === 'true';
}, [location.search]);

const { data: allSessionTypes, isLoading: isLoadingSessionTypes } = useQuery(
      'sessionTypes', 
      fetchAllSessionTypes,
      { onSuccess: (data) => {
          // LOG 1: SHOWS THE RAW DATA FROM THE API TO CONFIRM ITS STRUCTURE
          logger.info('[CoachProfile] LOG 1: Fetched allSessionTypes successfully. Data structure:', data);
      }}
  );

  const sessionTypeMap = useMemo(() => {
    if (!allSessionTypes) return new Map();
    
    // THIS IS THE CORRECT WAY TO BUILD THE MAP, USING THE SIMPLE 'id' FIELD.
    const map = new Map(allSessionTypes.map(type => [type.id, type.name]));

    // LOG 2: SHOWS THE CONSTRUCTED MAP TO VERIFY KEYS ARE SIMPLE STRINGS
    logger.info('[CoachProfile] LOG 2: Constructed sessionTypeMap.', Array.from(map.entries()));
    return map;
  }, [allSessionTypes]);

  const getTranslatedSessionTypeName = useCallback((typeId) => {
    // LOG 3: SHOWS THE ID BEING PASSED IN FOR TRANSLATION
    logger.info(`[CoachProfile] LOG 3: getTranslatedSessionTypeName called with typeId: ${typeId}`);
    
    const rawName = sessionTypeMap.get(typeId);
    
    if (!rawName) {
        // LOG 4 (ERROR CASE): SHOWS WHEN A LOOKUP FAILS
        logger.warn(`[CoachProfile] LOG 4: FAILED to find session type name for ID: ${typeId}. Falling back to 'Standard Session'.`);
        return t('coachprofile:standardSession', 'Standard Session');
    }

    const translationKey = `sessionTypes.${rawName}`;
    const translatedName = t(translationKey, rawName);
    
    // LOG 5: SHOWS THE SUCCESSFUL TRANSLATION
    logger.info(`[CoachProfile] LOG 5: Translated '${rawName}' (key: ${translationKey}) to '${translatedName}'.`);
    return translatedName;
  }, [sessionTypeMap, t]);
  
  const getProfileIdToFetch = () => {
    if (propIsOwnProfileFlag && propUserIdForOwnProfile) {
        return propUserIdForOwnProfile;
    }
    if (paramIdFromUrl) {
        return paramIdFromUrl;
    }
    if (loggedInUser?.role === 'coach' && loggedInUser?.coachId && !propIsOwnProfileFlag && !paramIdFromUrl) {
        return loggedInUser.coachId;
    }
    if(loggedInUser?.role === 'coach' && loggedInUser?._id && !propIsOwnProfileFlag && !paramIdFromUrl) {
        return loggedInUser._id;
    }
    return null;
  };
  const profileIdForDataFetch = getProfileIdToFetch();

  useEffect(() => {
    logger.info(`[CoachProfile] Effect. ProfileID to fetch: ${profileIdForDataFetch}, AuthLoading: ${authLoading}, IsAuthenticated: ${isAuthenticated}`);
    
    if (authLoading) {
      logger.info('[CoachProfile] AuthContext is loading. Waiting...');
      setComponentIsLoading(true);
      return;
    }

    const fetchCoachProfile = async () => {
      if (!profileIdForDataFetch) {
        if (!isAuthenticated && !paramIdFromUrl) {
            logger.warn('[CoachProfile] Not authenticated and no ID specified for public profile view.');
            setError(t('common:authenticationRequired'));
            setComponentIsLoading(false);
            return;
        }
        logger.error('[CoachProfile] Coach ID is missing for profile fetch.');
        setError(t('coachprofile:errorInvalidId'));
        setComponentIsLoading(false);
        return;
      }
  
      try {
        setComponentIsLoading(true);
        setError(null);

        logger.info(`[CoachProfile] Fetching profile for user ID: ${profileIdForDataFetch}`);
        const data = await coachAPI.getCoachProfile(profileIdForDataFetch);

        try {
          const reviewData = await getCoachReviews(profileIdForDataFetch);
          if (reviewData.success) {
            data.reviews = reviewData.reviews;
            data.rating = reviewData.averageRating;
          }
        } catch (reviewError) {
          logger.error('[CoachProfile] Failed to fetch initial reviews, they will be loaded in the tab.', reviewError);
        }

       try {
          const priceConfig = await getPriceConfiguration(profileIdForDataFetch);
          if (priceConfig) { // Check if priceConfig exists
            if (priceConfig.liveSessionRate) {
              data.liveSessionRate = priceConfig.liveSessionRate;
              logger.info(`[CoachProfile] Successfully attached liveSessionRate for user ${profileIdForDataFetch}`, priceConfig.liveSessionRate);
            }
            if (priceConfig.baseRate) {
              data.baseRate = priceConfig.baseRate;
              logger.info(`[CoachProfile] Successfully attached baseRate for user ${profileIdForDataFetch}`, priceConfig.baseRate);
            }
          }
        } catch (priceError) {
          logger.warn(`[CoachProfile] Could not fetch price configuration for user ${profileIdForDataFetch}.`, priceError);
        }

        // DIAGNOSTIC LOG 6: Log the data immediately after fetching and before setting state.
        logger.debug('[DIAGNOSTIC] CoachProfile: Data received from API', { 
            apiData: data ? { ...data, user: data.user ? { ...data.user } : null } : null
        });

        setCoach(data);
        setEditedCoach(data);
        
        if (isAuthenticated && loggedInUser && data && data.user) {
            const ownProfileCheck = loggedInUser._id === data.user._id;
            setIsOwnProfile(ownProfileCheck);
            logger.info(`[CoachProfile] isOwnProfile determined: ${ownProfileCheck}`);
        } else {
            setIsOwnProfile(false);
            logger.info(`[CoachProfile] isOwnProfile set to false (conditions not met).`);
        }

      } catch (err) {
        logger.error('[CoachProfile] Failed to fetch coach profile:', err.message, err.response?.data);
        const errorMessage = err.response?.data?.message || err.message || t('coachprofile:errorFetchProfile');
        setError(errorMessage);
        if (err.response?.status !== 401 && err.response?.status !== 403 && err.response?.status !== 404 ) {
            toast.error(t('coachprofile:errorFetchProfile'));
        }
        if (err.response?.status === 404) {
          logger.info('[CoachProfile] Navigating to /not-found due to 404.');
          navigate('/not-found', {replace: true}); 
        }
      } finally {
        setComponentIsLoading(false);
      }
    };
  
    fetchCoachProfile();

  }, [profileIdForDataFetch, isAuthenticated, authLoading, loggedInUser, t, navigate]);

    useEffect(() => {
    if (outgoingRequestStatus === 'pending' || outgoingRequestStatus === 'accepted') {
        setIsLiveSessionWaitingRoomOpen(true);
    } 
    else if (outgoingRequestStatus === 'declined' || outgoingRequestStatus === 'cancelled') {
        const toastMessage = sessionInfo?.declineMessage || t(`liveSession:request${outgoingRequestStatus.charAt(0).toUpperCase() + outgoingRequestStatus.slice(1)}`);
       
        
        const timer = setTimeout(() => {
            setIsLiveSessionWaitingRoomOpen(false);
            resetOutgoingRequest();
        }, 3000);
        
        return () => clearTimeout(timer);
    }
  }, [outgoingRequestStatus, sessionInfo, t, resetOutgoingRequest]);

const handleLiveSessionRequest = async (payload) => {
    // DIAGNOSTIC LOG 7: Log the payload and state of `coach` when the handler is called.
    logger.debug('[DIAGNOSTIC] handleLiveSessionRequest: ENTERED', {
        receivedPayload: payload,
        coachState: coach ? { ...coach, user: coach.user ? { ...coach.user } : null } : null,
        isConnected
    });

    if (!isConnected) {
      toast.error(t('liveSession:error.notConnected'));
      return;
    }

    // DIAGNOSTIC LOG 8: Log the values used in the pre-condition check.
    logger.debug('[DIAGNOSTIC] handleLiveSessionRequest: PRE-CONDITION CHECK', {
        'coach.user._id': coach?.user?._id,
        'coach.user.status': coach?.user?.status
    });

    if (!coach?.user?._id || coach.user.status !== 'online') {
      logger.warn('[CoachProfile] Live session request blocked.', { 
          coachDataValid: !!coach?.user?._id, 
          coachStatus: coach?.user?.status 
      });
      toast.error(t('liveSession:coachNotAvailable'));
      return;
    }

    try {
      logger.info('[CoachProfile] Initiating live session request via useLiveSession hook.', { payload });
      await requestLiveSession(payload);
      setIsLiveSessionWaitingRoomOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to request live session.');
      logger.error('[CoachProfile] Failed to request live session', error);
    }
  };


const handleCloseWaitingRoom = useCallback(() => {
    logger.info('[CoachProfile] handleCloseWaitingRoom called. Resetting live session state.');
    setIsLiveSessionWaitingRoomOpen(false);
    resetOutgoingRequest();
  }, [resetOutgoingRequest]);

  const handleEditProgram = (program) => {
    setProgramToEdit(program);
    setIsCreatorOpen(true);
  };

const handleCancelLiveRequest = useCallback(async () => {
    logger.info('[CoachProfile] Cancelling live session request. Calling cancel API and then closing/resetting.');
    try {
      await cancelLiveSessionRequest();
    } catch (error) {
      logger.error('[CoachProfile] Error while calling cancelLiveSessionRequest API', error);
      toast.error(t('liveSession:error.cancelFailed'));
    } finally {
      handleCloseWaitingRoom();
    }
  }, [cancelLiveSessionRequest, handleCloseWaitingRoom, t]);

  const handleReviewsUpdate = (updatedReviews, updatedAverageRating) => {
       logger.info('[CoachProfile] handleReviewsUpdate called with:', { updatedReviews, updatedAverageRating });
    setCoach(prev => (prev ? { ...prev, reviews: updatedReviews, rating: updatedAverageRating } : null));
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedCoach(coach ? {...coach} : null);
  };
 
  const handleSave = async () => {
    if (!editedCoach || !coach?.user?._id) return;
    try {
      const updatedCoachData = await coachAPI.updateCoachProfile(coach.user._id, editedCoach);
      setCoach(updatedCoachData);
      setIsEditing(false);
      toast.success(t('coachprofile:messageProfileUpdated'));
    } catch (err) {
      toast.error(t('coachprofile:errorUpdateProfile'));
    }
  };

  const handleCancel = () => {
    setEditedCoach(coach ? {...coach} : null);
    setIsEditing(false);
  };

  const handleInputChange = (field, value) => {
    setEditedCoach(prev => (prev ? { ...prev, [field]: value } : null));
  };
  
  const handleItemsUpdate = (listType, updatedItems) => {
    const newCoachState = { ...coach, [listType]: updatedItems };
    setCoach(newCoachState);
    setEditedCoach(prev => ({ ...prev, [listType]: updatedItems }));
    logger.info(`[CoachProfile] Optimistically updated ${listType}`, updatedItems);
  };

const handleVideoUpdate = (updatedCoachProfile) => {
    if(!coach?.user?._id) return;
    
    logger.info('[CoachProfile|handleVideoUpdate] Received updated full coach profile from child component:', updatedCoachProfile);

    setCoach(prevCoach => {
      logger.info('[CoachProfile|handleVideoUpdate] Updating state. Previous coach specialties:', prevCoach.specialties?.length);
      const newCoachState = updatedCoachProfile;
      logger.info('[CoachProfile|handleVideoUpdate] Setting new state. New coach specialties:', newCoachState.specialties?.length, 'New coach object keys:', Object.keys(newCoachState));
      return newCoachState;
    });

    setEditedCoach(updatedCoachProfile);
    //toast.success(t('coachprofile:videoUpdatedSuccess'));
  };

    const connectMutation = useMutation((targetCoachId) => requestConnection(targetCoachId, connectionMessage), {
    onSuccess: () => {
      logger.info('[CoachProfile] Connection request sent successfully');
      queryClient.invalidateQueries(['connectionStatus', paramIdFromUrl]);
      //toast.success(t('coachprofile:connectionRequestSent'));
      setConnectionMessage('');
    },
    onError: (error) => {
      logger.error('[CoachProfile] Error sending connection request:', error);
      toast.error(t('coachprofile:errorSendingRequest'));
    },
  });
  
  const handleConnect = () => {
    if (!loggedInUser) {
      toast.error(t('coachprofile:loginRequired'));
      navigate('/login', { state: { from: location }});
      return;
    }
    if (paramIdFromUrl) {
        connectMutation.mutate(paramIdFromUrl);
    } else {
        logger.error("[CoachProfile] handleConnect: 'paramIdFromUrl' (id from useParams) is undefined.");
    }
  };

    const handleEditPricing = () => {
    setActiveTab('settings');
    navigate(`${location.pathname}?settings_tab=pricing`, { replace: true });
  };

  const handleEditInsurance = () => {
    setActiveTab('settings');
    navigate(`${location.pathname}?settings_tab=coach`, { replace: true });
  };

const handleProfileUpdate = (updatedData) => {
    logger.info('[DEBUG-FRONTEND] 2. handleProfileUpdate called with updatedData:', updatedData);

    const updateState = (prevState) => {
      // The incoming data from the API is the source of truth.
      // We only keep properties from the old state if they don't exist in the new data.
      // This correctly handles deletions (e.g., profilePicture will be undefined in updatedData).
      const newCoachState = {
        ...prevState,
        ...updatedData,
      };

      // Specifically handle the 'user' sub-object with a safe merge
      if (updatedData.user) {
        newCoachState.user = {
          ...(prevState.user || {}),
          ...updatedData.user,
        };
      }
      
      // Ensure profilePicture is explicitly set from the new data, which will be
      // undefined if it was removed.
      newCoachState.profilePicture = updatedData.profilePicture;

      logger.info('[DEBUG-FRONTEND] 4. State update complete. NEW profilePicture:', newCoachState.profilePicture);
      return newCoachState;
    };

    setCoach(updateState);
    setEditedCoach(updateState); // Apply the same logic to the edited state as well

    logger.info('[CoachProfile] Parent component state updated correctly.');
  };

  const queryClient = useQueryClient();

  const { data: connectionStatus, isLoading: statusLoading } = useQuery(
    ['connectionStatus', paramIdFromUrl],
    () => getConnectionStatus(paramIdFromUrl),
    {
      enabled: !!loggedInUser && !!paramIdFromUrl && !isOwnProfile,
      onError: (error) => logger.error('[CoachProfile] Error fetching connection status:', error),
    }
  );

  const canViewPricing = useMemo(() => {
    if (!coach?.settings) return false;
    if (isOwnProfile) return true;

    const privacySetting = coach.settings.privacySettings?.profilePrivacy?.pricing || 'everyone';

    switch (privacySetting) {
        case 'everyone':
            return true;
        case 'private':
            return false;
        case 'registered_users':
            return isAuthenticated;
        case 'connected_users':
            return connectionStatus?.status === 'accepted';
        default:
            return false;
    }
  }, [coach, isOwnProfile, isAuthenticated, connectionStatus]);

   if (authLoading || (componentIsLoading && !coach && !error) || !allSessionTypes) {
    return <div className="flex justify-center items-center h-screen"><LoadingSpinner /></div>;
  }
  if (error) {
    return <div className="text-center text-red-500 p-4 bg-red-100 border border-red-400 rounded">{error}</div>;
  }
  if (!coach) {
    return <div className="text-center p-4">{t('coachprofile:errorCoachNotFound')}</div>;
  }

  // DIAGNOSTIC LOG 9: Log the final `coach` state being passed to child components.
  logger.debug('[DIAGNOSTIC] CoachProfile: RENDERING with final state', {
      finalCoachState: coach ? { ...coach, user: coach.user ? { ...coach.user } : null } : null,
      outgoingRequestStatus
  });

const isShowingBanner = isPreviewing && isOwnProfile;

return (
    <div className={`max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${isShowingBanner ? 'pt-24' : ''}`}>
    {isShowingBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-sky-600 text-white shadow-lg">
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
                <div className="flex items-center gap-3">
                <Megaphone className="h-6 w-6 flex-shrink-0" />
                <p className="font-medium text-sm md:text-base">
                    {t('onboardingPreview.bannerText', "You're previewing your profile. Ready to go live?")}
                </p>
                </div>
                <Button 
                onClick={() => navigate(`/coach-profile/${paramIdFromUrl}/setup?step=final`)}
                className="bg-white text-sky-600 hover:bg-sky-100 hover:text-sky-700 group whitespace-nowrap"
                >
                <span className="hidden sm:inline">{t('onboardingPreview.bannerButton', 'Complete Activation')}</span>
                <span className="sm:hidden">{t('onboardingPreview.bannerButtonMobile', 'Finish Setup')}</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
            </div>
            </div>
        </div>
    )}
    <ProfileHeader 
        isOwnProfile={isOwnProfile}
        initialCoachData={coach}
        onBookSessionClick={() => setActiveTab('availability')}
        onProfileUpdate={handleProfileUpdate}
        onLiveSessionClick={handleLiveSessionRequest}
        connectionStatus={connectionStatus}
        isLoadingConnection={statusLoading} 
        onConnect={handleConnect}
        onConnectionMessageChange={setConnectionMessage}
        connectionMessage={connectionMessage}
        onTabChange={setActiveTab}
        canViewPricing={canViewPricing} 
        loggedInUserId={loggedInUser?._id} 
        targetUserId={coach?.user?._id} 
      />
      
      <ProfileTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOwnProfile={isOwnProfile}
        tabs={[
          { id: 'about', label: t('coachprofile:about') },
          { id: 'services_pricing', label: t('coachprofile:servicesAndPricing', 'Services & Pricing') },
          { id: 'availability', label: t('coachprofile:calendar') },
          { id: 'programs', label: t('coachprofile:programs') },
          { id: 'reviews', label: t('coachprofile:reviews') },
          { id: 'policies', label: t('coachprofile:policies') },
          ...(isOwnProfile ? [{ id: 'settings', label: t('coachprofile:settings') }] : []),
        ]}
      />

   <div className="mt-8">
        {activeTab === 'about' && (
          <AboutTab
            coach={isEditing ? editedCoach : coach}
            isEditing={isEditing}
            isOwnProfile={isOwnProfile}
            onInputChange={handleInputChange}
            onItemsUpdate={handleItemsUpdate}
            onSave={handleSave}
            onCancel={handleCancel}
            onVideoUpdate={handleVideoUpdate}
            onEditInsurance={handleEditInsurance}
          />
        )}
         {activeTab === 'services_pricing' && coach?.user?._id && (
            <ServicesAndPricingTab 
                coachId={coach.user._id} 
                coach={coach} 
                isOwnProfile={isOwnProfile}
                onTabChange={setActiveTab}
                onLiveSessionClick={handleLiveSessionRequest}
                getTranslatedSessionTypeName={getTranslatedSessionTypeName}
                canViewPricing={canViewPricing}
                onEditPricing={handleEditPricing}
            />
        )}
        {activeTab === 'availability' && coach?.user?._id && <AvailabilityTab 
            userId={coach.user._id} 
            isOwnProfile={isOwnProfile} 
            coachSettings={coach?.settings} 
            connectionStatus={connectionStatus?.status} 
            isLoadingConnection={statusLoading}
        />}
         {activeTab === 'packages' && coach?.user?._id && <PackagesTab userId={coach.user._id} />}
        {activeTab === 'programs' && coach?.user?._id && (
          isOwnProfile ? (
            <CoachProgramsTab
              coachId={coach.user._id}
              onEditProgram={handleEditProgram}
            />
          ) : (
            <ProgramsTab coachId={coach.user._id} />
          )
        )}
        {activeTab === 'reviews' && coach?.user?._id && (
          <ReviewsTab 
            userId={coach.user._id} 
            reviews={coach.reviews || []} 
            averageRating={coach.rating || 0}
            isOwnProfile={isOwnProfile}
            onReviewsUpdate={handleReviewsUpdate}
          />
        )}
        {activeTab === 'connections' && coach?.user?._id && <ConnectionsTab isCondensed={false} userId={coach.user._id} />}
        {activeTab === 'policies' && <PoliciesTab cancellationPolicy={coach?.settings?.cancellationPolicy} isOwnProfile={isOwnProfile} />}
        {activeTab === 'settings' && isOwnProfile && coach?.user?._id && <SettingsPage isEmbedded={true} />}
      </div>

        {coach && loggedInUser && 
       <LiveSessionWaitingRoom
            isOpen={isLiveSessionWaitingRoomOpen}
            onClose={handleCloseWaitingRoom}
            coach={coach}
            user={loggedInUser}
            sessionId={sessionId}
            onCancelRequest={handleCancelLiveRequest}
            status={outgoingRequestStatus}
            declineMessage={sessionInfo?.declineMessage}
            skipDeviceCheck={true}
        />
      }
    {isOwnProfile && (
        <ProgramCreator
          isOpen={isCreatorOpen}
          setIsOpen={setIsCreatorOpen}
          programToEdit={programToEdit}
        />
      )}
    </div>
  );
};
// Utility function to fix canvas tainting issue
const getCroppedImg = async (imageSrc, pixelCrop) => {
  const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous'; 
      img.addEventListener('load', () => resolve(img));
      img.addEventListener('error', (error) => reject(error));
      img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
          logger.error('Canvas is empty, could not create blob.');
          reject(new Error('Canvas is empty'));
          return;
      }
      const file = new File([blob], "profile_picture.jpg", { type: "image/jpeg" });
      resolve(file);
    }, 'image/jpeg');
  });
};

export default CoachProfile;