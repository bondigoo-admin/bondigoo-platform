import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Clock, Calendar, MessageSquare, ChevronDown, ChevronUp, DollarSign, Bell, Info, Link, Loader2, CheckCircle, Star, CreditCard, AlertTriangle, CheckSquare, BookOpen, TrendingUp, Receipt, Undo, ShieldQuestion, EyeOff, ShieldBan, ShieldCheck, ShieldX } from 'lucide-react';
import { useProfilePicture } from '../hooks/useProfilePicture';
import moment from 'moment';
import { useBookingActions } from '../hooks/useBookingActions';
import { useNotificationActions } from '../hooks/useNotificationActions';
import SuggestAlternativeTimeModal from './SuggestAlternativeTimeModal';
import { toast } from 'react-hot-toast';
import BookingDetailsModal from './BookingDetailsModal';
import { Badge } from './ui/badge.tsx';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermission';
import { useToast } from '../hooks/useToast';
import { logger } from '../utils/logger';
import { useQueryClient } from 'react-query';
import ReviewModal from './ReviewModal';
import api, { markNotificationAsActioned } from '../services/api';
import { Button } from './ui/button.tsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip.tsx';
import RefundResponseModal from './refunds/RefundResponseModal';
import AppealModal from './shared/AppealModal';
import { cn } from '../lib/utils';

const MarkdownRenderer = ({ text, notification, setActiveAuditId, setShowAppealModal }) => {
    const { t } = useTranslation(['notifications']);
    const pattern = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;

    if (!text) return null;

    const elements = [];
    let lastIndex = 0;

    for (const match of text.matchAll(pattern)) {
        if (match.index > lastIndex) {
            elements.push(text.substring(lastIndex, match.index));
        }

        const boldText = match[2];
        const linkText = match[4];
        const linkTarget = match[5];

        if (boldText) {
            elements.push(<strong key={match.index}>{boldText}</strong>);
         } else if (linkText && linkTarget) {
            const auditId = notification.metadata?.additionalData?.auditId || notification.content?.data?.auditId;
            if (linkTarget === 'appeal' || linkTarget === 'link-to-support') {
                elements.push(
                    <a
                        href="#"
                        key={match.index}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (auditId) {
                                setActiveAuditId(auditId);
                                setShowAppealModal(true);
                            } else {
                                logger.error('[MarkdownRenderer] Appeal link clicked but no auditId found.', { notificationId: notification._id });
                                toast.error(t('notifications:errors.appealDataMissing', 'Could not open appeal. The necessary data is missing.'));
                            }
                        }}
                        className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                        {t('actions.appealLinkText', linkText)}
                    </a>
                );
            } else if (linkTarget === 'link-to-guidelines') {
                elements.push(
                    <a
                        href="/community-guidelines"
                        target="_blank"
                        rel="noopener noreferrer"
                        key={match.index}
                        className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                        {linkText}
                    </a>
                );
            } else {
                elements.push(
                    <a href={linkTarget} key={match.index} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">{linkText}</a>
                );
            }
        }
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        elements.push(text.substring(lastIndex));
    }

    return <>{elements.map((el, i) => <React.Fragment key={i}>{el}</React.Fragment>)}</>;
};

const NotificationItemContent = ({ notification, onAction, bookingData, isLoadingBooking, isExpanded, onToggleExpand, onContainerClick }) => {
  const { t } = useTranslation(['notifications', 'common', 'admin']);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showSuggestAlternativeTimeModal, setShowSuggestAlternativeTimeModal] = useState(false);
  const [suggestModalProps, setSuggestModalProps] = useState({}); 
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showMessageInput, setShowMessageInput] = useState(false);
  const { acceptBooking, declineBooking, suggestAlternativeTime, respondToRescheduleRequestByCoach, respondToRescheduleRequestByClient, acceptBookingByClient, declineBookingByClient } = useBookingActions();
  const { markAsRead } = useNotificationActions();
  const { user } = useAuth();
  const { isCoach } = usePermissions();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { bookingError } = useQueryClient().getQueryState(['booking', notification?.metadata?.bookingId]) || {};
  const [actionInProgress, setActionInProgress] = useState(null);
  const [isActioned, setIsActioned] = useState(notification.status === 'actioned');
  const [isReviewSubmitted, setIsReviewSubmitted] = useState(false);
  const [modalInitialAction, setModalInitialAction] = useState(null);
  const [isPaymentCompleted, setIsPaymentCompleted] = useState(bookingData?.payment?.status === 'completed');
  const [showRefundResponseModal, setShowRefundResponseModal] = useState(false);
  const [showAppealModal, setShowAppealModal] = useState(false); 
  const [activeAuditId, setActiveAuditId] = useState(null);

  const normalizedBookingId = useMemo(() => {
    if (!notification?.metadata) return null;
    const rawId = notification.metadata.bookingId;
    return typeof rawId === 'object' ? rawId?._id || rawId?.id : rawId;
  }, [notification?.metadata]);

  const sessionDetails = useMemo(() => {
    if (!bookingData) {
      logger.warn('[NotificationItemContent] No booking data available, hiding notification', {
        notificationId: notification._id,
        bookingId: normalizedBookingId,
        timestamp: new Date().toISOString()
      });
      return null;
    }
    if (!bookingData.user || !bookingData.coach) {
      logger.warn('[NotificationItemContent] Incomplete booking data', {
        bookingId: normalizedBookingId,
        bookingData,
        timestamp: new Date().toISOString()
      });
      return null;
    }
    if (bookingData.user._id === bookingData.coach._id) {
      logger.warn('[NotificationItemContent] Self-referential booking detected', {
        bookingId: normalizedBookingId,
        userId: bookingData.user._id,
        coachId: bookingData.coach._id,
        timestamp: new Date().toISOString()
      });
    }
    return {
      clientName: `${bookingData.user.firstName} ${bookingData.user.lastName}`,
      coachName: `${bookingData.coach.firstName} ${bookingData.coach.lastName}`,
      sessionType: bookingData.title || bookingData.sessionType?.name || 'Session',
      start: moment(bookingData.start),
      end: moment(bookingData.end),
      status: bookingData.status
    };
  }, [bookingData, normalizedBookingId, notification._id]);


  const { isUploading, error: profilePictureError } = useProfilePicture(
    notification.metadata?.coachId || notification.metadata?.clientId
  );

  const handleBookingDetailsClick = (e) => {
    e.stopPropagation();
    setShowBookingModal(true);
  };

