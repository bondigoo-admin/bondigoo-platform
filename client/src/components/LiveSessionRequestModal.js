import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog.tsx';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.tsx';
import { Button } from './ui/button.tsx';
import { Textarea } from './ui/textarea.tsx';
import { Check, X, ArrowLeft, Send, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { logger } from '../utils/logger';

const RequestRow = ({ req, onAccept, onDecline, openDeclineView }) => {
    const { t } = useTranslation(['common', 'liveSession']);
    const [countdown, setCountdown] = useState(60);
    const onDeclineRef = useRef(onDecline);

    useEffect(() => {
        onDeclineRef.current = onDecline;
    }, [onDecline]);

    useEffect(() => {
        const updateCountdown = () => {
            const timeElapsed = (Date.now() - new Date(req.createdAt).getTime()) / 1000;
            const remaining = Math.max(0, Math.round(60 - timeElapsed));
            setCountdown(remaining);

            if (remaining <= 0) {
                onDeclineRef.current(req._id, t('liveSession:requestTimedOut', 'The request timed out.'));
                clearInterval(timer);
            }
        };

        updateCountdown();
        const timer = setInterval(updateCountdown, 1000);
        return () => clearInterval(timer);
    }, [req.createdAt, req._id, t]);
    
    const client = req.client;
    const clientName = (client?.firstName && client?.lastName) ? `${client.firstName} ${client.lastName}`.trim() : t('liveSession:aClient', 'A Client');
    const clientInitials = (client?.firstName?.[0] || '') + (client?.lastName?.[0] || '');
    
return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Avatar className="h-10 w-10">
                <AvatarImage src={client?.profilePicture?.url} alt={clientName} />
                <AvatarFallback>{clientInitials}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
                <p className="font-semibold text-sm">{clientName}</p>
                
            </div>
           <div className="flex items-center gap-2">
                <div className="text-lg font-semibold tabular-nums w-8 text-center text-muted-foreground">{countdown}</div>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => openDeclineView(req)}>
                    <X className="h-5 w-5" />
                </Button>
                <Button size="icon" className="h-9 w-9 bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600" onClick={() => onAccept(req._id)}>
                    <Check className="h-5 w-5" />
                </Button>
            </div>
        </div>
    );
};

