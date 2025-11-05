import React, { useState, useEffect, useRef} from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog.tsx';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.tsx';
import { Button } from './ui/button.tsx';
import { Check, X, Hourglass, CreditCard, Loader2, Frown } from 'lucide-react';
import { logger } from '../utils/logger';
import { Badge } from './ui/badge.tsx';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import * as liveSessionAPI from '../services/liveSessionAPI';
import * as devAPI from '../services/devAPI';
import { toast } from 'react-hot-toast';
import ScaConfirmationModal from './payment/ScaConfirmationModal';
import { usePayment } from '../contexts/PaymentContext';

const RadialProgress = ({ progress }) => {
    const radius = 56;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;
    const colorClass = progress > 50 ? "text-green-500" : progress > 25 ? "text-yellow-500" : "text-red-500";

    return (
        <svg className="w-full h-full" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={radius} className="stroke-muted/20 dark:stroke-muted/30" strokeWidth="8" fill="transparent" />
            <motion.circle cx="60" cy="60" r={radius} className={cn("transition-colors duration-500", colorClass)} strokeWidth="8" fill="transparent" strokeDasharray={circumference} strokeLinecap="round" transform="rotate(-90 60 60)" initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset }} transition={{ duration: 1, ease: "linear" }} />
        </svg>
    );
};

const LiveSessionWaitingRoom = ({ isOpen, onClose, coach, user, onCancelRequest, sessionId, status, declineMessage, skipDeviceCheck = false }) => {
  const { t } = useTranslation(['common', 'liveSession']);
  const [countdown, setCountdown] = useState(60);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authFlowInitiated, setAuthFlowInitiated] = useState(false);
  const navigate = useNavigate();
  const authStartedRef = useRef(false);
  const { stripePromise } = usePayment();

   logger.debug(`[LiveSessionWaitingRoom] RENDER. Props received - Status: '${status}', SkipDeviceCheck: ${skipDeviceCheck}`);

useEffect(() => {
    // This effect now correctly handles the Strict Mode double-invocation.
    if (status === 'accepted' && sessionId && !authStartedRef.current) {
      // Mark as started immediately to prevent re-triggering on the second mount.
      authStartedRef.current = true;
      let isMounted = true;

      const beginAuth = async () => {
        logger.info(`[LSRoom-EFFECT] Status is 'accepted'. STARTING authorization flow for session: ${sessionId}`);
        if (!isMounted) return;

        setIsAuthorizing(true);
        logger.debug('[LSRoom-EFFECT] STEP 1: Set isAuthorizing=true.');

        try {
          const response = await liveSessionAPI.createAuthorization(sessionId);
          logger.debug('[LSRoom-EFFECT] STEP 2: API call successful. Received response.', { response });

          const newClientSecret = response?.clientSecret;

          if (!newClientSecret) {
            throw new Error('Client secret not found in API response.');
          }
          
          logger.debug('[LSRoom-EFFECT] STEP 3: Client secret is valid.');

          if (isMounted) {
            setClientSecret(newClientSecret);
            setShowAuthModal(true);
            logger.debug('[LSRoom-EFFECT] STEP 4: Set clientSecret and showAuthModal=true.');
          } else {
             logger.warn('[LSRoom-EFFECT] Component unmounted after API call but before showing modal. Aborting.');
          }

        } catch (err) {
          if (isMounted) {
            const errorMessage = err.response?.data?.message || err.message;
            logger.error('[LSRoom-EFFECT] CATCH BLOCK: Authorization failed.', { error: errorMessage });
            toast.error(`${t('liveSession:authInitFailed')}: ${errorMessage}`);
            onClose();
          }
        } finally {
          if (isMounted) {
            setIsAuthorizing(false);
            logger.debug('[LSRoom-EFFECT] FINALLY BLOCK: Set isAuthorizing=false.');
          }
        }
      };

      beginAuth();

      return () => {
        isMounted = false;
        logger.debug('[LSRoom-EFFECT] Cleanup: isMounted set to false.');
      };
    }
  }, [status, sessionId, t, onClose]);

   useEffect(() => {
    if (!isOpen) {
        authStartedRef.current = false;
        setShowAuthModal(false);
        setClientSecret(null);
    }
  }, [isOpen]);

