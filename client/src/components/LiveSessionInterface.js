import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Loader2, AlertCircle } from 'lucide-react';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card.tsx';
import * as liveSessionAPI from '../services/liveSessionAPI';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';
import { useNotificationSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import io from 'socket.io-client';
import ReviewModal from './ReviewModal';
import { useLiveSessionManager } from '../hooks/useLiveSessionManager';
import { usePayment } from '../contexts/PaymentContext';
import ScaConfirmationModal from './payment/ScaConfirmationModal';

import LiveSessionDeviceCheck from './live_session/LiveSessionDeviceCheck';
import LiveSessionCallUI from './live_session/LiveSessionCallUI';

const PaymentFailureWarning = ({ wrapUpTime }) => {
  const { t } = useTranslation('liveSession');
  const [timeLeft, setTimeLeft] = useState(wrapUpTime);

  useEffect(() => {
    if (wrapUpTime > 0) {
        setTimeLeft(wrapUpTime);
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }
  }, [wrapUpTime]);
  
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: "-100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "-100%", opacity: 0 }}
        className="fixed top-0 left-0 right-0 z-50 p-4 bg-yellow-400/90 text-yellow-900 text-center font-semibold backdrop-blur-sm shadow-lg"
      >
        {t('paymentFailedWarning', { time: formattedTime })}
      </motion.div>
    </AnimatePresence>
  );
};

const LiveSessionSummary = ({ session, isCoach, onBookFullSession, onReturnToDashboard, onLeaveReview, reviewSubmitted }) => {
    const { t } = useTranslation(['liveSession', 'common', 'review']);
    
    const finalDurationMinutes = Math.floor((session.durationInSeconds || 0) / 60);
    const finalDurationSeconds = (session.durationInSeconds || 0) % 60;
    const coachName = session.coach?.name || 'the coach';

    const formatCurrency = (amount, currency) => {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currency || 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount || 0);
    };

    const finalCostFormatted = formatCurrency(session.finalCost?.grossAmount, session.finalCost?.currency);

    const handleReviewClick = () => {
        const bookingId = session?.booking?._id || session?.booking;
        logger.info('[LiveSessionSummary] "Leave a Review" button clicked.', { hasBookingId: !!bookingId });
        if (!bookingId) {
            toast.error(t('common:errorMessages.missingBookingInfoForReview', "We can't find the booking information for this session, so a review can't be left at this time."));
            return;
        }
        onLeaveReview();
    };
    
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
            <AnimatePresence>
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, type: "spring" }}>
                    <Card className="w-full max-w-lg mx-4">
                        <CardHeader className="text-center">
                            <CardTitle className="text-2xl">{t('sessionEnded', 'Session Ended')}</CardTitle>
                            <CardDescription>{t('summaryOfYourSession', 'Here is a summary of your session.')}</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-6">
                            <div className="flex justify-around p-4 rounded-lg bg-muted">
                                <div className="text-center">
                                    <p className="text-sm text-muted-foreground">{t('finalDuration', 'Duration')}</p>
                                    <p className="text-2xl font-bold">{`${finalDurationMinutes}' ${finalDurationSeconds}''`}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-muted-foreground">{t('finalCost', 'Final Cost')}</p>
                                    <p className="text-2xl font-bold">{finalCostFormatted}</p>
                                </div>
                            </div>
                            {!isCoach && (
                                <Button 
                                    onClick={handleReviewClick} 
                                    variant="outline" 
                                    size="lg" 
                                    className="w-full"
                                    disabled={reviewSubmitted}
                                >
                                    <Star className="mr-2 h-4 w-4" /> 
                                    {reviewSubmitted ? t('review:reviewSubmitted', 'Review Submitted') : t('leaveAReview', 'Leave a Review')}
                                </Button>
                            )}
                        </CardContent>
                        <CardFooter className="flex-col gap-3">
                           {isCoach ? (
                                <Button onClick={onReturnToDashboard} className="w-full">{t('returnToDashboard', 'Return to Dashboard')}</Button>
                           ) : (
                                <>
                                    <Button onClick={onBookFullSession} className="w-full">{t('bookFullSession', { coachName })}</Button>
                                    <Button variant="link" onClick={onReturnToDashboard}>
                                        {t('returnToDashboard', 'Return to Dashboard')}
                                    </Button>
                                </>
                           )}
                        </CardFooter>
                    </Card>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