const handleItemClick = () => {
    const isReviewNotification = ['review_prompt_coach', 'review_prompt_client'].includes(notification.type);
    if (isReviewNotification && (notification.status === 'actioned' || isReviewSubmitted)) {
      logger.info('[NotificationItemContent] Review already submitted, not opening modal:', {
        notificationId: notification._id,
        status: notification.status,
        isReviewSubmitted,
      });
      showToast({
        type: 'info',
        message: t('notifications:reviewAlreadySubmitted'),
      });
      return;
    }
  
    logger.info('[NotificationItemContent] Item clicked:', {
      type: notification.type,
      bookingId: normalizedBookingId,
    });
  
    if (!notification.isRead) {
      markAsRead(notification._id)
        .then(() => logger.info('[NotificationItemContent] Marked as read on open', { notificationId: notification._id }))
        .catch(error => logger.error('[NotificationItemContent] Failed to mark as read on open', { error: error.message }));
    }

    const additionalData = notification.metadata?.additionalData || {};
    const contentData = notification.content?.data || {};
    const auditId = notification.metadata?.auditId || additionalData.auditId || contentData.auditId;

    const getEntityId = (entityName) => {
      const rawId = notification.metadata?.[entityName] || additionalData[entityName] || contentData[entityName];
      if (typeof rawId === 'object' && rawId !== null) {
        return rawId._id || rawId.id;
      }
      return rawId;
    };
    
    const programId = getEntityId('programId') || getEntityId('program');
    const lessonId = getEntityId('lessonId') || getEntityId('lesson');
    const commentId = getEntityId('commentId') || getEntityId('comment');

   switch(notification.type) {
        case 'user_content_hidden':
        case 'user_account_suspended':
            if (auditId) {
                setActiveAuditId(auditId);
                setShowAppealModal(true);
            } else {
                logger.error('[NotificationItemContent] Moderation notification clicked but no auditId found.', { notificationId: notification._id });
                showToast({
                    type: 'error',
                    message: t('notifications:errors.appealDataMissing', 'Could not open appeal. The necessary data is missing.')
                });
            }
            return;
        case 'report_dismissed':
            return;
        case 'coach_verification_approved':
        case 'coach_verification_rejected':
        case 'verification_expiring_soon':
            window.location.href = `/settings?tab=coach`;
            return;
        case 'user_account_warning':
            if (auditId) {
                setActiveAuditId(auditId);
                setShowAppealModal(true);
            } else {
                logger.error('[NotificationItemContent] Moderation notification clicked but no auditId found.', { notificationId: notification._id });
                showToast({
                    type: 'error',
                    message: t('notifications:errors.appealDataMissing', 'Could not open appeal. The necessary data is missing.')
                });
            }
            return;
        case 'report_actioned':
            return;
        case 'refund_request_for_coach':
            if (isCoach()) {
                setShowRefundResponseModal(true);
                return;
            }
            break;
        case 'program_comment_posted':
        case 'program_comment_reply':
        case 'program_assignment_submitted':
            if (programId && lessonId) {
                window.location.href = `/learn/program/${programId}?lesson=${lessonId}${commentId ? `&comment=${commentId}` : ''}`;
                return;
            }
            break;
        case 'new_program_review':
        case 'program_sale_coach':
            if (programId && isCoach()) {
                window.location.href = `/coach-dashboard?tab=programs&programId=${programId}`;
                return;
            }
            break;
        case 'program_purchase_confirmed':
        case 'program_completed':
            if (programId) {
                window.location.href = `/learn/program/${programId}`;
                return;
            }
            break;
         case 'live_session_earnings_coach':
            window.location.href = `/coach-dashboard?tab=earnings`;
            return;
          case 'upcoming_session_reminder':
          case 'coach_cancelled_session':
              setShowBookingModal(true);
              return;
          case 'new_earning':
          case 'payout_initiated':
              window.location.href = `/coach-dashboard?tab=earnings`;
              return;
          case 'payout_on_hold':
          case 'payout_released':
            window.location.href = `/coach-dashboard?tab=earnings`;
            return;
        }
  
    if (notification.type === 'client_requested_reschedule' && isCoach() && bookingData?.status === 'pending_reschedule_client_request') {
        const clientRequest = bookingData?.rescheduleRequests?.find(
            r => r.status === 'pending_coach_action' &&
                 r.proposedBy &&
                 bookingData.user && bookingData.user._id &&
                 r.proposedBy.toString() === bookingData.user._id.toString()
        );

        if (clientRequest && clientRequest.proposedSlots && clientRequest.proposedSlots.length > 0) {
             logger.info('[NotificationItemContent] Opening SuggestAlternativeTimeModal directly from item click for coach to select from client proposal.', { 
                bookingId: normalizedBookingId,
                clientRequestId: clientRequest._id,
                timestamp: new Date().toISOString()
            });
            setSuggestModalProps({
                booking: bookingData,
                currentUserRole: 'coach',
                existingProposal: { 
                    proposerRole: 'client',
                    proposedSlots: clientRequest.proposedSlots,
                    proposerMessage: clientRequest.requestMessage,
                    requestId: clientRequest._id,
                    status: 'pending_coach_action' 
                },
                modeOverride: 'coach_select_from_client_proposal' 
            });
            setShowSuggestAlternativeTimeModal(true);
            return;
        }
    } else if (
        !isCoach() &&
        (notification.type === 'coach_proposed_new_reschedule_time' || notification.type === 'coach_counter_proposal_sent_to_client') &&
        bookingData?.status === 'pending_reschedule_coach_request'
      ) {
        const coachProposal = bookingData?.rescheduleRequests?.find(
          r => r.status === 'pending_client_action' &&
               r.proposedBy &&
               bookingData.coach && bookingData.coach._id &&
               r.proposedBy.toString() === bookingData.coach._id.toString()
        );

        logger.debug('[NotificationItemContent] renderActions: Client viewing coach proposal - coachProposal details:', { 
            notificationId: notification._id,
            coachProposalExists: !!coachProposal, 
            coachProposal 
        });

        if (coachProposal && coachProposal.proposedSlots && coachProposal.proposedSlots.length > 0) {
            logger.info('[NotificationItemContent] Opening SuggestAlternativeTimeModal directly from item click for client to respond to coach proposal.', {
                bookingId: normalizedBookingId,
                coachRequestId: coachProposal._id,
                timestamp: new Date().toISOString()
            });
            setSuggestModalProps({
                booking: bookingData,
                currentUserRole: 'client',
                existingProposal: {
                    proposerRole: 'coach',
                    proposedSlots: coachProposal.proposedSlots,
                    proposerMessage: coachProposal.requestMessage,
                    requestId: coachProposal._id,
                    status: 'pending_client_action'
                },
                modeOverride: 'client_select_from_coach_proposal' 
            });
            setShowSuggestAlternativeTimeModal(true);
            return;
        }
    }


    if (isReviewNotification) {
      setShowReviewModal(true);
    } else {
      setShowBookingModal(true);
    }
  };

  const handleReviewSubmit = async (reviewData) => {
    try {
      logger.info('[NotificationItemContent] Handling review submission:', {
        notificationId: notification._id,
        bookingId: normalizedBookingId,
        reviewData
      });
  
      // Mark notification as actioned on the server
      const response = await markNotificationAsActioned(notification._id);
      logger.info('[NotificationItemContent] Notification marked as actioned:', {
        notificationId: notification._id,
        responseStatus: response.status,
        responseData: response.data
      });
  
      // Update local state for immediate UI feedback
      setIsReviewSubmitted(true); // New state update
      logger.debug('[NotificationItemContent] Local state updated', {
        notificationId: notification._id,
        isReviewSubmitted: true
      });
  
      queryClient.invalidateQueries('notifications');
      setShowReviewModal(false);
  
      showToast({
        type: 'success',
        message: t('notifications:reviewSubmitted')
      });
    } catch (error) {
      logger.error('[NotificationItemContent] Review process failed:', {
        notificationId: notification._id,
        error: error.message,
        stack: error.stack
      });
      showToast({
        type: 'error',
        message: t('notifications:reviewSubmissionFailed')
      });
    }
  };

  const handleActionWithState = async (action) => {
    if (actionInProgress) return;
    setActionInProgress(action);
    try {
      if (action === 'pay_now') {
        logger.info('[NotificationItemContent.handleActionWithState] Opening BDM for PAY_NOW with this existingBooking prop:', {
          notificationId: notification._id,
          bookingIdForModal: normalizedBookingId, // The MongoDB ID of the 1-on-1 booking
          bookingDataPropForModal: bookingData, // Log the entire bookingData object
          modalInitialAction: 'pay_now',
          timestamp: new Date().toISOString(),
      });
        setModalInitialAction('pay_now');
        setShowBookingModal(true);
      } else {
        await handleAction(action);
      }
    } catch (error) {
      logger.error('[NotificationItemContent] Action failed:', {
        action,
        error: error.message || error.toString(),
        stack: error.stack,
        notificationId: notification._id,
        timestamp: new Date().toISOString(),
      });
      showToast({
        type: 'error',
        message: t('notifications:actionFailed'),
      });
    } finally {
      setActionInProgress(null);
    }
  };

  useEffect(() => {
    const handleBookingUpdate = (event) => {
      const { bookingId, status } = event.detail;
      if (bookingId === notification.metadata?.bookingId) {
        setIsActioned(true);
      }
    };
    window.addEventListener('booking_update', handleBookingUpdate);
    return () => window.removeEventListener('booking_update', handleBookingUpdate);
  }, [notification.metadata?.bookingId]);

     useEffect(() => {
    const handleBookingUpdate = (event) => {
      const { bookingId: updatedBookingId, status: newStatus, bookingData: eventBookingData } = event.detail; 

      if (updatedBookingId === normalizedBookingId) {
        logger.info('[NotificationItemContent] Received real-time booking update via event listener:', {
          bookingId: updatedBookingId,
          newStatus: newStatus, 
          notificationId: notification._id,
          eventBookingDataExists: !!eventBookingData
        });
        setIsActioned(true); 

        queryClient.setQueryData('notifications', (oldQueryData) => {
          if (!oldQueryData) {
            logger.warn('[NotificationItemContent] handleBookingUpdate (socket): no old data in cache for "notifications".');
            return oldQueryData;
          }
        
          if (typeof oldQueryData === 'object' && oldQueryData !== null && Array.isArray(oldQueryData.notifications)) {
            return {
              ...oldQueryData,
              notifications: oldQueryData.notifications.map(n =>
                n._id === notification._id ? { ...n, status: 'actioned', actionResult: newStatus || 'updated_via_socket', metadata: { ...n.metadata, bookingStatus: newStatus } } : n
              )
            };
          }
        
          if (Array.isArray(oldQueryData)) { // Fallback for direct array cache
             return oldQueryData.map(n =>
               n._id === notification._id ? { ...n, status: 'actioned', actionResult: newStatus || 'updated_via_socket', metadata: { ...n.metadata, bookingStatus: newStatus } } : n
             );
          }

          logger.warn('[NotificationItemContent] handleBookingUpdate (socket): notifications cache data is not in expected format.', { cachedDataType: typeof oldQueryData });
          return oldQueryData;
        });

        queryClient.invalidateQueries(['booking', normalizedBookingId]);
        if (eventBookingData) {
            queryClient.setQueryData(['booking', normalizedBookingId], eventBookingData);
        }
      }
    };
    window.addEventListener('booking_update', handleBookingUpdate);
    return () => window.removeEventListener('booking_update', handleBookingUpdate);
  }, [normalizedBookingId, notification._id, queryClient, setIsActioned]);


  useEffect(() => {
    if (bookingError) {
      logger.error('[NotificationItemContent] Error loading booking:', {
        notificationId: notification._id,
        bookingId: normalizedBookingId,
        error: bookingError
      });
      showToast({
        type: 'error',
        message: t('notifications:bookingLoadError')
      });
    }
  }, [bookingError, normalizedBookingId, notification._id]);

  useEffect(() => {
    const handleBookingUpdate = (event) => {
      const { bookingId, status } = event.detail;
      if (bookingId === notification.metadata?.bookingId) {
        logger.info('[NotificationItemContent] Received real-time booking update:', {
          bookingId,
          newStatus: status,
          notificationId: notification._id
        });
        setIsActioned(true);
        queryClient.invalidateQueries(['booking', bookingId]);
      }
    };
    window.addEventListener('booking_update', handleBookingUpdate);
    return () => window.removeEventListener('booking_update', handleBookingUpdate);
  }, [notification.metadata?.bookingId, notification._id, queryClient]);

  useEffect(() => {
    setIsActioned(
      notification.status === 'actioned' ||
      notification.status === 'archived' ||
      bookingData?.status === 'confirmed' ||
      bookingData?.status === 'declined'
    );
  }, [notification.status, bookingData?.status]);

  useEffect(() => {
    if (showReviewModal) {
      logger.info('[NotificationItemContent] Review modal opened:', {
        type: notification.type,
        bookingId: normalizedBookingId,
      });
    }
  }, [showReviewModal, notification.type, normalizedBookingId]);

  useEffect(() => {
    logger.info('[NotificationItemContent] Notification details:', {
      notificationId: notification._id,
      type: notification.type,
      userRole: isCoach() ? 'coach' : 'client',
      bookingId: normalizedBookingId,
      timestamp: new Date().toISOString()
    });
  }, [notification._id, notification.type, normalizedBookingId]);

  useEffect(() => {
  logger.info('[NotificationItemContent] showBookingModal changed', {
    notificationId: notification._id,
    bookingId: normalizedBookingId,
    showBookingModal,
    timestamp: new Date().toISOString(),
  });
}, [showBookingModal, notification._id, normalizedBookingId]);

useEffect(() => {
  const handlePaymentComplete = (event) => {
    const { bookingId, status } = event.detail;
    if (bookingId === normalizedBookingId && status === 'completed') {
      logger.info('[NotificationItemContent] Payment completed event received', {
        notificationId: notification._id,
        bookingId,
        timestamp: new Date().toISOString(),
      });
      setIsPaymentCompleted(true);
      queryClient.invalidateQueries('notifications'); // Ensure notification data stays fresh
    }
  };
  window.addEventListener('payment_completed', handlePaymentComplete);
  return () => {
    window.removeEventListener('payment_completed', handlePaymentComplete);
    logger.info('[NotificationItemContent] Cleaned up payment_completed listener', {
      notificationId: notification._id,
      timestamp: new Date().toISOString(),
    });
  };
}, [normalizedBookingId, notification._id, queryClient]);

const renderActions = () => {
    logger.debug('[NotificationItemContent] renderActions called:', {
      notificationId: notification._id,
      type: notification.type,
      isCoachUser: isCoach(),
      bookingStatus: bookingData?.status,
      notificationStatus: notification.status,
      isActionedLocal: isActioned,
    });
    
    const isReviewNotification = ['review_prompt_coach', 'review_prompt_client'].includes(notification.type);
    let isNotificationActionableByUI = notification.metadata?.additionalData?.requiresAction === true || notification.content?.data?.requiresAction === true;
    const validActionsFromNotification = notification.content?.data?.validActions || notification.metadata?.additionalData?.validActions || [];

    const renderTooltipButton = (actionKey, config) => (
      <TooltipProvider key={actionKey} delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleActionWithState(actionKey); }}
              disabled={!!actionInProgress}
              variant={config.variant}
              size="icon-sm"
              className="gap-0"
            >
              {actionInProgress === actionKey ? <Loader2 className="animate-spin" /> : config.icon}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{config.label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    // --- Client-side post-resolution actions (Pay & Review) ---
    if (!isCoach()) {
      if (isReviewNotification || notification.type === 'live_session_receipt_client') {
        if (notification.status === 'actioned' || isReviewSubmitted) {
          return null;
        }
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowReviewModal(true); }}
                  variant="action-star"
                  size="icon-sm"
                  className="gap-0"
                >
                  <Star />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('notifications:actions.leaveReview')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      
      if ((notification.type === 'booking_confirmed' || notification.type === 'payment_reminder' || notification.type === 'webinar_registration_confirmed_client') && !isPaymentCompleted && bookingData?.payment?.status !== 'completed' && (notification.content?.data?.paymentStatus === 'pending' || notification.content?.data?.paymentStatus === 'payment_required')) {
        return renderTooltipButton('pay_now', {
          label: t('notifications:actions.payNow', { defaultValue: 'Pay Now' }),
          icon: <CreditCard />,
          variant: 'action-pay'
        });
      }
    }

    const isAlreadyResolvedOrHandledGeneral = isActioned || notification.status === 'actioned' || ['confirmed', 'declined', 'cancelled_by_coach', 'cancelled_by_client', 'rescheduled', 'completed'].includes(bookingData?.status);
    if (isAlreadyResolvedOrHandledGeneral) {
      return null;
    }

    // --- Pre-resolution actions ---
    if (isCoach()) {
      const actionsConfig = {
        accept: { label: t('notifications:actions.accept', 'Accept'), icon: <Check />, variant: 'action-accept' },
        decline: { label: t('notifications:actions.decline', 'Decline'), icon: <X />, variant: 'action-decline' },
        suggest: { label: t('notifications:actions.suggest', 'Suggest Time'), icon: <Clock />, variant: 'action-suggest' },
        approve_reschedule_request: { label: t('notifications:actions.approveReschedule', 'Approve Reschedule'), icon: <Check />, variant: 'action-accept' },
        decline_reschedule_request: { label: t('notifications:actions.declineReschedule', 'Decline Reschedule'), icon: <X />, variant: 'action-decline' },
        counter_propose_reschedule_request: { label: t('notifications:actions.proposeNewTime', 'Propose New Time'), icon: <Clock />, variant: 'action-suggest' },
      };
      
      let actionsToDisplay = [];
      if (notification.type === 'booking_request' && bookingData?.status === 'requested' && isNotificationActionableByUI) {
        if (validActionsFromNotification.includes('approve')) actionsToDisplay.push(renderTooltipButton('accept', actionsConfig.accept));
        if (validActionsFromNotification.includes('decline')) actionsToDisplay.push(renderTooltipButton('decline', actionsConfig.decline));
        if (validActionsFromNotification.includes('suggest')) actionsToDisplay.push(renderTooltipButton('suggest', actionsConfig.suggest));
      } else if (notification.type === 'client_requested_reschedule' && bookingData?.status === 'pending_reschedule_client_request' && isNotificationActionableByUI) {
        const activeActions = validActionsFromNotification.filter(key => actionsConfig[key]);
        actionsToDisplay = activeActions.map(key => renderTooltipButton(key, actionsConfig[key]));
      }
      
      if (actionsToDisplay.length > 0) {
        return <div className="flex items-center gap-2">{actionsToDisplay}</div>;
      }
    } else { // Client's perspective (pre-resolution)
      if (notification.type === 'coach_booking_request' && bookingData?.status === 'requested' && isNotificationActionableByUI) {
        const actionsConfig = {
            accept_by_client: { label: t('notifications:actions.accept', 'Accept'), icon: <Check />, variant: 'action-accept' },
            decline_by_client: { label: t('notifications:actions.decline', 'Decline'), icon: <X />, variant: 'action-decline' },
        };
        let actionsToDisplay = [];
        if (validActionsFromNotification.includes('approve')) actionsToDisplay.push(renderTooltipButton('accept_by_client', actionsConfig.accept_by_client));
        if (validActionsFromNotification.includes('decline')) actionsToDisplay.push(renderTooltipButton('decline_by_client', actionsConfig.decline_by_client));
        
        if (actionsToDisplay.length > 0) {
            return <div className="flex items-center gap-2">{actionsToDisplay}</div>;
        }
      }

      if (
        (notification.type === 'coach_proposed_new_reschedule_time' || notification.type === 'coach_counter_proposal_sent_to_client') &&
        bookingData?.status === 'pending_reschedule_coach_request'
      ) {
          const clientActionsConfig = {
            client_accept_coach_proposal: { label: t('notifications:actions.acceptCoachProposal'), icon: <Check />, variant: 'action-accept' },
            client_decline_coach_proposal: { label: t('notifications:actions.declineCoachProposal'), icon: <X />, variant: 'action-decline' },
            client_propose_new_time_to_coach: { label: t('notifications:actions.proposeNewTimeToCoach'), icon: <Clock />, variant: 'action-suggest' },
          };
          let effectiveClientActions = validActionsFromNotification;
          if (!effectiveClientActions || effectiveClientActions.length === 0) {
            effectiveClientActions = ['approve', 'decline', 'suggest'];
          }
          let actionsToDisplay = [];
          if (effectiveClientActions.includes('approve')) actionsToDisplay.push(renderTooltipButton('client_accept_coach_proposal', clientActionsConfig.client_accept_coach_proposal));
          if (effectiveClientActions.includes('decline')) actionsToDisplay.push(renderTooltipButton('client_decline_coach_proposal', clientActionsConfig.client_decline_coach_proposal));
          if (effectiveClientActions.includes('suggest')) actionsToDisplay.push(renderTooltipButton('client_propose_new_time_to_coach', clientActionsConfig.client_propose_new_time_to_coach));
          if (actionsToDisplay.length > 0) {
            return <div className="flex items-center gap-2">{actionsToDisplay}</div>;
          }
      }
    }

      if (notification.type === 'refund_request_for_coach' && isCoach() && !isActioned) {
        return (
             <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRefundResponseModal(true); }}
                            variant="action-suggest"
                            size="icon-sm"
                        >
                           <Undo />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>{t('notifications:actions.reviewRefundRequest')}</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return null;
  };