useEffect(() => {
    let timer;
    if (isOpen && status === 'pending') {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            onCancelRequest();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOpen, status]);

  useEffect(() => {
    if (isOpen) {
      setCountdown(60);
      setAuthFlowInitiated(false);
    } else {
      setTimeout(() => {
        setShowAuthModal(false);
        setClientSecret(null);
        setAuthFlowInitiated(false);
      }, 300);
    }
  }, [isOpen]);

const handleAuthSuccess = async (paymentIntentId) => {
    setShowAuthModal(false);
    logger.info(`[LiveSessionWaitingRoom] Auth successful via ScaConfirmationModal. Starting session: ${sessionId}`, { paymentIntentId });
    try {
      const { sessionUrl } = await liveSessionAPI.start(sessionId);
   
      logger.info(`[LiveSessionWaitingRoom] Received sessionUrl from backend: "${sessionUrl}". Navigating now.`);
      if (!sessionUrl || typeof sessionUrl !== 'string' || !sessionUrl.startsWith('/')) {
        throw new Error(`Invalid sessionUrl received from server: ${sessionUrl}`);
      }
      
      navigate(sessionUrl);
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      logger.error('[LiveSessionWaitingRoom] Failed to start session after auth', { error: errorMessage });
      toast.error(`${t('liveSession:sessionStartFailed')}: ${errorMessage}`);
      onClose();
    }
  };

  const handleAuthFailure = async (error, paymentIntentId) => {
    setShowAuthModal(false);
    logger.warn(`[LiveSessionWaitingRoom] Authorization failed or was cancelled by user for session ${sessionId}.`, { reason: error.message, paymentIntentId });
    if (sessionId) {
        try {
            await liveSessionAPI.handleAuthorizationFailure(sessionId, { reason: error.message });
        } catch(apiError) {
            logger.error('[LiveSessionWaitingRoom] Failed to report authorization failure to backend.', { error: apiError.message });
        }
    }
    onClose();
  };


  if (!coach || !user) return null;

  const coachName = coach.user ? `${coach.user.firstName} ${coach.user.lastName}` : t('liveSession:aCoach');
  const progressPercentage = (countdown / 60) * 100;
  const requestStatus = status || 'pending';

  const renderContent = () => {
    switch (requestStatus) {
      case 'declined':
      case 'cancelled':
        return (
          <motion.div key="declined" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4 text-center p-6 sm:p-8">
            <Frown className="w-16 h-16 text-destructive" strokeWidth={1.5} />
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">{requestStatus === 'declined' ? t('liveSession:requestDeclined') : t('liveSession:requestCancelled')}</DialogTitle>
          
              <DialogDescription className="pt-2 text-base text-foreground/80">
                {requestStatus === 'declined' 
                  ? (declineMessage || t('liveSession:coachUnavailable', { coachName })) 
                  : t('liveSession:youCancelledTheRequest', 'You have cancelled the request.')
                }
              </DialogDescription>
            
            </DialogHeader>
            <Button variant="outline" onClick={onClose} className="w-full mt-4">{t('common:close')}</Button>
          </motion.div>
        );
  
      default:
        return (
          <div className="flex flex-col h-full">
            <DialogHeader className="p-6 text-center shrink-0">
              <DialogTitle className="text-2xl font-bold">
                {requestStatus === 'pending' ? t('liveSession:contacting', { coachName }) : t('liveSession:requestAccepted')}
              </DialogTitle>
              <DialogDescription>
                {requestStatus === 'pending' ? t('liveSession:waitingForResponse', { coachName }) : t('liveSession:paymentRequiredToStart')}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center gap-8 flex-grow p-6">
              <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8">
                <Avatar className="w-32 h-32 md:w-36 md:h-36 border-4 border-background shadow-lg">
                  <AvatarImage src={user.profilePicture?.url} alt={user.firstName} />
                  <AvatarFallback className="text-5xl">{(user.firstName?.[0] || 'Y') + (user.lastName?.[0] || 'U')}</AvatarFallback>
                </Avatar>
                <div className="hidden md:flex items-center gap-2 text-muted-foreground/50">
                  {[0, 1, 2].map(i => (<motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-current" animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />))}
                </div>
                <div className="relative flex items-center justify-center w-32 h-32 md:w-36 md:h-36">
                  <AnimatePresence mode="wait">
                    {requestStatus === 'pending' ? (
                      <motion.div key="countdown" className="w-full h-full">
                        <RadialProgress progress={progressPercentage} />
                        <div className="absolute inset-0 flex items-center justify-center text-5xl font-mono font-bold tracking-tight text-foreground">{countdown}</div>
                      </motion.div>
                    ) : (
                      <motion.div key="coach-avatar" className="w-full h-full">
                        <Avatar className="w-full h-full border-4 border-green-500 shadow-lg">
                          <AvatarImage src={coach.profilePicture?.url} alt={coach.user.firstName} />
                          <AvatarFallback className="text-5xl">{(coach.user?.firstName?.[0] || 'C') + (coach.user?.lastName?.[0] || '')}</AvatarFallback>
                        </Avatar>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <div className="w-full max-w-xs mt-4">
                <AnimatePresence mode="wait">
                  {requestStatus === 'pending' ? (
                    <motion.div key="cancel-btn">
                      <Button variant="ghost" size="sm" onClick={onCancelRequest} className="text-muted-foreground hover:text-destructive w-full">
                        <X className="w-4 h-4 mr-2" />
                        {t('liveSession:cancelRequest')}
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div key="accepted-state">
                      {isAuthorizing ? (
                        <div className="flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 mr-2 animate-spin" />{t('liveSession:preparingPayment')}</div>
                      ) : (
                        <div className="flex items-center justify-center text-green-600 dark:text-green-500 font-medium"><Check className="w-5 h-5 mr-2" />{t('liveSession:coachAccepted')}</div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
         
          </div>
        );
    }
  };

 return (
    <>
      <AnimatePresence>
        {isOpen && (
          <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent 
              className="p-0 max-w-lg w-full bg-background overflow-hidden flex flex-col z-[50]" 
              onPointerDownOutside={(e) => (status === 'pending' || status === 'accepted') && e.preventDefault()} 
              onEscapeKeyDown={(e) => (status === 'pending' || status === 'accepted') && e.preventDefault()}
            >
              <AnimatePresence mode="wait">{renderContent()}</AnimatePresence>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
      <ScaConfirmationModal
        isOpen={showAuthModal}
        onClose={() => handleAuthFailure({ message: "Modal closed by user." })}
        clientSecret={clientSecret}
        onSuccess={handleAuthSuccess}
        onFailure={handleAuthFailure}
        stripePromise={stripePromise}
      />
    </>
  );
};

export default LiveSessionWaitingRoom;