const StagingUI = ({ message }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-xl text-slate-300">{message}</p>
    </div>
);

const ErrorUI = ({ message, onReturn }) => {
    const { t } = useTranslation('common');
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 gap-4 p-8 text-center">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <p className="text-xl text-slate-300">{message}</p>
            <Button onClick={onReturn} variant="outline" className="mt-4">{t('returnToDashboard', 'Return to Dashboard')}</Button>
        </div>
    );
};

const LiveSessionInterface = () => {
    const { linkId, token } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation(['liveSession', 'common', 'review']);
    const { socket: notificationSocket, isConnected: isNotificationSocketConnected } = useNotificationSocket();
    const { user, loading: authLoading } = useAuth();
    
     const { reauthRequired, sessionWarning, submitReauthorizationResult, clearReauthRequired, resetOutgoingRequest } = useLiveSessionManager();
    const { stripePromise } = usePayment();

    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [reviewSubmitted, setReviewSubmitted] = useState(false);
    
    const [flowStatus, setFlowStatus] = useState('validating');
    const [errorMessage, setErrorMessage] = useState('');
    const [sessionData, setSessionData] = useState(null);
    const [mediaConfig, setMediaConfig] = useState(null);
    const [activeStream, setActiveStream] = useState(null);
    const [videoSocket, setVideoSocket] = useState(null);

    const handleEndSession = useCallback(async () => {
        if (activeStream) {
            activeStream.getTracks().forEach(track => track.stop());
        }
        
        if (sessionData?._id) {
            try {
                await liveSessionAPI.end(sessionData._id);
            } catch (error) {
                const errorMsg = error.response?.data?.message || 'Failed to end session.';
                toast.error(errorMsg);
            }
        }
    }, [sessionData, activeStream]);

    useEffect(() => {
        return () => {
            logger.info('[LiveSessionInterface] Unmounting. Resetting outgoing live session request state.');
            resetOutgoingRequest();
            if (activeStream) {
                logger.info(`[LiveSessionInterface] Stopping active stream on unmount.`);
                activeStream.getTracks().forEach(t => t.stop());
            }
        };
    }, [resetOutgoingRequest, activeStream]);

    useEffect(() => {
        logger.info('[LSI-EFFECT-VALIDATE] Component mounted. Validating link.', { linkId, hasToken: !!token });
        if (!linkId || !token) {
            setErrorMessage('Session link is missing required parameters.');
            setFlowStatus('error');
            return;
        }

        const validateLink = async () => {
            try {
                const validationResponse = await liveSessionAPI.validateSessionLink(linkId, token);
                logger.info('[LSI-EFFECT-VALIDATE] < RCVD successful validation.', { session: validationResponse.session });
                setSessionData(validationResponse.session);
                setFlowStatus('device_check');
            } catch (error) {
                const msg = error.response?.data?.message || 'Failed to validate session link.';
                setErrorMessage(msg);
                setFlowStatus('error');
            }
        };
        validateLink();
    }, [linkId, token]);

    useEffect(() => {
        if (!notificationSocket || !isNotificationSocketConnected || !sessionData || !user) return;

        const handleSessionEnded = (data) => {
            if (data.sessionId === sessionData._id) {
                setSessionData(prev => ({ ...prev, status: data.status, finalCost: data.finalCost, durationInSeconds: data.durationInSeconds }));
                setFlowStatus('completed');
            }
        };

        const handleStatusUpdate = (data) => {
            const update = data?.payload?.[0];
            if (!update || update.status !== 'offline') return;

            const offlineUserId = update.userId;
            const client_id = sessionData.client?._id || sessionData.client;
            const coach_id = sessionData.coach?._id || sessionData.coach;

            const isParticipant = offlineUserId === client_id || offlineUserId === coach_id;
            const isCurrentUser = offlineUserId === user._id;

            if (isParticipant && !isCurrentUser) {
                logger.warn(`[LSI] The other session participant (ID: ${offlineUserId}) went offline. Ending the session automatically.`);
                toast.info(t('participantDisconnected', 'The other participant has disconnected. Ending session.'));
                handleEndSession();
            }
        };

        notificationSocket.on('live_session_ended', handleSessionEnded);
        notificationSocket.on('user_status_update', handleStatusUpdate);

        return () => {
            notificationSocket.off('live_session_ended', handleSessionEnded);
            notificationSocket.off('user_status_update', handleStatusUpdate);
        };
    }, [notificationSocket, isNotificationSocketConnected, sessionData, user, handleEndSession, t]);

useEffect(() => {
        if (!mediaConfig || !user || (videoSocket && videoSocket.connected)) {
            return;
        }

        let isMounted = true;
        setFlowStatus('connecting');
        logger.info('[LSI-SOCKET-EFFECT] Effect triggered. Starting connection process.', { hasMediaConfig: !!mediaConfig, hasUser: !!user });

        const CONNECT_TIMEOUT = 15000;
        const MAX_ATTEMPTS = 3;
        const authToken = localStorage.getItem('token');

        if (!authToken || !user?._id) {
            setErrorMessage('Authentication error. Please log in again.');
            setFlowStatus('error');
            return;
        }

        let currentSocket;

        const connectSocket = (attempt) => {
            if (!isMounted || attempt > MAX_ATTEMPTS) {
                if (isMounted) {
                    logger.error(`[LSI-SOCKET-EFFECT] All ${MAX_ATTEMPTS} connection attempts failed.`);
                    setErrorMessage('Failed to connect to the video service. Please check your network.');
                    setFlowStatus('error');
                }
                return;
            }

            logger.info(`[LSI-SOCKET-EFFECT] Attempting to connect (Attempt ${attempt}/${MAX_ATTEMPTS}).`);
            
            currentSocket = io(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/video`, {
                query: { sessionId: linkId, token },
                auth: { token: authToken, userId: user._id },
                transports: ['websocket'],
                reconnection: false,
            });

            const watchdog = setTimeout(() => {
                logger.warn(`[LSI-SOCKET-EFFECT] Watchdog: Connection attempt ${attempt} timed out after ${CONNECT_TIMEOUT}ms.`);
                currentSocket.disconnect();
                if (isMounted) {
                    connectSocket(attempt + 1);
                }
            }, CONNECT_TIMEOUT);

            const cleanupListeners = () => {
                clearTimeout(watchdog);
                currentSocket.off('connect');
                currentSocket.off('connect_error');
            };

            currentSocket.on('connect', () => {
                cleanupListeners();
                if (isMounted) {
                    logger.info(`[LSI-SOCKET-EFFECT] Connection successful on attempt ${attempt}.`, { socketId: currentSocket.id });
                    setVideoSocket(currentSocket);
                    setFlowStatus('in_call');
                } else {
                    logger.warn('[LSI-SOCKET-EFFECT] Socket connected but component unmounted. Disconnecting.', { socketId: currentSocket.id });
                    currentSocket.disconnect();
                }
            });

            currentSocket.on('connect_error', (error) => {
                cleanupListeners();
                logger.warn(`[LSI-SOCKET-EFFECT] Connection attempt ${attempt} failed with error: ${error.message}.`);
                if (isMounted) {
                    setTimeout(() => connectSocket(attempt + 1), 2000);
                }
            });
        };
        
        connectSocket(1);

        return () => {
            isMounted = false;
            if (currentSocket) {
                logger.info(`[LSI-SOCKET-EFFECT] Cleanup: Disconnecting socket.`, { socketId: currentSocket.id });
                currentSocket.disconnect();
            }
        };
    }, [mediaConfig, user, linkId, token]);

     const handleDeviceCheckReady = useCallback((config) => {
        logger.info(`[LSI-HANDLER] Device check ready. Receiving stream and config.`);
        setTimeout(() => {
            setActiveStream(config.stream);
            setMediaConfig(config);
        }, 0);
    }, []);

    
    const handleReauthSuccess = useCallback(async (paymentIntentId) => {
        try {
            await submitReauthorizationResult({ success: true, paymentIntentId });
            toast.success("Payment method re-authorized successfully!");
        } catch (error) {
            toast.error("An error occurred after re-authorization.");
        } finally {
            clearReauthRequired();
        }
    }, [submitReauthorizationResult, clearReauthRequired]);

    const handleReauthFailure = useCallback(async (error, paymentIntentId) => {
        try {
            await submitReauthorizationResult({ success: false, paymentIntentId, error: error?.message });
        } catch (apiError) {
             toast.error("Failed to report re-authorization failure.");
        } finally {
            clearReauthRequired();
        }
    }, [submitReauthorizationResult, clearReauthRequired]);

    const handleReturnToDashboard = () => navigate('/dashboard');
    const handleBookFullSession = () => navigate(`/coach/${sessionData?.coach?._id || ''}`);

    const renderContent = () => {
        logger.info(`[LSI-RENDER-CONTENT] Evaluating render for flowStatus: '${flowStatus}'`);
        if (authLoading) {
            return <StagingUI message={t('authenticating', 'Authenticating...')} />;
        }
        switch (flowStatus) {
            case 'validating':
                return <StagingUI message={t('validatingSession', 'Validating session...')} />;
            
            case 'device_check':
                return (
                    <div className="flex items-center justify-center h-full w-full bg-slate-900">
                         <LiveSessionDeviceCheck onReady={handleDeviceCheckReady} />
                    </div>
                );

            case 'connecting':
                return <StagingUI message={t('common:connecting', 'Connecting to video service...')} />;

            case 'in_call':
                if (!videoSocket || !videoSocket.connected || !mediaConfig || !activeStream) {
                    logger.warn('[LSI-RENDER-CONTENT] BLOCKING RENDER for in_call: Socket/config/stream not ready.', {
                        hasVideoSocket: !!videoSocket,
                        isSocketConnected: videoSocket?.connected,
                        hasMediaConfig: !!mediaConfig,
                        hasActiveStream: !!activeStream,
                    });
                    return <StagingUI message={t('common:connecting', 'Finalizing connection...')} />;
                }
                return (
                    <LiveSessionCallUI
                        socket={videoSocket}
                        sessionId={linkId}
                        token={token}
                        initialConfig={mediaConfig}
                        stream={activeStream}
                        sessionData={{...sessionData, user, isCoach: user._id === sessionData.coach._id}}
                        onEndSession={handleEndSession}
                        onStreamUpdate={setActiveStream}
                    />
                );

            case 'completed':
                const isCurrentUserCoach = user?._id === sessionData?.coach?._id;
                return <LiveSessionSummary 
                    session={sessionData} 
                    isCoach={isCurrentUserCoach}
                    onBookFullSession={handleBookFullSession} 
                    onReturnToDashboard={handleReturnToDashboard} 
                    onLeaveReview={() => setIsReviewModalOpen(true)} 
                    reviewSubmitted={reviewSubmitted}
                />;

            case 'error':
                return <ErrorUI message={errorMessage} onReturn={handleReturnToDashboard} />;

            default:
                return <StagingUI message={t('initializing', 'Initializing...')} />;
        }
    };

    const bookingIdForReview = sessionData?.booking?._id || sessionData?.booking;

    return (
        <>
            {sessionWarning && <PaymentFailureWarning wrapUpTime={sessionWarning.wrapUpDuration} />}
            {renderContent()}
             <ScaConfirmationModal
                isOpen={!!reauthRequired}
                onClose={() => handleReauthFailure({ message: 'Modal closed by user' }, reauthRequired?.paymentIntentId)}
                clientSecret={reauthRequired?.clientSecret}
                onSuccess={handleReauthSuccess}
                onFailure={handleReauthFailure}
                stripePromise={stripePromise}
            />
            {isReviewModalOpen && bookingIdForReview && (
                <ReviewModal
                    reviewType="session_client"
                    entityId={bookingIdForReview}
                    entityTitle={sessionData.coach?.name || 'Coach'}
                    onClose={() => setIsReviewModalOpen(false)}
                    onSubmitSuccess={() => {
                        toast.success(t('review:reviewSubmittedSuccess'));
                        setIsReviewModalOpen(false);
                        setReviewSubmitted(true);
                    }}
                />
            )}
        </>
    );
};

export default React.memo(LiveSessionInterface);