const LiveSessionRequestModal = ({ isOpen, requests = [], onAccept, onDecline, onClose }) => {
  const { t } = useTranslation(['common', 'liveSession']);
  const [view, setView, ] = useState('request');
  const [declineMessage, setDeclineMessage] = useState('');
  const [requestToDecline, setRequestToDecline] = useState(null);
  
  const authorizingRequest = requests?.find(r => r.status === 'authorizing');

 const presetDeclineMessages = t('liveSession:quickRepliesMessages', { returnObjects: true }) || [];
  
  const activeRequests = requests.filter(r => r.status === 'requested');
  
  useEffect(() => {
    if (activeRequests.length === 0 && !authorizingRequest) {
        onClose();
    }
  }, [activeRequests.length, authorizingRequest, onClose]);

  useEffect(() => {
    if (isOpen) {
        setView('request');
        setDeclineMessage('');
        setRequestToDecline(null);
    }
  }, [isOpen]);

  if (!isOpen || (!authorizingRequest && activeRequests.length === 0)) return null;

  const handleDeclineWithMessage = () => {
     if (!requestToDecline) return;
     logger.debug(`[LiveSessionRequestModal] Declining with custom message: "${declineMessage}" for request ${requestToDecline._id}`);
    onDecline(requestToDecline._id, declineMessage || t('liveSession:declinedDefault', 'Declined'));
    setView('request');
    setRequestToDecline(null);
  };

  const handleDeclineWithPreset = (message) => {
    if (!requestToDecline) return;
    logger.debug(`[LiveSessionRequestModal] Declining with preset message: "${message}" for request ${requestToDecline._id}`);
    onDecline(requestToDecline._id, message);
    setView('request');
    setRequestToDecline(null);
  }

  const openDeclineView = (request) => {
    setRequestToDecline(request);
    setView('decline_with_message');
  };

  const clientForAuthorizingView = authorizingRequest?.client;
  const clientNameForAuthorizingView = clientForAuthorizingView ? `${clientForAuthorizingView.firstName} ${clientForAuthorizingView.lastName}`.trim() : t('liveSession:aClient', 'A Client');
  const clientInitialsForAuthorizingView = clientForAuthorizingView ? (clientForAuthorizingView.firstName?.[0] || '') + (clientForAuthorizingView.lastName?.[0] || '') : 'C';
  const profilePictureUrlForAuthorizingView = clientForAuthorizingView?.profilePicture?.url;
  
  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent
            className="p-0 overflow-hidden max-w-lg w-full bg-transparent border-none shadow-none"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
            hideCloseButton
          >
            <div className="rounded-2xl overflow-hidden bg-background shadow-2xl border">
              <AnimatePresence mode="wait">
                {authorizingRequest ? (
                  <motion.div
                    key="authorizing"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col text-center"
                  >
                    <DialogHeader className="p-6 border-b">
                      <DialogTitle className="text-2xl font-bold">
                        {t('liveSession:finalizingTitle', 'Finalizing Session')}
                      </DialogTitle>
                      <DialogDescription className="pt-1">
                        {t('liveSession:authorizingSubtitle', 'Waiting for {{clientName}} to authorize payment.', { clientName: clientNameForAuthorizingView })}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col items-center justify-center gap-6 p-10 min-h-[254px] md:min-h-0">
                        <div className="relative">
                            <Avatar className="w-32 h-32 md:w-36 md:h-36 border-4 border-background shadow-lg opacity-40">
                                <AvatarImage src={profilePictureUrlForAuthorizingView} alt={clientNameForAuthorizingView} />
                                <AvatarFallback className="text-5xl">{clientInitialsForAuthorizingView}</AvatarFallback>
                            </Avatar>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="w-16 h-16 text-primary animate-spin" />
                            </div>
                        </div>
                    </div>
                    
                    <DialogFooter className="bg-muted/50 p-4 h-[68px]">
                    </DialogFooter>
                  </motion.div>
                ) : view === 'request' ? (
                  <motion.div
                    key='request-list'
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col"
                  >
                    <DialogHeader className="p-6 text-center border-b">
                      <DialogTitle className="text-2xl font-bold">
                         {t('liveSession:incomingRequestTitle_plural', { count: activeRequests.length })}
                      </DialogTitle>
                      <DialogDescription className="pt-1">
                          {t('liveSession:reviewAndRespond', 'Please review and respond to the requests below.')}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="p-4 sm:p-6 max-h-[60vh] overflow-y-auto">
                        <div className="space-y-3">
                            {activeRequests.map((req) => (
                                <RequestRow 
                                    key={req._id} 
                                    req={req} 
                                    onAccept={onAccept} 
                                    onDecline={onDecline}
                                    openDeclineView={openDeclineView}
                                />
                            ))}
                        </div>
                    </div>
                    
                    <DialogFooter className="bg-muted/50 p-4">
                        <Button variant="outline" className="w-full" onClick={onClose}>{t('common:close')}</Button>
                    </DialogFooter>
                  </motion.div>
                ) : ( 
                    <motion.div
                    key="decline"
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                  >
                    <DialogHeader className="p-6 pb-4 border-b">
                      <DialogTitle className="text-xl">{t('liveSession:declineWithHelpfulMessage', 'Decline with a helpful message?')}</DialogTitle>
                      <DialogDescription className="text-sm text-muted-foreground pt-1">{t('liveSession:declineMessageSubtitle', 'Let the client know why you are unavailable.')}</DialogDescription>
                    </DialogHeader>
                    <div className="p-6">
                        <div className="mb-4">
                            <p className="text-sm font-medium text-muted-foreground mb-3">{t('liveSession:quickReplies', 'Quick Replies')}</p>
                            <div className="flex flex-col gap-2">
                            {presetDeclineMessages.map((msg, index) => (
                                <Button key={index} variant="secondary" className="flex items-start text-left h-auto py-2.5 px-4" onClick={() => handleDeclineWithPreset(msg)}>
                                    <Send className="w-4 h-4 mr-3 mt-1 flex-shrink-0 text-muted-foreground"/>
                                    <span className="flex-1 whitespace-normal">{msg}</span>
                                </Button>
                            ))}
                            </div>
                        </div>

                        <div className="relative my-4">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-border" />
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-background px-2 text-xs text-muted-foreground uppercase">{t('common:or', 'Or')}</span>
                            </div>
                        </div>

                        <Textarea
                            placeholder={t('liveSession:declineCustomPlaceholder', 'Or write a custom message...')}
                            value={declineMessage}
                            onChange={(e) => setDeclineMessage(e.target.value)}
                            className="min-h-[100px]"
                        />
                    </div>
                    <DialogFooter className="bg-muted/50 p-4 flex-row justify-between items-center">
                       <Button variant="ghost" onClick={() => setView('request')}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {t('common:back', 'Back')}
                      </Button>
                      <Button variant="destructive" onClick={handleDeclineWithMessage}>
                        <X className="w-4 h-4 mr-2" />
                        {t('liveSession:sendMessageAndDecline', 'Send & Decline')}
                      </Button>
                    </DialogFooter>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
};

export default LiveSessionRequestModal;