const getStatusTranslationKey = (status) => {
    const statusMap = {
      requested: 'notifications:status.requested',
      confirmed: 'notifications:status.confirmed',
      declined: 'notifications:status.declined',
      cancelled: 'notifications:status.cancelled', 
      cancelled_by_coach: 'notifications:status.cancelledByCoach',
      cancelled_by_client: 'notifications:status.cancelledByClient',
      completed: 'notifications:status.completed',
      firm_booked: 'notifications:status.confirmed',
      rescheduled: 'notifications:status.rescheduled',
      pending_reschedule_client_request: 'notifications:status.pendingRescheduleClient',
      pending_reschedule_coach_request: 'notifications:status.pendingRescheduleCoach',
      actioned: 'notifications:status.actioned',
      approved: 'notifications:status.approved',
      approved_by_coach: 'notifications:status.approvedByCoach',
      approved_by_client: 'notifications:status.approvedByClient',
      paid: 'notifications:status.paidAndConfirmed', 
      payment_required: 'notifications:status.paymentRequired',
      payment_processing: 'notifications:status.paymentProcessing',
    };
    return statusMap[status] || `notifications:status.${status}` || 'notifications:status.pending';
  };

const getStatusVariant = (status) => {
    switch (status) {
      case 'confirmed':
      case 'firm_booked':
      case 'completed':
      case 'rescheduled':
      case 'approved':
      case 'approved_by_coach':
      case 'approved_by_client':
      case 'paid':
        return 'success';
      case 'declined':
      case 'cancelled':
      case 'cancelled_by_coach':
      case 'cancelled_by_client':
        return 'destructive';
      case 'requested':
      case 'pending_reschedule_client_request':
      case 'pending_reschedule_coach_request':
      case 'payment_required':
      case 'payment_processing':
        return 'warning';
      case 'actioned':
        return 'info';
      default: return 'secondary';
    }
  };

  const renderStatusBadge = () => {
    if (['review_prompt_coach', 'review_prompt_client'].includes(notification.type)) {
      if (notification.status === 'actioned' || isReviewSubmitted) {
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger>
                <CheckCircle size={16} className="text-green-600 dark:text-green-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('notifications:reviewStatus.rated')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
    }

    const isAlreadyResolvedOrHandledGeneral = isActioned || notification.status === 'actioned' || ['confirmed', 'declined', 'cancelled_by_coach', 'cancelled_by_client', 'rescheduled', 'completed'].includes(bookingData?.status);
    if (isAlreadyResolvedOrHandledGeneral) {
      const statusKey = getStatusTranslationKey(bookingData?.status || notification.metadata?.actionResult || notification.status);
      const statusVariant = getStatusVariant(bookingData?.status || notification.metadata?.actionResult || notification.status);
      if (statusKey && statusVariant && statusKey !== 'notifications:status.pending' && statusKey !== 'notifications:status.actioned') {
        const iconMap = {
            success: <CheckCircle size={16} className="text-green-600 dark:text-green-500" />,
            destructive: <X size={16} className="text-red-600 dark:text-red-500" />,
            warning: <Clock size={16} className="text-yellow-600 dark:text-yellow-500" />,
            info: <Info size={16} className="text-blue-600 dark:text-blue-500" />,
        };
        const icon = iconMap[statusVariant] || null;

        if (!icon) return null;

        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center">{icon}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t(statusKey)}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
    }
    return null;
  };

  const handleActionComplete = async (action, isLoading, result, error) => {
    logger.info('[NotificationItemContent] Action completed:', {
      action,
      success: !error,
      notificationId: notification._id
    });
    if (error) {
      showToast({
        type: 'error',
        message: t('common:errors.actionFailed')
      });
      return;
    }
    if (!isLoading && result) {
      queryClient.setQueryData(['notifications'], (old) => {
        return old?.map(n =>
          n._id === notification._id
            ? { ...n, status: 'actioned', actionResult: action }
            : n
        );
      });
      if (normalizedBookingId) {
        queryClient.setQueryData(['booking', normalizedBookingId], result);
      }
      onAction(action, result);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'booking_confirmed':
      case 'booking_request':
      case 'booking_declined':
      case 'booking_cancelled':
      case 'booking_cancelled_by_you':
      case 'client_cancelled_booking':
      case 'your_booking_cancellation_confirmed':
      case 'booking_cancelled_by_coach':
      case 'reschedule_confirmed_auto_client':
      case 'reschedule_confirmed_auto_coach':
      case 'reschedule_request_sent_to_coach':
      case 'client_requested_reschedule':
      case 'reschedule_approved_by_coach':
      case 'reschedule_confirmed_notification':
      case 'reschedule_declined_by_coach':
      case 'coach_proposed_new_reschedule_time':
      case 'reschedule_approved_by_client_client_confirm':
      case 'reschedule_approved_by_client_coach_notif':
      case 'reschedule_declined_by_client_client_confirm':
      case 'reschedule_declined_by_client_coach_notif':
      case 'reschedule_request_declined_confirmation':
      case 'coach_counter_proposed_reschedule_request':
      case 'client_accepted_coach_counter_proposal':
      case 'client_declined_coach_counter_proposal':
      case 'coach_counter_proposal_sent_to_client':
      case 'coach_booking_request':
        return <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
       case 'payment_reminder':
        return <CreditCard className="h-5 w-5 text-orange-600 dark:text-orange-400" />;
      case 'session_reminder':
      case 'session_starting':
      case 'session_starting_now':
        return <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
        case 'program_purchase_confirmed':
        case 'program_sale_coach':
        return <BookOpen className="h-5 w-5 text-green-600 dark:text-green-400" />;
      case 'review_prompt_coach':
      case 'review_prompt_client':
      case 'new_program_review':
        return <Star className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />;
      case 'program_comment_posted':
     case 'program_comment_reply':
      case 'program_assignment_submitted':
        return <MessageSquare className="h-5 w-5 text-purple-600 dark:text-purple-400" />;
        case 'overtime_payment_captured':
          case 'overtime_payment_collected':
          case 'payment_confirmed':
          case 'payment_received':
          case 'payment_failed':
          case 'overtime_payment_capture_failed':
          case 'in_session_payment_failed': 
          case 'program_completed':
            return <Bell className="h-5 w-5 text-slate-600 dark:text-slate-400" />;
            case 'payout_on_hold':
               return <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />;
           case 'payout_released':
             return <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />;
          case 'refund_request_for_coach':
            return <Undo className="h-5 w-5 text-amber-600 dark:text-amber-500" />;
          case 'refund_request_escalated':
            return <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500" />;
          case 'refund_processed_coach':
            return <Receipt className="h-5 w-5 text-slate-600 dark:text-slate-400" />;
          case 'refund_processed_client':
            return <Receipt className="h-5 w-5 text-slate-600 dark:text-slate-400" />;
          case 'refund_request_client_escalated':
            return <ShieldQuestion className="h-5 w-5 text-red-700 dark:text-red-500" />;
          
          case 'user_content_hidden':
            return <EyeOff className="h-5 w-5 text-slate-500 dark:text-slate-400" />;
          case 'user_account_warning':
            return <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />;
          case 'user_account_suspended':
            return <ShieldBan className="h-5 w-5 text-red-600 dark:text-red-500" />;
          case 'report_actioned':
            return <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />;
          case 'report_dismissed':
            return <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
          case 'coach_verification_approved':
            return <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />;
          case 'coach_verification_rejected':
            return <ShieldX className="h-5 w-5 text-red-600 dark:text-red-500" />;
          case 'verification_expiring_soon':
            return <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
          case 'live_session_receipt_client':
            return <Receipt className="h-5 w-5 text-slate-600 dark:text-slate-400" />;
          case 'live_session_earnings_coach':
          case 'new_earning_coach': 
          return <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
          case 'overtime_payment_released':
            return <CheckSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />; 
          case 'session_ended':
          case 'overtime_prompt': 
          case 'overtime_declined': 
          case 'session_terminated': 
          case 'session_continued': 
            return <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
          case 'webinar_registration_confirmed_client':
          case 'webinar_new_attendee_coach':
          case 'payment_made_by_user':
          case 'webinar_attendee_cancelled':
          case 'webinar_registration_cancelled_by_you':
          case 'webinar_rescheduled_attendee_action_required':
          case 'webinar_attendance_reconfirmed':
          case 'webinar_cancellation_due_to_reschedule_confirmed':
            return <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />; 
          case 'upcoming_session_reminder':
            return <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
          case 'coach_cancelled_session':
            return <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500" />;
          case 'new_earning':
          case 'payout_initiated':
            return <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />;
            
          default:
            logger.warn(`[NotificationItemContent] No icon defined for type: ${type}`);
            return <Bell className="h-5 w-5 text-slate-600 dark:text-slate-400" />;
        }
      };

const renderTitle = () => {
    const standaloneNotificationTypes = [
        'webinar_registration_confirmed_client', 
        'webinar_new_attendee_coach', 
        'webinar_registration_cancelled_by_you', 
        'webinar_attendee_cancelled', 
        'webinar_rescheduled_attendee_action_required', 
        'webinar_attendance_reconfirmed', 
        'webinar_cancellation_due_to_reschedule_confirmed',
        'payment_received',
        'payment_made_by_user',
        'program_purchase_confirmed',
        'program_sale_coach',
        'program_comment_posted',
        'program_comment_reply',
        'new_program_review',
        'program_assignment_submitted',
        'program_completed',
        'payout_on_hold',
        'payout_released',
        'refund_request_for_coach',
        'refund_processed_coach',
        'refund_processed_client',
        'refund_request_escalated',
        'refund_request_client_escalated',
        'user_content_hidden',
        'user_account_warning',
        'user_account_suspended',
        'report_actioned',
        'report_dismissed',
        'coach_verification_approved',
        'coach_verification_rejected',
        'verification_expiring_soon',
    ];

    if (!sessionDetails && !standaloneNotificationTypes.includes(notification.type)) { 
      logger.warn('[NotificationItemContent.renderTitle] No sessionDetails and not a recognized standalone type.', { type: notification.type });
      return t('notifications:noSessionDetails', 'Session Details Unavailable');
    }
   
    const name = sessionDetails ? (isCoach() ? sessionDetails.clientName : sessionDetails.coachName) : (notification.content?.data?.coachName || notification.content?.data?.attendeeName || notification.metadata?.additionalData?.clientName || notification.metadata?.additionalData?.coachName);
    switch (notification.type) {
      case 'booking_request':
        return t('notifications:bookingRequestTitle', { name });
      case 'booking_confirmed':
        return t('notifications:bookingConfirmedTitle', { name });
      case 'booking_declined':
        return t('notifications:bookingDeclinedTitle', { name });
      case 'booking_cancelled_by_you':
        return t('notifications:booking_cancelled_by_you.title');
      case 'client_cancelled_booking':
        return t('notifications:client_cancelled_booking.title', { name });
         case 'booking_cancelled_by_coach': 
        return t('notifications:booking_cancelled_by_coach.title');
      case 'booking_rescheduled':
        return t('notifications:bookingUpdateTitle', { name });
      case 'coach_booking_request':
        return t('notifications:coach_booking_request.title', { name });
      case 'booking_confirmed_by_client':
        return t('notifications:booking_confirmed_by_client.title', { name });
      case 'booking_declined_by_client':
        return t('notifications:booking_declined_by_client.title', { name });
      case 'session_reminder':
        return t('notifications:sessionReminderTitle', { name });
      case 'payment_reminder':
        return t('notifications:payment_reminder.title', { name });
      case 'review_prompt_coach':
        return t('notifications:reviewPrompt.coach.title', { name });
      case 'review_prompt_client':
        return t('notifications:reviewPrompt.client.title', { name });
      case 'payment_received':
        return t('notifications:paymentReceivedTitle', { name: name || 'Someone' });
      case 'program_comment_posted':
        return t('notifications:program_comment_posted.title');
     case 'program_comment_reply':
        return t('notifications:program_comment_reply.title');
      case 'program_purchase_confirmed':
        return t('notifications:program_purchase_confirmed.title', 'Program Unlocked!');
      case 'program_sale_coach':
        return t('notifications:program_sale_coach.title', 'New Program Enrollment');
      case 'live_session_receipt_client':
        return t('notifications:live_session_receipt_client.title', 'Your Live Session Receipt');
      case 'live_session_earnings_coach':
        return t('notifications:live_session_earnings_coach.title', 'New Live Session Earnings');
      case 'new_earning_coach': 
        return t('notifications:new_earning_coach.title'); 
      case 'webinar_registration_confirmed_client':
        return t('notifications:webinar_registration_confirmed_client.title');
      case 'webinar_new_attendee_coach':
        return t('notifications:webinar_new_attendee_coach.title');
      case 'booking_confirmed_with_payment':
        return t('notifications:bookingConfirmedWithPaymentTitle', { name });
      case 'payment_made_by_user':
        return t('notifications:payment_made_by_user.title', { name: sessionDetails?.clientName || 'Someone' });
        case 'overtime_payment_captured':
          return t('notifications:overtime_payment_captured_title');
        case 'overtime_payment_released':
          return t('notifications:overtime_payment_released_title');
        case 'overtime_payment_collected':
          return t('notifications:overtime_payment_collected_title');
        case 'overtime_payment_capture_failed':
          return t('notifications:overtime_payment_capture_failed_title');
        case 'session_ended':
          return t('notifications:session_ended_title');
         case 'reschedule_confirmed_auto_client':
        return t('notifications:reschedule_confirmed_auto_client.title');
      case 'reschedule_confirmed_auto_coach':
        return t('notifications:reschedule_confirmed_auto_coach.title');
         case 'client_requested_reschedule': 
        return t('notifications:client_requested_reschedule.title', { name }); 
      case 'reschedule_request_sent_to_coach':
         return t('notifications:reschedule_request_sent_to_coach.title', { name });
      case 'your_booking_cancellation_confirmed':
        return t('notifications:your_booking_cancellation_confirmed.title');
     case 'webinar_registration_cancelled_by_you':
      return t('notifications:webinar_registration_cancelled_by_you.title');
   case 'webinar_attendee_cancelled':
      return t('notifications:webinar_attendee_cancelled.title');
      case 'reschedule_approved_by_coach':
        return t('notifications:reschedule_approved_by_coach.title');
      case 'reschedule_confirmed_notification':
        return t('notifications:reschedule_confirmed_notification.title');
      case 'reschedule_declined_by_coach':
        return t('notifications:reschedule_declined_by_coach.title', { name });
      case 'coach_proposed_new_reschedule_time':
        return t('notifications:coach_proposed_new_reschedule_time.title', { name });
      case 'reschedule_approved_by_client_client_confirm':
        return t('notifications:reschedule_approved_by_client_client_confirm.title');
      case 'reschedule_approved_by_client_coach_notif':
        return t('notifications:reschedule_approved_by_client_coach_notif.title', { name });
      case 'reschedule_declined_by_client_client_confirm':
        return t('notifications:reschedule_declined_by_client_client_confirm.title');
      case 'reschedule_declined_by_client_coach_notif':
        return t('notifications:reschedule_declined_by_client_coach_notif.title', { name });
      case 'reschedule_request_declined_confirmation': 
        return t('notifications:reschedule_request_declined_confirmation.title');
      case 'webinar_rescheduled_attendee_action_required':
        return t('notifications:webinar_rescheduled_attendee_action_required.title');
      case 'webinar_attendance_reconfirmed':
        return t('notifications:webinar_attendance_reconfirmed.title');
      case 'webinar_cancellation_due_to_reschedule_confirmed':
        return t('notifications:webinar_cancellation_due_to_reschedule_confirmed.title');
      case 'coach_counter_proposal_sent_to_client':
        return t('notifications:coach_counter_proposal_sent_to_client.title', { name });
      case 'coach_counter_proposed_reschedule_request':
        return t('notifications:coach_counter_proposed_reschedule_request.title', { name });
      case 'client_accepted_coach_counter_proposal':
        return t('notifications:client_accepted_coach_counter_proposal.title', { name });
      case 'client_declined_coach_counter_proposal':
        return t('notifications:client_declined_coach_counter_proposal.title', { name });
      case 'coach_counter_proposal_sent_to_client':
        return t('notifications:coach_counter_proposal_sent_to_client.title', { name });
      case 'new_program_review':
        return t('notifications:new_program_review.title');
      case 'program_assignment_submitted':
        return t('notifications:program_assignment_submitted.title');
      case 'program_completed':
        return t('notifications:program_completed.title');
      case 'payout_on_hold':
        return t('notifications:payout_on_hold_title');
      case 'payout_released':
        return t('notifications:payout_released_title');
        case 'refund_request_for_coach':
        return t('notifications:refund_request_for_coach.title');
      case 'refund_processed_coach':
        return t('notifications:refund_processed_coach.title');
       case 'refund_processed_client':
        return t('notifications:refund_processed_client.title');
      case 'refund_request_escalated':
        return t('notifications:refund_request_escalated.title');
      case 'refund_request_client_escalated':
        return t('notifications:refund_request_client_escalated.title');
       case 'user_content_hidden':
        return t('notifications:user_content_hidden.title');
      case 'user_account_warning':
        return t('notifications:user_account_warning.title');
      case 'user_account_suspended':
        return t('notifications:user_account_suspended.title');
      case 'report_actioned':
        return t('notifications:report_actioned.title');
      case 'report_dismissed':
        return t('notifications:report_dismissed.title');
      case 'coach_verification_approved':
        return t('notifications:coach_verification_approved.title');
      case 'coach_verification_rejected':
        return t('notifications:coach_verification_rejected.title');
      case 'verification_expiring_soon':
        return t('notifications:verification_expiring_soon.title');
      case 'upcoming_session_reminder':
        return t('notifications:upcoming_session_reminder.title', { name });
      case 'coach_cancelled_session':
        return t('notifications:coach_cancelled_session.title');
      case 'new_earning':
        return t('notifications:new_earning.title');
      case 'payout_initiated':
        return t('notifications:payout_initiated.title');
    default:
      const defaultTitleKey = `notifications:${notification.type}.title`;
      const specificTitle = t(defaultTitleKey, '');
      if (specificTitle && specificTitle !== defaultTitleKey) {
        return specificTitle;
      }
      return t('notifications:defaultTitle', { name });
    }
  };


const renderMessage = () => {
    const directMessage = notification.content?.message;
    const i18nTemplateForType = t(`notifications:${notification.type}.message`, ''); 

    let effectiveMessageTemplate = directMessage;
    if (!directMessage || directMessage === notification.type || !directMessage.includes('{{')) {
        if (i18nTemplateForType && i18nTemplateForType !== `notifications:${notification.type}.message` && i18nTemplateForType.includes('{{')) {
            effectiveMessageTemplate = i18nTemplateForType;
        } else if (directMessage && directMessage !== notification.type) {
            effectiveMessageTemplate = directMessage;
        } else {
            effectiveMessageTemplate = null; 
        }
    }
    logger.info('[FE DATA TRACE] renderMessage for type:', notification.type, '| content.data:', notification.content.data);

 const hasInterpolationPlaceholders = effectiveMessageTemplate?.includes('{{');
        const isSpecificWebinarTypeHandledInSwitch = ['webinar_registration_confirmed_client', 'webinar_new_attendee_coach', 'webinar_registration_cancelled_by_you', 'webinar_attendee_cancelled', 'webinar_rescheduled_attendee_action_required', 'webinar_attendance_reconfirmed', 'webinar_cancellation_due_to_reschedule_confirmed', 'payout_on_hold', 'payout_released'].includes(notification.type);
    const isRescheduleOutcomeType = [
        'reschedule_approved_by_coach', 'reschedule_confirmed_notification', 'reschedule_declined_by_coach', 
        'coach_proposed_new_reschedule_time', 'reschedule_approved_by_client_client_confirm', 
        'reschedule_approved_by_client_coach_notif', 'reschedule_declined_by_client_client_confirm',
        'reschedule_declined_by_client_coach_notif',
        'coach_counter_proposed_reschedule_request', 'client_accepted_coach_counter_proposal',
        'client_declined_coach_counter_proposal', 'coach_counter_proposal_sent_to_client'
   ].includes(notification.type);
    const isBaseRescheduleType = ['reschedule_confirmed_auto_client', 'reschedule_confirmed_auto_coach', 'reschedule_request_sent_to_coach', 'client_requested_reschedule'].includes(notification.type) || isRescheduleOutcomeType;
    const isSystemType = ['system_announcement', 'system_maintenance', 'system_update'].includes(notification.type);
    const isModerationType = ['user_content_hidden', 'user_account_warning', 'user_account_suspended', 'report_actioned', 'report_dismissed', 'coach_verification_approved', 'coach_verification_rejected', 'verification_expiring_soon'].includes(notification.type);

    if (!sessionDetails &&
        !isSpecificWebinarTypeHandledInSwitch &&
        !isSystemType &&
        !hasInterpolationPlaceholders && 
        !isBaseRescheduleType &&
        !isModerationType
       ) {
      if (directMessage && !directMessage.includes('{{') && directMessage !== notification.type) {
        return directMessage;
      }
      logger.warn('[NotificationItemContent.renderMessage] No sessionDetails and no viable message template with placeholders. Falling back.', { type: notification.type, directMessage, i18nTemplateForType, effectiveMessageTemplate });
      return t('notifications:noSessionDetails', 'Session Details Unavailable');
    }
    const additionalData = notification.metadata?.additionalData || {};
    const contentData = notification.content?.data || {};
    const nameFromContent = contentData.name || (isCoach() ? contentData.clientName : contentData.coachName);
    const nameFromSession = sessionDetails ? (isCoach() ? sessionDetails.clientName : sessionDetails.coachName) : undefined;
    const name = isCoach() ? (additionalData.clientName || sessionDetails?.clientName || contentData.clientName) : (additionalData.coachName || sessionDetails?.coachName || contentData.coachName);
    const clientName = additionalData.clientName || sessionDetails?.clientName || contentData.clientName || t('common:unknownUser', 'Unknown User');
    const coachName = additionalData.coachName || sessionDetails?.coachName || contentData.coachName || t('common:unknownUser', 'Unknown User');
    const userName = isCoach() ? clientName : coachName; 

const formatProposedSlots = (slots) => {
      if (!slots || !Array.isArray(slots) || slots.length === 0) return 'N/A';
      return slots.map(slot =>
        `${moment(slot.start).format('DD.MM.YYYY HH:mm')} - ${moment(slot.end).format('HH:mm')}`
      );
    };

     const cancellationReasonText = additionalData.cancellationReason && additionalData.cancellationReason.trim() !== "" && additionalData.cancellationReason !== t('common:notSpecified', 'Nicht angegeben') 
      ? additionalData.cancellationReason 
      : null;

    const reasonElement = cancellationReasonText ? (
      <div className="mt-2 text-xs italic text-slate-500 dark:text-slate-400 border-l-2 pl-2 border-slate-200 dark:border-slate-700">
        <span className="font-medium">{t('notifications:cancellationReasonPrefix')}:</span> {cancellationReasonText}
      </div>
    ) : null;
    
    const generalReasonText = additionalData.reason && additionalData.reason.trim() !== "" && additionalData.reason !== t('common:notSpecified', 'Nicht angegeben')
        ? additionalData.reason
        : null;

    const generalReasonElement = generalReasonText ? (
      <div className="mt-2 text-xs italic text-slate-500 dark:text-slate-400 border-l-2 pl-2 border-slate-200 dark:border-slate-700">
        <span className="font-medium">{t('notifications:reasonPrefix')}:</span> {generalReasonText}
      </div>
    ) : null;

    const tOptions = {
      name: name || t('common:unknownUser', 'Someone'),
      clientName,
      coachName,
      userName,
      sessionType: additionalData.sessionType || sessionDetails?.sessionType || contentData.sessionType || 'Session',
      sessionTitle: additionalData.sessionTitle || contentData.sessionTitle || sessionDetails?.sessionType || 'Sitzung',
      duration: contentData.duration || bookingData?.duration || 'unknown',
      date: sessionDetails?.start ? sessionDetails.start.format('DD.MM.YYYY') : additionalData.date || 'N/A',
      time: sessionDetails?.start ? sessionDetails.start.format('HH:mm') : additionalData.time || 'N/A',
      sessionDate: additionalData.startTime ? moment(additionalData.startTime).format('DD.MM.YYYY') : (sessionDetails?.start ? sessionDetails.start.format('DD.MM.YYYY') : additionalData.date || 'N/A'),
      sessionTime: additionalData.startTime ? moment(additionalData.startTime).format('HH:mm') : (sessionDetails?.start ? sessionDetails.start.format('HH:mm') : additionalData.time || 'N/A'),
       reminderMinutes: additionalData.reminderMinutes || (sessionDetails?.start ? Math.max(0, moment(sessionDetails.start).diff(moment(), 'minutes')) : 'N/A'),
      timeUntilStart: additionalData.timeUntilStart || (sessionDetails?.start ? Math.max(0, moment(sessionDetails.start).diff(moment(), 'minutes')) : 'N/A'),
      amount: contentData.amount !== undefined ? parseFloat(contentData.amount).toFixed(2) : (additionalData.amount !== undefined ? parseFloat(additionalData.amount).toFixed(2) : 'N/A'),
      currency: contentData.currency || additionalData.currency || 'CHF',
      refundAmount: additionalData.refundAmount !== undefined ? parseFloat(additionalData.refundAmount).toFixed(2) : 'N/A',
      refundCurrency: additionalData.refundCurrency || 'CHF',
      isRefundDue: additionalData.isRefundDue,
      sessionId: contentData.sessionId || additionalData.sessionId || 'N/A',
      error: contentData.error || additionalData.error || 'N/A',
      captureStatus: contentData.captureStatus || additionalData.captureStatus || 'N/A', 
      oldDate: additionalData.oldStartTime ? moment(additionalData.oldStartTime).format('DD.MM.YYYY') : (contentData.oldDate || 'N/A'),
      oldTime: additionalData.oldStartTime ? moment(additionalData.oldStartTime).format('HH:mm') : (contentData.oldTime || 'N/A'),
      newDate: additionalData.newStartTime ? moment(additionalData.newStartTime).format('DD.MM.YYYY') : (contentData.newDate || (sessionDetails?.start ? sessionDetails.start.format('DD.MM.YYYY') : 'N/A')),
      newTime: additionalData.newStartTime ? moment(additionalData.newStartTime).format('HH:mm') : (contentData.newTime || (sessionDetails?.start ? sessionDetails.start.format('HH:mm') : 'N/A')),
      originalDate: additionalData.originalStartTime ? moment(additionalData.originalStartTime).format('DD.MM.YYYY') : (additionalData.originalDate || (sessionDetails?.start ? sessionDetails.start.format('DD.MM.YYYY') : 'N/A')),
      originalTime: additionalData.originalStartTime ? moment(additionalData.originalStartTime).format('HH:mm') : (additionalData.originalTime || (sessionDetails?.start ? sessionDetails.start.format('HH:mm') : 'N/A')),
      proposedSlots: formatProposedSlots(additionalData.proposedSlots || contentData.proposedSlots),
      clientMessage: additionalData.clientMessage || contentData.clientMessage || t('common:none', 'None'),
      coachMessage: additionalData.coachMessage || contentData.coachMessage || t('common:none', 'None'),
      coachReason: additionalData.coachReason || contentData.coachReason || t('common:none', 'None'),
      declineReason: additionalData.declineReason || contentData.declineReason || t('common:notSpecified', '-'),
      cancellationReason: cancellationReasonText || t('common:notSpecified', '-'),
       programTitle: additionalData.programTitle || contentData.programTitle,
      lessonTitle: additionalData.lessonTitle || contentData.lessonTitle,
      commenterName: additionalData.commenterName || contentData.commenterName,
      reviewerName: additionalData.reviewerName || contentData.reviewerName,
      rating: additionalData.rating || contentData.rating,
      studentName: additionalData.studentName || contentData.studentName,
      replierName: additionalData.replierName || contentData.replierName,
      finalCost: contentData.finalCost,
      grossRevenue: contentData.grossRevenue,
      platformFee: contentData.platformFee,
      netPayout: contentData.netPayout,
      durationInMinutes: contentData.durationInSeconds ? Math.floor(contentData.durationInSeconds / 60) : 'N/A',
      durationInSecondsRemainder: contentData.durationInSeconds ? contentData.durationInSeconds % 60 : 'N/A',
      warning_count: contentData.warning_count || additionalData.warning_count,
      suspension_duration: contentData.suspension_duration || additionalData.suspension_duration,
      suspension_type: contentData.suspension_type || additionalData.suspension_type,
      suspension_end_date: contentData.suspension_end_date ? moment(contentData.suspension_end_date).format('DD.MM.YYYY HH:mm') : 'N/A',
      flag_reason_translation: t(`admin:flagReasons.${contentData.flag_reason_translation || additionalData.flag_reason_translation || 'general_guideline_violation'}`),
      truncated_review_comment: contentData.truncated_review_comment || additionalData.truncated_review_comment,
      rejection_reason: t(`admin:moderation.verifications.reasons.${contentData.rejection_reason || 'other'}`, t('admin:moderation.verifications.reasons.other', 'it does not meet our policy requirements')),
      expiry_date: contentData.expiry_date ? moment(contentData.expiry_date).format('DD.MM.YYYY') : 'N/A',
    };

    switch (notification.type) {
      case 'booking_request':
        return t('notifications:booking_request.message', tOptions);
      case 'booking_confirmed':
        return t('notifications:booking_confirmed.message', tOptions);
      case 'booking_confirmed_with_payment':
        if (!isCoach()) {
          return t('notifications:booking_confirmed_with_payment.message', tOptions);
        }
        return t('notifications:booking_confirmed.message', tOptions);
      case 'booking_declined':
        return t('notifications:booking_declined.message', tOptions);
      case 'booking_rescheduled':
        return t('notifications:bookingUpdateMessage', tOptions);
       case 'coach_booking_request':
        return t('notifications:coach_booking_request.message', tOptions);
      case 'booking_confirmed_by_client':
        return t('notifications:booking_confirmed_by_client.message', tOptions);
      case 'booking_declined_by_client':
        return t('notifications:booking_declined_by_client.message', tOptions);
      case 'session_reminder':
        return t('notifications:session_reminder.message', tOptions);
      case 'payment_reminder':
        return t('notifications:payment_reminder.message', tOptions);
     case 'payment_received': {
        const isWebinarPayment = bookingData?.bookingType === 'webinar' || contentData.bookingType === 'webinar' || additionalData.bookingType === 'webinar';
        const webinarTitle = contentData.webinarTitle || additionalData.webinarTitle || bookingData?.title || sessionDetails?.sessionType || t('notifications:sessionType.workshop', 'Webinar');
        const paymentReceivedContext = {
          ...tOptions,
          webinarTitle,
          coachName: contentData.coachName || sessionDetails?.coachName || t('common:unknownUser', 'Unknown User'),
          date: contentData.date || (sessionDetails?.start ? sessionDetails.start.format('DD.MM.YYYY') : additionalData.date || 'N/A'),
          time: contentData.time || (sessionDetails?.start ? sessionDetails.start.format('HH:mm') : additionalData.time || 'N/A'),
        };
        if (isWebinarPayment) {
          return t('notifications:payment_received_for_webinar.message', paymentReceivedContext);
        }
        return t('notifications:payment_received.message', tOptions);
      }
      case 'payment_made_by_user':
        return t('notifications:payment_made_by_user.message', tOptions);
      case 'webinar_registration_confirmed_client':
        const paymentStatusClientWebinarReg = contentData.paymentStatus || 'completed';
        const webinarRegClientContext = {
            webinarTitle: contentData.webinarTitle || additionalData.webinarTitle || bookingData?.title || sessionDetails?.sessionType || 'Webinar',
            coachName: contentData.coachName || sessionDetails?.coachName || t('common:unknownUser', 'Unknown User'),
            date: contentData.date || (sessionDetails?.start ? sessionDetails.start.format('DD.MM.YYYY') : additionalData.date || 'N/A'),
            time: contentData.time || (sessionDetails?.start ? sessionDetails.start.format('HH:mm') : additionalData.time || 'N/A'),
        };
        if (paymentStatusClientWebinarReg === 'pending') {
            return t('notifications:webinar_registration_confirmed_client.message_payment_pending', webinarRegClientContext);
        }
        return t('notifications:webinar_registration_confirmed_client.message', webinarRegClientContext);
      case 'webinar_new_attendee_coach':
        const webinarNewAttendeeCoachContext = {
            attendeeName: contentData.attendeeName || additionalData.attendeeName || t('common:aParticipant', 'A participant'),
            webinarTitle: contentData.webinarTitle || additionalData.webinarTitle || bookingData?.title || sessionDetails?.sessionType || 'Webinar',
            date: contentData.date || (sessionDetails?.start ? sessionDetails.start.format('DD.MM.YYYY') : additionalData.date || 'N/A'),
            time: contentData.time || (sessionDetails?.start ? sessionDetails.start.format('HH:mm') : additionalData.time || 'N/A'),
            currentAttendeeCount: contentData.currentAttendeeCount || additionalData.currentAttendeeCount || 'N/A',
        };
        return t('notifications:webinar_new_attendee_coach.message', webinarNewAttendeeCoachContext);
      case 'overtime_payment_captured':
        return t('notifications:overtime_payment_captured_message', tOptions);
      case 'overtime_payment_released':
        return t('notifications:overtime_payment_released_message', tOptions);
      case 'overtime_payment_collected':
        return t('notifications:overtime_payment_collected_message', tOptions);
      case 'overtime_payment_capture_failed':
        return t('notifications:overtime_payment_capture_failed_message', tOptions);
      case 'session_ended':
        const sessionEndedMessage = isCoach() 
            ? t('notifications:session_ended_message_coach', tOptions) 
            : t('notifications:session_ended_message_client', tOptions);
        return <>{sessionEndedMessage}{generalReasonElement}</>;
      case 'review_prompt_coach':
        return t('notifications:reviewPrompt.coach.message', { name });
      case 'review_prompt_client':
        return t('notifications:reviewPrompt.client.message', { name });
      case 'program_comment_posted':
        return t('notifications:program_comment_posted.message', tOptions);
      case 'program_comment_reply':
        return t('notifications:program_comment_reply.message', tOptions);
      case 'program_purchase_confirmed':
          return t('notifications:program_purchase_confirmed.message', {
              ...tOptions,
              programTitle: contentData.programTitle || additionalData.programTitle || sessionDetails?.sessionType || 'the program'
          });
      case 'program_sale_coach':
          return t('notifications:program_sale_coach.message', {
              ...tOptions,
              programTitle: contentData.programTitle || additionalData.programTitle || sessionDetails?.sessionType || 'the program',
              clientName: contentData.clientName || additionalData.clientName || 'A new student'
          });
      case 'live_session_receipt_client':
        return t('notifications:live_session_receipt_client.message', tOptions);
      case 'live_session_earnings_coach':
        return t('notifications:live_session_earnings_coach.message', tOptions);
      case 'new_earning_coach':
        return t('notifications:new_earning_coach.message', {
          netAmount: contentData.netAmount || '0.00',
          currency: contentData.currency || 'CHF',
          clientName: contentData.clientName || t('common:aClient', 'a client')
        });
      case 'payout_on_hold':
        return t('notifications:payout_on_hold_message', {
            payoutAmount: contentData.payoutAmount,
            currency: contentData.currency,
            adminReason: contentData.adminReason,
        });
      case 'payout_released':
        return t('notifications:payout_released_message', {
            payoutAmount: contentData.payoutAmount,
            currency: contentData.currency,
        });
      case 'booking_cancelled_by_you': {
        let refundDetailsMessage = '';
        if (tOptions.isRefundDue) {
            refundDetailsMessage = t('notifications:booking_cancelled_by_you.message_refund_due', { refundAmount: tOptions.refundAmount, refundCurrency: tOptions.refundCurrency });
        } else {
            refundDetailsMessage = t('notifications:booking_cancelled_by_you.message_no_refund');
        }
        return <>{t('notifications:booking_cancelled_by_you.message_part1', tOptions)}{reasonElement}{t('notifications:booking_cancelled_by_you.message_part2', { ...tOptions, refundDetails: refundDetailsMessage })}</>;
      }
      case 'client_cancelled_booking':
        return t('notifications:client_cancelled_booking.message', tOptions);
      case 'booking_cancelled_by_coach':
        let refundDetailsCoachCancelled = '';
        if (additionalData.isFullRefund) {
           refundDetailsCoachCancelled = t('notifications:booking_cancelled_by_coach.message_refund_details', { refundAmount: tOptions.refundAmount, refundCurrency: tOptions.refundCurrency });
        }
        if (additionalData.isWebinar) {
            return <>{t('notifications:booking_cancelled_by_coach.message_webinar_part1', tOptions)}{reasonElement}{t('notifications:booking_cancelled_by_coach.message_webinar_part2', {...tOptions, refundDetails: refundDetailsCoachCancelled})}</>;
        }
        return <>{t('notifications:booking_cancelled_by_coach.message_part1', tOptions)}{reasonElement}{t('notifications:booking_cancelled_by_coach.message_part2', {...tOptions, refundDetails: refundDetailsCoachCancelled})}</>;
      case 'reschedule_confirmed_auto_client':
        return t('notifications:reschedule_confirmed_auto_client.message', tOptions);
      case 'reschedule_confirmed_auto_coach':
        return t('notifications:reschedule_confirmed_auto_coach.message', tOptions);
      case 'reschedule_request_sent_to_coach':
        return t('notifications:reschedule_request_sent_to_coach.message', tOptions);
      case 'client_requested_reschedule': {
        const { proposedSlots, clientMessage, ...restOptions } = tOptions;
        const slotsArray = Array.isArray(proposedSlots) ? proposedSlots : (typeof proposedSlots === 'string' && proposedSlots !== 'N/A' ? [proposedSlots] : []);
        const reasonElement = clientMessage && clientMessage.trim() !== "" && clientMessage !== t('common:none', 'None') ? (
            <div className="mt-2 text-xs italic text-slate-500 dark:text-slate-400 border-l-2 pl-2 border-slate-200 dark:border-slate-700">
                <span className="font-medium">{t('notifications:reasonPrefix')}:</span>
                <blockquote className="mt-1 whitespace-pre-wrap">{clientMessage}</blockquote>
            </div>
        ) : null;

        return (
          <>
            <p>{t('notifications:client_requested_reschedule.message', restOptions)}</p>
            {slotsArray.length > 0 && (
              <ul className="list-disc list-inside ml-4 my-1 text-sm">
                {slotsArray.map((slotString, index) => (
                  <li key={index}>{slotString}</li>
                ))}
              </ul>
            )}
            {reasonElement}
          </>
        );
      }
      case 'your_booking_cancellation_confirmed':
        const availabilityMessagePartCoach = additionalData.availabilityRestored ? t('notifications:your_booking_cancellation_confirmed.message_availability_restored') : '';
        if (additionalData.isWebinar) {
            return <>{t('notifications:your_booking_cancellation_confirmed.message_webinar_part1', tOptions)}{reasonElement}{t('notifications:your_booking_cancellation_confirmed.message_webinar_part2', {...tOptions, availabilityDetails: availabilityMessagePartCoach})}</>;
        }
        return <>{t('notifications:your_booking_cancellation_confirmed.message_part1', tOptions)}{reasonElement}{t('notifications:your_booking_cancellation_confirmed.message_part2', {...tOptions, availabilityDetails: availabilityMessagePartCoach})}</>;
    case 'webinar_registration_cancelled_by_you': {
        const ad = notification.metadata?.additionalData || {};
        const opts = {
          webinarTitle: ad.webinarTitle || bookingData?.title || contentData.webinarTitle || t('common:unknownWebinar', 'The Webinar'),
          coachName: ad.coachName || bookingData?.coach?.firstName + ' ' + bookingData?.coach?.lastName || contentData.coachName || t('common:theCoach', 'The Coach'),
          webinarDate: ad.webinarDate ? moment(ad.webinarDate).format('DD.MM.YYYY') : (bookingData?.start ? moment(bookingData.start).format('DD.MM.YYYY') : (contentData.date || 'N/A')),
          webinarTime: ad.webinarDate ? moment(ad.webinarDate).format('HH:mm') : (bookingData?.start ? moment(bookingData.start).format('HH:mm') : (contentData.time || 'N/A')),
          refundAmount: ad.refundAmount !== undefined ? parseFloat(ad.refundAmount).toFixed(2) : 'N/A',
          refundCurrency: ad.refundCurrency || 'CHF',
          isRefundDue: ad.isRefundDue,
          cancellationReason: ad.cancellationReason || t('common:notSpecified', '-')
        };

         const webinarCancellationReasonText = ad.cancellationReason && ad.cancellationReason.trim() !== "" && ad.cancellationReason !== t('common:notSpecified', 'Nicht angegeben') 
            ? ad.cancellationReason 
            : null;
        const webinarReasonElement = webinarCancellationReasonText ? (
            <div className="mt-2 text-xs italic text-slate-500 dark:text-slate-400 border-l-2 pl-2 border-slate-200 dark:border-slate-700">
              <span className="font-medium">{t('notifications:webinar_registration_cancelled_by_you.message_reason_prefix')}:</span> {webinarCancellationReasonText}
            </div>
          ) : null;
        
        let refundDetailsMessagePart = '';
        if (opts.isRefundDue === true) {
            refundDetailsMessagePart = t('notifications:webinar_registration_cancelled_by_you.message_refund_due', { refundAmount: opts.refundAmount, refundCurrency: opts.refundCurrency });
        } else if (opts.isRefundDue === false) { 
            refundDetailsMessagePart = t('notifications:webinar_registration_cancelled_by_you.message_no_refund');
        }

         return (
            <>
                {t('notifications:webinar_registration_cancelled_by_you.message_part1', opts)}
                {webinarReasonElement}
                {refundDetailsMessagePart && <span className="mt-2 block text-xs"> {refundDetailsMessagePart}</span>}
            </>
      );
      }
      case 'webinar_attendee_cancelled': {
        const ad = notification.metadata?.additionalData || {};
        const opts = {
          attendeeName: ad.attendeeName || contentData.attendeeName || t('common:aParticipant', 'A participant'),
          webinarTitle: ad.webinarTitle || bookingData?.title || contentData.webinarTitle || t('common:unknownWebinar', 'The Webinar'),
          webinarDate: ad.webinarDate ? moment(ad.webinarDate).format('DD.MM.YYYY') : (bookingData?.start ? moment(bookingData.start).format('DD.MM.YYYY') : (contentData.date || 'N/A')),
          webinarTime: ad.webinarDate ? moment(ad.webinarDate).format('HH:mm') : (bookingData?.start ? moment(bookingData.start).format('HH:mm') : (contentData.time || 'N/A')),
        };

        const attendeeCancellationReasonText = ad.cancellationReason && ad.cancellationReason.trim() !== "" && ad.cancellationReason !== t('common:notSpecified', 'Nicht angegeben')
            ? ad.cancellationReason
            : null;
        const attendeeReasonElement = attendeeCancellationReasonText ? (
            <div className="mt-2 text-xs italic text-slate-500 dark:text-slate-400 border-l-2 pl-2 border-slate-200 dark:border-slate-700">
                <span className="font-medium">{t('notifications:webinar_attendee_cancelled.message_reason_prefix')}:</span> {attendeeCancellationReasonText}
            </div>
        ) : null;

        return (
            <>
                {t('notifications:webinar_attendee_cancelled.message', opts)}
                {attendeeReasonElement}
            </>
        );
      }
      case 'reschedule_approved_by_coach':
        return t('notifications:reschedule_approved_by_coach.message', tOptions);
      case 'reschedule_confirmed_notification':
        return t('notifications:reschedule_confirmed_notification.message', tOptions);
    case 'reschedule_declined_by_coach':
        return t('notifications:reschedule_declined_by_coach.message', tOptions);
      case 'coach_proposed_new_reschedule_time': {
        const { proposedSlots, coachReason, ...restOptions } = tOptions;
        const slotsArray = Array.isArray(proposedSlots) ? proposedSlots : (typeof proposedSlots === 'string' && proposedSlots !== 'N/A' ? [proposedSlots] : []);
        const reasonElement = coachReason && coachReason.trim() !== "" && coachReason !== t('common:none', 'None') ? (
            <div className="mt-2 text-xs italic text-slate-500 dark:text-slate-400 border-l-2 pl-2 border-slate-200 dark:border-slate-700">
                <span className="font-medium">{t('notifications:reasonPrefix')}:</span>
                <blockquote className="mt-1 whitespace-pre-wrap">{coachReason}</blockquote>
            </div>
        ) : null;
        
        return (
          <>
            <p>{t('notifications:coach_proposed_new_reschedule_time.message', restOptions)}</p>
            {slotsArray.length > 0 && (
              <ul className="list-disc list-inside ml-4 my-1 text-sm">
                {slotsArray.map((slotString, index) => (
                  <li key={index}>{slotString}</li>
                ))}
              </ul>
            )}
            {reasonElement}
          </>
        );
      }
      case 'reschedule_approved_by_client_client_confirm':
        return t('notifications:reschedule_approved_by_client_client_confirm.message', tOptions);
      case 'reschedule_approved_by_client_coach_notif':
        return t('notifications:reschedule_approved_by_client_coach_notif.message', tOptions);
      case 'reschedule_declined_by_client_client_confirm':
        return t('notifications:reschedule_declined_by_client_client_confirm.message', tOptions);
      case 'reschedule_declined_by_client_coach_notif':
        return t('notifications:reschedule_declined_by_client_coach_notif.message', tOptions);
      case 'reschedule_request_declined_confirmation':
        return t('notifications:reschedule_request_declined_confirmation.message', tOptions);
      case 'webinar_rescheduled_attendee_action_required':
        return t('notifications:webinar_rescheduled_attendee_action_required.message', tOptions);
      case 'webinar_attendance_reconfirmed':
        return t('notifications:webinar_attendance_reconfirmed.message', tOptions);
      case 'coach_counter_proposal_sent_to_client': { 
        const clientOriginalSlotsFormatted = formatProposedSlots(additionalData.originalProposedSlots || contentData.originalProposedSlots);
        const coachNewSlotsFormatted = formatProposedSlots(additionalData.proposedSlots || contentData.proposedSlots);
        return t('notifications:coach_counter_proposal_sent_to_client.message', {
          ...tOptions,
          originalProposedSlots: clientOriginalSlotsFormatted,
          proposedSlots: coachNewSlotsFormatted // This tOption already formats proposedSlots
        });
      }
      case 'webinar_cancellation_due_to_reschedule_confirmed':
        return t('notifications:webinar_cancellation_due_to_reschedule_confirmed.message', tOptions);
         case 'coach_counter_proposed_reschedule_request': {
          const { proposedSlots, ...restOptions } = tOptions; // These are coach's new proposed slots
          const clientOriginalProposedSlots = Array.isArray(tOptions.originalProposedSlots) ? tOptions.originalProposedSlots : (typeof tOptions.originalProposedSlots === 'string' && tOptions.originalProposedSlots !== 'N/A' ? [tOptions.originalProposedSlots] : []);
          const coachNewProposedSlots = Array.isArray(proposedSlots) ? proposedSlots : (typeof proposedSlots === 'string' && proposedSlots !== 'N/A' ? [proposedSlots] : []);
        
          return (
            <>
              {t('notifications:coach_counter_proposed_reschedule_request.message', {
                ...restOptions,
                originalProposedSlots: clientOriginalProposedSlots.join(', '), // Or format better
                proposedSlots: coachNewProposedSlots.join(', ') // Or format better
              })}
            </>
          );
        }
      case 'client_accepted_coach_counter_proposal':
        return t('notifications:client_accepted_coach_counter_proposal.message', tOptions);
      case 'client_declined_coach_counter_proposal':
        return t('notifications:client_declined_coach_counter_proposal.message', tOptions);
      case 'coach_counter_proposal_sent_to_client':
        return t('notifications:coach_counter_proposal_sent_to_client.message', tOptions);
      case 'new_program_review':
        return t('notifications:new_program_review.message', tOptions);
      case 'program_assignment_submitted':
        return t('notifications:program_assignment_submitted.message', tOptions);
      case 'program_completed':
        return t('notifications:program_completed.message', tOptions);
      case 'refund_request_for_coach':
        return t('notifications:refund_request_for_coach.message', tOptions);
      case 'refund_processed_coach':
        return t('notifications:refund_processed_coach.message', tOptions);
      case 'refund_processed_client':
        return t('notifications:refund_processed_client.message', tOptions);
      case 'refund_request_escalated':
        return t('notifications:refund_request_escalated.message', tOptions);
       case 'refund_request_client_escalated':
        return t('notifications:refund_request_client_escalated.message', tOptions);
      case 'user_content_hidden':
        return <MarkdownRenderer text={t(`notifications:${notification.type}.message`, tOptions)} notification={notification} setActiveAuditId={setActiveAuditId} setShowAppealModal={setShowAppealModal} />;
      case 'user_account_warning':
        return <MarkdownRenderer text={t(`notifications:${notification.type}.message`, tOptions)} notification={notification} setActiveAuditId={setActiveAuditId} setShowAppealModal={setShowAppealModal} />;
      case 'user_account_suspended':
        return <MarkdownRenderer text={t(`notifications:${notification.type}.message`, tOptions)} notification={notification} setActiveAuditId={setActiveAuditId} setShowAppealModal={setShowAppealModal} />;
      case 'report_actioned':
        return t('notifications:report_actioned.message', tOptions);
       case 'report_dismissed':
        return t('notifications:report_dismissed.message', tOptions);
      case 'coach_verification_approved':
        return t('notifications:coach_verification_approved.message', tOptions);
      case 'coach_verification_rejected':
        return <MarkdownRenderer text={t(`notifications:${notification.type}.message`, tOptions)} notification={notification} setActiveAuditId={setActiveAuditId} setShowAppealModal={setShowAppealModal} />;
      case 'verification_expiring_soon':
        return t('notifications:verification_expiring_soon.message', tOptions);
      case 'upcoming_session_reminder':
        return t('notifications:upcoming_session_reminder.message', tOptions);
      case 'coach_cancelled_session':
        return t('notifications:coach_cancelled_session.message', tOptions);
      case 'new_earning':
        return t('notifications:new_earning.message', tOptions);
      case 'payout_initiated':
        return t('notifications:payout_initiated.message', tOptions);
      default:
        const defaultMessageText = t('notifications:defaultMessage', { name });
        return <>{defaultMessageText}{generalReasonElement}</>;
    }
  };

const handleAction = async (action, message = '') => {
    logger.info(`[NotificationItemContent] Handling action: ${action}`, {
      notificationId: notification._id,
      bookingId: normalizedBookingId,
      hasMessage: !!message
    });
    if (actionInProgress) return;
    setActionInProgress(action); 
    try {
      let result;
      switch (action) {
        case 'accept': {
          logger.info('[NotificationItemContent] Starting accept action');
          queryClient.setQueryData(['booking', normalizedBookingId], old => old ? ({
            ...old,
            status: 'confirmed'
          }) : undefined);
          queryClient.setQueryData('notifications', old => {
            if (!old) return [];
            return old.map(n => n._id === notification._id ? { ...n, status: 'actioned', actionResult: 'confirmed' } : n);
          });
          logger.info('[NotificationItemContent] Calling acceptBooking');
          result = await acceptBooking({
            bookingId: normalizedBookingId,
            message
          });
          logger.info('[NotificationItemContent] acceptBooking completed', result);
          queryClient.invalidateQueries('notifications');
          queryClient.invalidateQueries('coachSessions');
          break;
        }
        case 'decline': {
          logger.info('[NotificationItemContent] Starting decline action');
          queryClient.setQueryData(['booking', normalizedBookingId], old => old ? ({
            ...old,
            status: 'declined'
          }) : undefined);
          queryClient.setQueryData('notifications', old => {
            if (!old) return [];
            return old.map(n => n._id === notification._id ? { ...n, status: 'actioned', actionResult: 'declined' } : n);
          });
          logger.info('[NotificationItemContent] Calling declineBooking');
          result = await declineBooking({
            bookingId: normalizedBookingId,
            message
          });
          logger.info('[NotificationItemContent] declineBooking completed', result);
          queryClient.removeQueries(['booking', normalizedBookingId]);
          queryClient.invalidateQueries('notifications');
          queryClient.invalidateQueries('coachSessions');
          break;
        }
        case 'accept_by_client': {
            logger.info('[NotificationItemContent] Client accepting coach request', { bookingId: normalizedBookingId });
            result = await acceptBookingByClient({ bookingId: normalizedBookingId });
            break;
        }
        case 'decline_by_client': {
            logger.info('[NotificationItemContent] Client declining coach request', { bookingId: normalizedBookingId });
            result = await declineBookingByClient({ bookingId: normalizedBookingId, message });
            break;
        }
               case 'approve_reschedule_request': {
            const clientRequest = bookingData?.rescheduleRequests?.find(
                r => r.status === 'pending_coach_action' && 
                     r.proposedBy &&
                     bookingData.user && bookingData.user._id &&
                     r.proposedBy.toString() === bookingData.user._id.toString()
            );

            logger.info('[NotificationItemContent] Handling approve_reschedule_request:', {
                bookingId: normalizedBookingId,
                bookingDataExists: !!bookingData,
                clientRequestDetails: clientRequest,
                timestamp: new Date().toISOString()
            });

            if (clientRequest && clientRequest.proposedSlots && clientRequest.proposedSlots.length === 1) {
                if (!clientRequest._id) {
                    logger.error('[NotificationItemContent] Direct approval error: clientRequest._id is missing. Falling back to BDM.', {
                        bookingId: normalizedBookingId,
                        clientRequestData: clientRequest,
                        timestamp: new Date().toISOString()
                    });
                    setModalInitialAction('approve_reschedule_request');
                    setShowBookingModal(true);
                    return;
                }
                
                logger.info('[NotificationItemContent] Attempting direct approval for single client proposed slot.', {
                    bookingId: normalizedBookingId,
                    requestId: clientRequest._id.toString(),
                    selectedTime: clientRequest.proposedSlots[0],
                    timestamp: new Date().toISOString()
                });

                result = await respondToRescheduleRequestByCoach({
                    bookingId: normalizedBookingId,
                    requestId: clientRequest._id.toString(),
                    action: 'approve', 
                    selectedTime: clientRequest.proposedSlots[0],
                    coachMessage: t('notifications:rescheduleApprovedDefaultMessage', 'Reschedule request approved.')
                });
            } else if (clientRequest && clientRequest.proposedSlots && clientRequest.proposedSlots.length > 1) {
                logger.info('[NotificationItemContent] Client proposed multiple slots. Opening SuggestAlternativeTimeModal for coach to select.', { 
                    bookingId: normalizedBookingId,
                    clientRequestId: clientRequest._id,
                    proposedSlots: clientRequest.proposedSlots,
                    timestamp: new Date().toISOString()
                });
                setSuggestModalProps({
                    booking: bookingData,
                    currentUserRole: 'coach',
                    existingProposal: { 
                        proposerRole: 'client',
                        proposedSlots: clientRequest.proposedSlots,
                        proposerMessage: clientRequest.requestMessage,
                        requestId: clientRequest._id,
                        status: 'pending_coach_action' 
                    },
                    modeOverride: 'coach_select_from_client_proposal' 
                });
                setShowSuggestAlternativeTimeModal(true);
                return; 
            } else {
                logger.info('[NotificationItemContent] Condition for direct approval or multi-slot selection not met. Opening BookingDetailsModal.', { 
                    bookingId: normalizedBookingId, 
                    clientRequestFound: !!clientRequest,
                    proposedSlotsLength: clientRequest?.proposedSlots?.length,
                    clientRequestIdExists: !!clientRequest?._id,
                    timestamp: new Date().toISOString()
                });
                setModalInitialAction('approve_reschedule_request'); 
                setShowBookingModal(true);
                return; 
            }
            break;
        }
case 'suggest': 
  case 'counter_propose_reschedule_request': {
            const clientRequest = bookingData?.rescheduleRequests?.find(
                r => r.status === 'pending_coach_action' &&
                     r.proposedBy &&
                     bookingData.user && bookingData.user._id &&
                     r.proposedBy.toString() === bookingData.user._id.toString()
            );

            if (!clientRequest) {
                logger.error('[NotificationItemContent] Counter-propose action: Client request not found in bookingData.', { bookingId: normalizedBookingId });
                showToast({ type: 'error', message: t('notifications:errors.cannotCounterProposeGeneral', 'Could not prepare counter-proposal due to missing client request details.') });
                setActionInProgress(null);
                return;
            }

            logger.info('[NotificationItemContent] Setting up SuggestAlternativeTimeModal for coach counter-proposal.', {
                bookingId: normalizedBookingId,
                clientRequestId: clientRequest._id,
                clientProposedSlots: clientRequest.proposedSlots,
                clientMessage: clientRequest.requestMessage,
                timestamp: new Date().toISOString()
            });

            setSuggestModalProps({
                booking: bookingData,
                currentUserRole: 'coach',
                existingProposal: { // This is the client's proposal coach is responding to
                    proposerRole: 'client',
                    proposedSlots: clientRequest.proposedSlots,
                    proposerMessage: clientRequest.requestMessage,
                    requestId: clientRequest._id,
                    status: 'pending_coach_action'
                },
                modeOverride: 'coach_counter_propose' // New mode for this scenario
            });
            setShowSuggestAlternativeTimeModal(true);
            setActionInProgress(null); // Modal will handle its own loading state
            return; // Exit early, modal is shown
        }
        case 'decline_reschedule_request': {
            if (notification.type === 'client_requested_reschedule' && bookingData?.status === 'pending_reschedule_client_request') {
                const clientRequestForDecline = bookingData?.rescheduleRequests?.find(
                    r => r.status === 'pending_coach_action' &&
                         r.proposedBy &&
                         bookingData.user && bookingData.user._id &&
                         r.proposedBy.toString() === bookingData.user._id.toString()
                );

                if (!clientRequestForDecline?._id) {
                    logger.error('[NotificationItemContent] Decline reschedule error: clientRequest._id is missing for direct decline.', {
                        bookingId: normalizedBookingId,
                        clientRequestData: clientRequestForDecline,
                        timestamp: new Date().toISOString()
                    });
                    showToast({type: 'error', message: t('notifications:errors.cannotDeclineRescheduleGeneral', 'Could not decline reschedule request due to missing data.')});
                    setActionInProgress(null); 
                    return; 
                }

                const confirmDecline = window.confirm(t('notifications:confirmDeclineClientRescheduleRequest', "Are you sure you want to decline all proposed times by the client? The original booking time will remain active."));
                if (!confirmDecline) {
                    setActionInProgress(null); 
                    return; 
                }
                
                logger.info('[NotificationItemContent] Attempting direct decline of client reschedule request.', {
                    bookingId: normalizedBookingId,
                    requestId: clientRequestForDecline._id.toString(),
                    timestamp: new Date().toISOString()
                });
                result = await respondToRescheduleRequestByCoach({
                    bookingId: normalizedBookingId,
                    requestId: clientRequestForDecline._id.toString(),
                    action: 'decline',
                    coachMessage: t('notifications:rescheduleDeclinedDefaultMessage') 
                });
            } else {
                // Fallback to opening modal if conditions for direct decline aren't met (e.g., other types of decline)
                logger.info('[NotificationItemContent] Decline_reschedule_request: Conditions for direct decline not met, opening modal.', {
                    type: notification.type,
                    bookingStatus: bookingData?.status
                });
                setModalInitialAction(action); 
                setShowBookingModal(true); 
                setActionInProgress(null);
                return; 
            }
            break;
        }
case 'client_accept_coach_proposal': {
            const coachProposal = bookingData?.rescheduleRequests?.find(
                r => r.status === 'pending_client_action' &&
                     r.proposedBy &&
                     bookingData.coach && bookingData.coach._id &&
                     r.proposedBy.toString() === bookingData.coach._id.toString()
            );
            if (!coachProposal?._id) {
                logger.error('[NotificationItemContent] Could not accept coach proposal: No valid proposal ID found or proposal not found.', { bookingId: normalizedBookingId, coachProposal });
                showToast({ type: 'error', message: t('notifications:errors.cannotAcceptCoachProposalGeneral', 'Could not accept coach proposal due to missing data.') });
                return;
            }

            if (coachProposal.proposedSlots && coachProposal.proposedSlots.length === 1) {
                 logger.info('[NotificationItemContent] Client directly accepting single slot from coach proposal.', {
                    bookingId: normalizedBookingId,
                    requestId: coachProposal._id,
                    selectedTime: coachProposal.proposedSlots[0]
                });
                result = await respondToRescheduleRequestByClient({
                    bookingId: normalizedBookingId,
                    requestId: coachProposal._id.toString(),
                    action: 'approve',
                    selectedTime: coachProposal.proposedSlots[0],
                    clientMessage: t('notifications:clientAcceptedCoachProposalDefaultMessage', 'I accept this proposed time.')
                });
            } else if (coachProposal.proposedSlots && coachProposal.proposedSlots.length > 1) {
                logger.info('[NotificationItemContent] Coach proposed multiple slots. Opening SuggestAlternativeTimeModal for client to select.', {
                    bookingId: normalizedBookingId,
                    coachRequestId: coachProposal._id,
                    proposedSlots: coachProposal.proposedSlots
                });
                setSuggestModalProps({
                    booking: bookingData,
                    currentUserRole: 'client',
                    existingProposal: {
                        proposerRole: 'coach',
                        proposedSlots: coachProposal.proposedSlots,
                        proposerMessage: coachProposal.requestMessage,
                        requestId: coachProposal._id,
                        status: 'pending_client_action'
                    },
                    modeOverride: 'client_select_from_coach_proposal'
                });
                setShowSuggestAlternativeTimeModal(true);
                return; // Modal handles the rest
            } else {
                logger.error('[NotificationItemContent] Could not accept coach proposal: No slots found in proposal.', { bookingId: normalizedBookingId, coachProposal });
                showToast({ type: 'error', message: t('notifications:errors.cannotAcceptCoachProposalNoSlots', 'Cannot accept, no time slots were proposed.') });
                return; 
            }
            break;
        }
        case 'client_decline_coach_proposal': {
            const coachProposalForDecline = bookingData?.rescheduleRequests?.find(
                 r => r.status === 'pending_client_action' &&
                     r.proposedBy &&
                     bookingData.coach && bookingData.coach._id &&
                     r.proposedBy.toString() === bookingData.coach._id.toString()
            );
            if (!coachProposalForDecline?._id) {
                logger.error('[NotificationItemContent] Could not decline coach proposal: no valid proposal ID found.', { bookingId: normalizedBookingId });
                showToast({ type: 'error', message: t('notifications:errors.cannotDeclineCoachProposalGeneral', 'Could not decline coach proposal due to missing data.') });
                return;
            }
             const confirmDeclineCoachProposal = window.confirm(t('notifications:confirmDeclineCoachRescheduleProposal', "Are you sure you want to decline the coach's proposed new times? The original booking time will remain active."));
            if (!confirmDeclineCoachProposal) {
                setActionInProgress(null); 
                return; 
            }
            result = await respondToRescheduleRequestByClient({
                bookingId: normalizedBookingId,
                requestId: coachProposalForDecline._id.toString(),
                action: 'decline',
                // selectedTime: null, // Not needed for decline
                clientMessage: t('notifications:clientDeclinedCoachProposalDefaultMessage', "I cannot make any of these times.")
            });
            break;
        }
        case 'client_propose_new_time_to_coach': {
             const coachProposalContext = bookingData?.rescheduleRequests?.find(
                 r => r.status === 'pending_client_action' &&
                     r.proposedBy &&
                     bookingData.coach && bookingData.coach._id &&
                     r.proposedBy.toString() === bookingData.coach._id.toString()
            );
            if (!coachProposalContext?._id) {
                logger.error('[NotificationItemContent] Cannot initiate client counter-proposal: original coach proposal ID not found.', { bookingId: normalizedBookingId });
                showToast({ type: 'error', message: t('notifications:errors.cannotCounterProposeToCoachGeneral', 'Could not prepare to propose new times due to missing original proposal data.') });
                return;
            }
            logger.info('[NotificationItemContent] Client wants to propose new times to coach. Opening SuggestAlternativeTimeModal.', {
                bookingId: normalizedBookingId,
                originalCoachRequestId: coachProposalContext._id
            });
            setSuggestModalProps({
                booking: bookingData,
                currentUserRole: 'client',
                existingProposal: { // This is the coach's proposal client is responding to
                    proposerRole: 'coach',
                    proposedSlots: coachProposalContext.proposedSlots,
                    proposerMessage: coachProposalContext.requestMessage,
                    requestId: coachProposalContext._id,
                    status: 'pending_client_action'
                },
                modeOverride: 'client_counter_propose'
            });
            setShowSuggestAlternativeTimeModal(true);
            return; // Modal handles the rest
        }
        case 'pay_now': {
          logger.info('[NotificationItemContent] Starting pay_now action - opening BookingDetailsModal', {
            notificationId: notification._id,
            bookingId: normalizedBookingId,
          });
          setModalInitialAction('pay_now');
          setShowBookingModal(true); 
          setActionInProgress(null);
          return; 
        }
        default:
          logger.warn('[NotificationItemContent] Unknown action:', action);
          throw new Error(`Invalid action: ${action}`);
      }
      await markAsRead(notification._id);
      setIsActioned(true);
      logger.info('[NotificationItemContent] Action completed successfully:', {
        action,
        notificationId: notification._id,
        result,
      });
      showToast({
        type: 'success',
        message: t(`notifications:${action}Success`), 
      });
      onAction?.(action, result);
    } catch (error) {
      logger.error('[NotificationItemContent] Action failed:', {
        action,
        error: error.message || error.toString(),
        stack: error.stack,
      });
      if (action === 'accept' || action === 'decline') { 
        queryClient.setQueryData(['booking', normalizedBookingId], (old) => old ? ({
          ...old,
          status: 'requested',
        }) : undefined);
        queryClient.setQueryData('notifications', (old) => {
          if (!old) return [];
          return old.map((n) =>
            n._id === notification._id ? { ...n, status: 'pending', actionResult: null } : n
          );
        });
      }
      showToast({
        type: 'error',
        message: t('notifications:actionFailed'),
      });
    } finally {
        setActionInProgress(null); 
    }
  };

const renderContent = () => {
    if (isLoadingBooking) {
      return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
    }
    if (bookingError) {
      return <div className="p-4 text-center text-sm text-red-600 dark:text-red-400">{t('notifications:bookingLoadError')}</div>;
    }

    const displayStartTimeMoment = notification.createdAt ? moment(notification.createdAt) : null;
    const isAlreadyResolvedOrHandledGeneral = isActioned || notification.status === 'actioned' || ['confirmed', 'declined', 'cancelled_by_coach', 'cancelled_by_client', 'rescheduled', 'completed'].includes(bookingData?.status);
    const isClickable = !((['review_prompt_coach', 'review_prompt_client'].includes(notification.type)) && (notification.status === 'actioned' || isReviewSubmitted));

   return (
      <div className="w-full min-w-0 flex-1 cursor-pointer" onClick={onContainerClick}>
        <div className="relative py-4 pl-3 pr-10">
          <div className="absolute top-2 right-2">
            {isAlreadyResolvedOrHandledGeneral && renderStatusBadge()}
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10">
              {getNotificationIcon(notification.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div 
                  className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate"
                  onClick={isClickable ? (e) => {e.stopPropagation(); handleItemClick();} : undefined}
                >
                  {renderTitle()}
                </div>
                <div className="hidden sm:flex items-center gap-2 ml-auto flex-shrink-0 whitespace-nowrap">
                  {renderActions()}
                  {displayStartTimeMoment && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {displayStartTimeMoment.fromNow()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="pt-2 pl-12 sm:pl-14">
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {renderMessage()}
                  </div>
                  <div className="sm:hidden mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {renderActions()}
                    </div>
                    {displayStartTimeMoment && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {displayStartTimeMoment.fromNow()}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            className={cn("absolute bottom-1 right-1 h-6 w-6 flex-shrink-0 rounded-full text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200", isExpanded && 'bg-slate-100 dark:bg-slate-800')}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isExpanded && 'rotate-180')} />
          </Button>
        </div>
      </div>
    );
  };

 return (
    <>
      {renderContent()}
      {showBookingModal && (
  <BookingDetailsModal
    bookingId={normalizedBookingId}
    onClose={() => {
      logger.info('[NotificationItemContent] BookingDetailsModal closed', {
        notificationId: notification._id,
        bookingId: normalizedBookingId,
        timestamp: new Date().toISOString(),
      });
      setShowBookingModal(false);
      setModalInitialAction(null);
    }}
    onSuggest={async (suggestedTime) => {
      try {
        const result = await suggestAlternativeTime(normalizedBookingId, suggestedTime);
        handleActionComplete('suggest', false, result);
        setShowBookingModal(false);
      } catch (error) {
        logger.error('[NotificationItemContent] Error suggesting time:', {
          error: error.message,
          stack: error.stack,
          notificationId: notification._id,
          timestamp: new Date().toISOString(),
        });
        showToast({
          type: 'error',
          message: t('common:errors.suggestionFailed'),
        });
      }
    }}
    existingBooking={bookingData}
    isLoading={isLoadingBooking}
    source="notification"
    initialAction={modalInitialAction}
  />
)}
      {showReviewModal && (
        <ReviewModal
          bookingId={normalizedBookingId}
          liveSessionId={notification.metadata?.liveSessionId}
          notificationId={notification._id}
          notificationType={notification.type}
          onClose={() => {
            logger.info('[NotificationItemContent] Review modal closed:', {
              type: notification.type,
              bookingId: normalizedBookingId,
            });
            setShowReviewModal(false);
          }}
          onSubmit={handleReviewSubmit}
        />
      )}
      {showSuggestAlternativeTimeModal && bookingData && (
        <SuggestAlternativeTimeModal
          isOpen={showSuggestAlternativeTimeModal}
          onClose={() => {
            setShowSuggestAlternativeTimeModal(false);
            setSuggestModalProps({});
          }}
          booking={suggestModalProps.booking || bookingData}
          bookingId={normalizedBookingId}
          currentUserRole={suggestModalProps.currentUserRole || (isCoach() ? 'coach' : 'client')}
          existingProposal={suggestModalProps.existingProposal}
          modeOverride={suggestModalProps.modeOverride}
          onCoachRespondToClientRequest={async (bId, reqId, act, selTime, counterSlots, msg) => {
            try {
                const apiResult = await respondToRescheduleRequestByCoach({
                    bookingId: bId,
                    requestId: reqId,
                    action: act,
                    selectedTime: selTime,
                    proposedSlots: counterSlots, 
                    coachMessage: msg,
                });
                logger.info('[NotificationItemContent] Coach responded to client request via SuggestModal:', { result: apiResult });
                queryClient.invalidateQueries(['booking', bId]);
                queryClient.invalidateQueries('notifications');
                queryClient.invalidateQueries(['coachSessions', user?._id]);
                setShowSuggestAlternativeTimeModal(false);
                setIsActioned(true);
                showToast({ type: 'success', message: t(`notifications:${act}Success`) || t('notifications:coachRescheduleResponseSuccess')});
                onAction?.(act, apiResult);
            } catch (err) {
                logger.error('[NotificationItemContent] Error from onCoachRespondToClientRequest (SuggestModal):', err);
                showToast({ type: 'error', message: err.message || t('common:errors.actionFailed') });
            }
          }}
          onSubmitProposal={async (payload) => { 
            logger.warn('[NotificationItemContent] Generic onSubmitProposal called from SuggestModal unexpectedly in coach_select flow', payload);
          }}
          onCoachSubmitProposal={async (bId, slots, msg) => { 
             try {
                const apiResult = await respondToRescheduleRequestByCoach({
                    bookingId: bId,
                    requestId: suggestModalProps.existingProposal?.requestId,
                    action: 'counter_propose',
                    proposedSlots: slots,
                    coachMessage: msg,
                });
                logger.info('[NotificationItemContent] Coach counter-proposed via SuggestModal:', { result: apiResult });
                queryClient.invalidateQueries(['booking', bId]);
                queryClient.invalidateQueries('notifications');
                setShowSuggestAlternativeTimeModal(false);
                setIsActioned(true);
                showToast({ type: 'success', message: t('notifications:proposeNewTimeSuccess')});
                onAction?.('counter_propose_reschedule_request', apiResult);
            } catch (err) {
                 logger.error('[NotificationItemContent] Error from onCoachSubmitProposal (SuggestModal):', err);
                showToast({ type: 'error', message: err.message || t('common:errors.actionFailed') });
            }
          }}
          onClientRespondToCoachProposal={async (bId, reqId, act, selTime, cliMsg, proposedNewSlots) => {
            try {
                const apiResult = await respondToRescheduleRequestByClient({
                    bookingId: bId,
                    requestId: reqId,
                    action: act,
                    selectedTime: selTime,
                    clientMessage: cliMsg,
                    proposedSlots: proposedNewSlots, // For 'counter_propose' action
                });
                logger.info('[NotificationItemContent] Client responded to coach proposal via SuggestModal:', { result: apiResult });
                queryClient.invalidateQueries(['booking', bId]);
                queryClient.invalidateQueries('notifications');
                queryClient.invalidateQueries(['userSessions', user?._id]); // or relevant client session queries
                setShowSuggestAlternativeTimeModal(false);
                setIsActioned(true);
                showToast({ type: 'success', message: t(`notifications:${act}ClientSuccess`) || t('notifications:clientRescheduleResponseSuccess')});
                onAction?.(act, apiResult);
            } catch (err) {
                logger.error('[NotificationItemContent] Error from onClientRespondToCoachProposal (SuggestModal):', err);
                showToast({ type: 'error', message: err.message || t('common:errors.actionFailed') });
            }
          }}
          onClientRespond={async () => {
            logger.warn('[NotificationItemContent] onClientRespond called from SuggestModal unexpectedly in this flow');
          }}
          onClientProposeInitialReschedule={async () => {
            logger.warn('[NotificationItemContent] onClientProposeInitialReschedule called from SuggestModal unexpectedly in this flow');
          }}
        />
      )}
       {showRefundResponseModal && bookingData && (
        <RefundResponseModal
          booking={bookingData}
          isOpen={showRefundResponseModal}
          onClose={() => setShowRefundResponseModal(false)}
        />
      )}
      {showAppealModal && activeAuditId && (
        <AppealModal
          isOpen={showAppealModal}
          onClose={() => {
            setShowAppealModal(false);
            setActiveAuditId(null);
          }}
          auditId={activeAuditId}
        />
      )}
    </>
  );
};

NotificationItemContent.propTypes = {
  notification: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    status: PropTypes.string,
    content: PropTypes.shape({
      title: PropTypes.string,
      message: PropTypes.string,
      data: PropTypes.object,
    }),
    metadata: PropTypes.shape({
      bookingId: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.shape({
          _id: PropTypes.string,
          id: PropTypes.string
        })
      ]),
      coachId: PropTypes.string,
      clientId: PropTypes.string,
      profilePicture: PropTypes.string,
      start: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
      end: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
      actionResult: PropTypes.string,
      additionalData: PropTypes.object,
      
    })
  }).isRequired,
  onAction: PropTypes.func.isRequired,
  bookingData: PropTypes.object,
  isLoadingBooking: PropTypes.bool,
  isExpanded: PropTypes.bool,
  onToggleExpand: PropTypes.func,
  onClientRespond: PropTypes.func,
};

export default NotificationItemContent;