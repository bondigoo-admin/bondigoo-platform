import React, { useContext, Suspense, useEffect, useState } from 'react';
import { Link, Routes, Route, Navigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthContext, useAuth, AuthProvider } from './contexts/AuthContext';
import { NotificationSocketProvider } from './contexts/SocketContext';
import { useNotifications } from './hooks/useNotifications';
import { Button } from './components/ui/button.tsx';
import { Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import io from 'socket.io-client'; 
import axios from 'axios'; 
import './utils/setupToastThrottling';
import i18n from './i18n';
import Header from './components/Header';
import { PaymentProvider, stripePromise } from './contexts/PaymentContext';
import { useQuery } from 'react-query';
import { getSessionDetails } from './services/sessionAPI';
import { logger } from './utils/logger';
import { useQueryClient } from 'react-query';
import { useGlobalSocketListener } from './hooks/useGlobalSocketListener';
import { Elements } from '@stripe/react-stripe-js';
import { LiveSessionProvider, useLiveSession } from './contexts/LiveSessionContext';    
import LiveSessionRequestModal from './components/LiveSessionRequestModal';
import { useSearchStore } from './hooks/useSearchStore';
import GlobalAnnouncementBanner from './components/GlobalAnnouncementBanner';
import AppealModal from './components/shared/AppealModal';
import SubFooter from './components/layouts/SubFooter'; 
import PublicLayout from './components/layouts/PublicLayout';
import FeedbackWidget from './components/shared/FeedbackWidget';

const Home = React.lazy(() => import('./components/Home'));
const HowItWorks = React.lazy(() => import('./components/HowItWorks'));
const CoachList = React.lazy(() => import('./components/CoachList'));
const UserDashboard = React.lazy(() => import('./components/UserDashboard'));
const CoachDashboard = React.lazy(() => import('./components/CoachDashboard'));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const DisputeDetailView = React.lazy(() => import('./components/admin/financials/DisputeDetailView'));
const UserProfile = React.lazy(() => import('./components/UserProfile'));
const CoachProfile = React.lazy(() => import('./components/CoachProfile'));
const MessagingCenter = React.lazy(() => import('./components/messaging/MessagingCenter'));
const AnalyticsDashboard = React.lazy(() => import('./components/AnalyticsDashboard'));
const NotificationCenter = React.lazy(() => import('./components/NotificationCenter'));
const NotificationPreferences = React.lazy(() => import('./components/NotificationPreferences'));
const ResourceCenter = React.lazy(() => import('./components/ResourceCenter'));
const AddResource = React.lazy(() => import('./components/AddResource'));
const ReferralSystem = React.lazy(() => import('./components/ReferralSystem'));
const Login = React.lazy(() => import('./components/Login'));
const ProgressTracker = React.lazy(() => import('./components/ProgressTracker'));
const VideoConference = React.lazy(() => import('./components/VideoConference'));
const Forum = React.lazy(() => import('./components/Forum'));
const TopicDetail = React.lazy(() => import('./components/TopicDetail'));
const ClientSignup = React.lazy(() => import('./components/ClientSignup'));
const CoachSignup = React.lazy(() => import('./components/CoachSignup'));
const SignupSelection = React.lazy(() => import('./components/SignupSelection'));
const CoachOnboardingStudio = React.lazy(() => import('./components/onboarding/coach/CoachOnboardingStudio'));
const EmailVerificationPage = React.lazy(() => import('./components/EmailVerificationPage'));
const ForgotPasswordPage = React.lazy(() => import('./components/ForgotPasswordPage'));
const ResetPasswordPage = React.lazy(() => import('./components/ResetPasswordPage'));
const ManageSessions = React.lazy(() => import('./components/ManageSessions'));
const ClientOnboardingPage = React.lazy(() => import('./components/onboarding/client/ClientOnboardingPage'));
const UpcomingSessions = React.lazy(() => import('./components/UpcomingSessions'));
const BookingCalendar = React.lazy(() => import('./components/BookingCalendar'));
const ConnectionsPage = React.lazy(() => import('./components/ConnectionsPage'));
const SettingsPage = React.lazy(() => import('./components/SettingsPage'));
const BillingPage = React.lazy(() => import('./components/BillingPage'));
const VideoConferenceWrapper = React.lazy(() => import('./components/VideoConferenceWrapper'));
const PlaybackViewer = React.lazy(() => import('./components/PlaybackViewer'));
const ProgramsPage = React.lazy(() => import('./components/programs/ProgramsPage'));
const ProgramLandingPage = React.lazy(() => import('./components/programs/ProgramLandingPage'));
const ProgramPlayer = React.lazy(() => import('./components/player/ProgramPlayer'));
const LiveSessionInterface = React.lazy(() => import('./components/LiveSessionInterface'));
const ProgramStudentsPage = React.lazy(() => import('./components/programs/ProgramStudentsPage'));
const ProgramQAPage = React.lazy(() => import('./components/programs/ProgramQAPage'));
const ProgramSubmissionsPage = React.lazy(() => import('./components/programs/ProgramSubmissionsPage'));
const CoachProgramsPage = React.lazy(() => import('./components/CoachProgramsPage'));
const CommunityGuidelinesPage = React.lazy(() => import('./components/CommunityGuidelinesPage'));
const TermsOfServicePage = React.lazy(() => import('./components/TermsOfServicePage'));
const PrivacyPolicyPage = React.lazy(() => import('./components/PrivacyPolicyPage'));
const CoachApplicationPage = React.lazy(() => import('./components/CoachApplicationPage'));
const ProtectedRoute = React.lazy(() => import('./components/ProtectedRoute'));

const DashboardRouter = () => {
  const { userRole } = useContext(AuthContext);

  switch(userRole) {
    case 'admin':
       return <Navigate to="/admin/overview" replace />;
    case 'coach':
      return <CoachDashboard />;
    case 'user':
    default:
      return <UserDashboard />;
  }
};

const OwnProfileRouter = () => {
  const { user, userRole } = useAuth();

  if (!user?._id) return <Navigate to="/login" replace />;

  switch(userRole) {
    case 'coach':
      return <CoachProfile userId={user._id} isOwnProfile={true} />;
    case 'user':
    default:
      return <UserProfile userId={user._id} isOwnProfile={true} />;
  }
};

const CalendarView = () => {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation(['common']);
  
  if (isLoading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">{t('common:loading')}</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <BookingCalendar
        userId={user.id}
        coachName={`${user.firstName} ${user.lastName}`}
        coachSettings={{
          privacySettings: {
            calendarVisibility: 'private'
          }
        }}
        viewMode="user"
        isUserCalendar={true}
        onBookingConfirmed={() => {
          console.log('[MyCalendar] Booking action - no-op in user view');
        }}
      />
    </div>
  );
};

const ImpersonationBanner = () => {
  const { user, logout } = useAuth(); // We need the real logout function now
  const { t } = useTranslation(['admin', 'common']);

  if (!user?.impersonating) {
    return null;
  }

  const handleStopImpersonating = () => {
    // When stopping, we just need to log out. The AuthContext's checkAuthStatus
    // will run again on page load and restore the original admin's session
    // from the cookie (which was never deleted).
    logout(); 
    // Redirect to admin dashboard to avoid confusion.
    window.location.href = '/admin/users';
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center w-full bg-yellow-400 dark:bg-yellow-600 text-black dark:text-white px-4 py-2 text-sm">
      <div className="flex items-center gap-4">
        <p>
          <span className="font-bold">{t('impersonation.bannerTitle', 'IMPERSONATING:')}</span> {user.firstName} {user.lastName} ({user.email}).
          <span className="hidden md:inline"> {t('impersonation.bannerAdmin', 'Admin:')} {user.impersonatorEmail}.</span>
        </p>
        <Button variant="destructive" size="sm" onClick={handleStopImpersonating}>
          <X className="h-4 w-4 mr-2" />
          {t('impersonation.stop', 'Stop Impersonating')}
        </Button>
      </div>
    </div>
  );
};

const AppContent = () => {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation('common');
  const { incomingRequests, acceptLiveSession, declineLiveSession, clearIncomingRequests } = useLiveSession();
  const queryClient = useQueryClient();
  const { toggle: toggleSearch } = useSearchStore(); 
  const [searchParams, setSearchParams] = useSearchParams();

  const isAppealModalOpen = searchParams.get('modal') === 'appeal' && searchParams.get('auditId');
  const appealAuditId = searchParams.get('auditId');

   const handleCloseAppealModal = () => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.delete('modal');
    newSearchParams.delete('auditId');
    setSearchParams(newSearchParams, { replace: true });
  };

  useGlobalSocketListener();

    useEffect(() => {
    const isGlobalSearchEnabled = process.env.REACT_APP_FEATURE_GLOBAL_SEARCH === 'true';
    if (!isGlobalSearchEnabled) return;

    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSearch();
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [toggleSearch]);

  logger.debug('[AppContent] Rendering with live session state.', {
    incomingRequestCount: incomingRequests.length,
    incomingRequestsData: incomingRequests,
  });

  useEffect(() => {
    logger.info('[AppContent] Initializing application', {
      environment: process.env.NODE_ENV,
      apiUrl: process.env.REACT_APP_API_URL,
      userId: user?.id || null,
      timestamp: new Date().toISOString(),
    });
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const isLaunched = process.env.REACT_APP_LAUNCHED === 'true';

  return (
    <div className="flex flex-col h-screen bg-gradient-subtle">
      <GlobalAnnouncementBanner />
       <ImpersonationBanner />
      <Header />
      <main className="flex-1 overflow-y-auto relative">
        <LiveSessionRequestModal
          isOpen={incomingRequests.length > 0}
          requests={incomingRequests}
          onAccept={(sessionId) => acceptLiveSession(sessionId)}
          onDecline={(sessionId, message) => declineLiveSession(sessionId, message)}
          onClose={clearIncomingRequests}
        />
        <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
          <Routes>
            {isLaunched ? (
              <>
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<Home />} />
                   <Route path="/apply-coach" element={<CoachApplicationPage />} />
                  <Route path="/how-it-works" element={<HowItWorks />} /> 
                  <Route path="/community-guidelines" element={<CommunityGuidelinesPage />} />
                  <Route path="/terms-of-service" element={<TermsOfServicePage />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                  <Route path="/coaches" element={<CoachList />} />
                  <Route path="/programs" element={<ProgramsPage />} />
                </Route>
                <Route path="/signup" element={<SignupSelection />} />
                <Route path="/coach/:id" element={<CoachProfile />} />
                <Route path="/programs/:programId" element={<ProgramLandingPage />} />
                <Route path="/client-signup" element={<ClientSignup />} />
                <Route path="/coach-signup" element={<CoachSignup />} />
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
                <Route path="/verify-email-change/:token" element={<EmailVerificationPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/onboarding/client" element={<ClientOnboardingPage />} />
                  <Route path="/admin/*" element={<AdminDashboard />} />
                  <Route path="/admin/financials/disputes/:ticketId" element={<DisputeDetailView />} />
                  <Route path="/dashboard" element={<DashboardRouter />} />
                  <Route path="/profile" element={<OwnProfileRouter />} />
                  <Route path="/profile/:id" element={<UserProfile />} />
                  <Route path="/notifications" element={<NotificationCenter />} />
                  <Route path="/settings/notification-preferences" element={<NotificationPreferences />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/billing" element={<BillingPage />} />
                  <Route path="/resources" element={<ResourceCenter />} />
                  <Route path="/add-resource" element={<AddResource />} />
                  <Route path="/video-test" element={<VideoConference isTestMode={true} />} />
                  <Route
                    path="/video-conference/:roomId"
                    element={<VideoConferenceWrapper />}
                  />
                  <Route
                    path="/session/:roomId/:token"
                    element={<VideoConferenceWrapper />}
                  />
                  <Route path="/live-session/:linkId/:token" element={<LiveSessionInterface />} />
                  <Route path="/messages" element={<MessagingCenter />} />
                  <Route path="/messages/:conversationId" element={<MessagingCenter />} /> 
                  <Route path="/analytics" element={<AnalyticsDashboard />} />
                  <Route path="/progress/:userId" element={<ProgressTracker />} />
                  <Route path="/referral" element={<ReferralSystem />} />
                  <Route path="/manage-sessions/:userId" element={<ManageSessions />} />
                  <Route path="/upcoming-sessions" element={<UpcomingSessions />} />
                  <Route path="/connections" element={<ConnectionsPage />} />
                  <Route path="/my-calendar" element={<CalendarView />} />
                  <Route 
                    path="/settings/connect/complete" 
                    element={<Navigate to="/settings" replace state={{ connectSuccess: true }} />} 
                  />
                  <Route 
                    path="/settings/connect/refresh" 
                    element={<Navigate to="/settings" replace state={{ connectRefresh: true }} />} 
                  />
                  <Route path="/coach-dashboard" element={<CoachDashboard />} />
                  <Route path="/coach/programs" element={<CoachProgramsPage />} />
                  <Route 
                    path="/coach-profile/:id" 
                    element={
                      <CoachProfile 
                        onRender={(props) => console.log('[App] Rendering CoachProfile with props:', props)}
                      />
                    } 
                  />
                  <Route path="/coach-profile/:id/setup" element={<CoachOnboardingStudio />} />
                  <Route path="/coach-availability/:userId" element={<ManageSessions />} />
                  <Route path="/playback/:bookingId/:recordingId" element={<PlaybackViewer />} />
                  <Route path="/programs/:programId/submissions" element={<ProgramSubmissionsPage />} />
                  <Route path="/learn/program/:programId" element={<ProgramPlayer />} />
                  <Route path="/programs/:programId/students" element={<ProgramStudentsPage />} />
                  <Route path="/programs/:programId/qa" element={<ProgramQAPage />} />
                </Route>
                <Route path="/forum" element={<Forum />} />
                <Route path="/forum/topic/:topicId" element={<TopicDetail />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            ) : (
              <>
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/how-it-works" element={<HowItWorks />} /> 
                  <Route path="/community-guidelines" element={<CommunityGuidelinesPage />} />
                  <Route path="/terms-of-service" element={<TermsOfServicePage />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                   <Route path="/apply-coach" element={<CoachApplicationPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </>
            )}
          </Routes>
        </Suspense>
     {isAppealModalOpen && (
            <AppealModal
            isOpen={searchParams.get('modal') === 'appeal' && !!searchParams.get('auditId')}
            onClose={handleCloseAppealModal}
            auditId={searchParams.get('auditId')}
        />
        )}
      </main>
       <FeedbackWidget />
      <Toaster
        position="top-center"
        containerStyle={{
          top: '80px',
        }}
        toastOptions={{
          duration: 5000,
          style: {
            background: '#ffffff',
            color: '#333333',
            padding: '16px',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            minWidth: '300px',
            maxWidth: '500px',
          },
        }}
      />
    </div>
  );
};

const AppWithSocketProvider = () => {
  const { user, token } = useAuth();
  const userId = user?._id || user?.id;

  useEffect(() => {
    logger.info('[AppWithSocketProvider] Dependencies for socket provider changed.', {
      hasUser: !!user,
      userId,
      hasToken: !!token,
    });
  }, [user, userId, token]);

  return (
    <NotificationSocketProvider userId={userId} token={token}>
      <LiveSessionProvider>
        <AppContent />
      </LiveSessionProvider>
    </NotificationSocketProvider>
  );
};

function App() {
    useEffect(() => {
    logger.info('[App.js MOUNT] Top-level <Elements> provider is mounting. This should happen only once on app load.');
  }, []);
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Elements stripe={stripePromise}>
        <PaymentProvider>
          <AuthProvider>
            <AppWithSocketProviderWrapper />
          </AuthProvider>
        </PaymentProvider>
      </Elements>
    </Suspense>
  );
}

const AppWithSocketProviderWrapper = () => {
  const { isLoading, user } = useAuth();

  if (isLoading && !user) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return <AppWithSocketProvider />;
};

export default App;