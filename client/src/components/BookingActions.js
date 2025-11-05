
import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Check, X, Clock, Calendar, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBookingActions } from '../hooks/useBookingActions';
import { useNotificationActions } from '../hooks/useNotificationActions';
// ActionButton component from ui/ActionButton is not provided, assuming ActionButtonComponent is the one to use.
// import ActionButton from '../components/ui/ActionButton'; 
import { useToast } from '../hooks/useToast';
import { useMessageInput } from '../hooks/useMessageInput';
import LinkButton from '../components/ui/LinkButton';
import { logger } from '../utils/logger';
import SuggestAlternativeTimeModal from './SuggestAlternativeTimeModal'; 
import { useAuth } from '../contexts/AuthContext';

const ActionButtonComponent = ({ icon: Icon, onClick, title, disabled, className }) => (
  <button
    onClick={onClick}
    disabled={disabled || !onClick}
    className={`action-button ${className || ''} flex items-center justify-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed`}
    title={title}
  >
    {Icon && <Icon className="w-4 h-4 mr-2" />}
    <span>{title}</span>
  </button>
);

const BookingActions = ({ 
  booking, 
  notificationId = null, 
  onActionComplete,
  onCancelBookingInitiate, 
  onClientRescheduleInitiate,
  onSuggestReschedule,
  variant = 'default',
  className = '',
  availableActions
}) => {
  const { t } = useTranslation(['bookings', 'common']);
  const { user } = useAuth();
  const { 
    showMessage, 
    message, 
    toggleMessageInput, 
    handleMessageChange, 
    setShowMessage 
  } = useMessageInput();
  const { acceptBooking, declineBooking, suggestAlternativeTime, proposeRescheduleByCoach, isLoading } = useBookingActions();
  const { markAsRead } = useNotificationActions();
  const { showToast } = useToast();
  const [suggestModalState, setSuggestModalState] = useState({ show: false, actionType: null });


  logger.debug('[BookingActions] Initializing:', {
    bookingId: booking?._id,
    notificationId,
    variant,
    status: booking?.status,
    hasOnActionComplete: !!onActionComplete
  });

  // Removed redundant ActionButton definition inside BookingActions component scope.
  // The ActionButtonComponent defined at the top of the file will be used.

   const handleAction = useCallback(async (actionType, messageContent = '', times = null) => {
    try {
      logger.info('[BookingActions] Executing internal action:', { 
        action: actionType, 
        bookingId: booking._id,
        hasTimes: !!times,
        hasMessage: !!messageContent
      });
  
      if (onActionComplete) {
        onActionComplete(actionType, true); 
      }
  
      let result;
      switch (actionType) {
        case 'accept':
          result = await acceptBooking({ bookingId: booking._id, message: messageContent });
          break;
        case 'decline':
          result = await declineBooking({ bookingId: booking._id, message: messageContent });
          break;
        case 'coach_suggest_reschedule': 
          result = await suggestAlternativeTime({ bookingId: booking._id, times, message: messageContent });
          break;
        case 'coach_initiate_reschedule': 
          const rescheduleData = { proposedSlots: times, reason: messageContent };
          result = await proposeRescheduleByCoach({ bookingId: booking._id, data: rescheduleData });
          break;
        default:
          logger.warn('[BookingActions] Unknown internal action type:', actionType);
          if (onActionComplete) {
            onActionComplete(actionType, false, null, new Error(`Unknown action: ${actionType}`));
          }
          return;
      }

      if (notificationId) {
        await markAsRead(notificationId);
        logger.info('[BookingActions] Marked notification as read:', notificationId);
      }

      logger.info('[BookingActions] Internal action completed successfully:', {
        action: actionType,
        bookingId: booking._id,
        result
      });

      if (onActionComplete) {
        onActionComplete(actionType, false, result); 
      }
    } catch (error) {
      logger.error('[BookingActions] Internal action failed:', {
        action: actionType,
        bookingId: booking._id,
        error: error.message
      });
      
      if (onActionComplete) {
        onActionComplete(actionType, false, null, error); 
      }
    }
  }, [booking._id, acceptBooking, declineBooking, suggestAlternativeTime, proposeRescheduleByCoach, markAsRead, notificationId, onActionComplete]);

  const handleSuggestTimeSubmit = useCallback((suggestedTimes, messageText) => {
    const actionType = suggestModalState.actionType;
    if (!actionType) {
      logger.error('[BookingActions] Suggest modal submitted without actionType. Cannot proceed.');
      showToast('error', t('common:errorOccurred')); // Generic error
      setSuggestModalState({ show: false, actionType: null });
      return;
    }

    logger.info(`[BookingActions] Submitting from SuggestAlternativeTimeModal for action: ${actionType}`, { 
      bookingId: booking._id, 
      suggestedTimes, 
      hasMessage: !!messageText 
    });

    handleAction(actionType, messageText, suggestedTimes)
      .catch(error => {
        logger.error(`[BookingActions] Error during handleAction for ${actionType}:`, error);
        // Toast for specific action might be better if translated string keys exist
        showToast('error', t(actionType === 'coach_initiate_reschedule' ? 'bookings:proposeRescheduleError' : 'bookings:suggestTimeError'));
      })
      .finally(() => setSuggestModalState({ show: false, actionType: null }));
  }, [booking._id, handleAction, showToast, t, suggestModalState.actionType]);

  // This handleSuggestTime is not used by the modal submission path currently.
  // It might be part of an older or different flow.
  // If it were used and `handleAction('suggest', ...)` was called, it would hit the default case in `handleAction`.
  const handleSuggestTime = useCallback((suggestedTimes, message) => {
    logger.info('[BookingActions] Suggesting alternative times (via handleSuggestTime - likely unused):', { 
      bookingId: booking._id, 
      suggestedTimes, 
      hasMessage: !!message 
    });
    // This 'suggest' action type does not exist in the handleAction switch explicitly.
    // It would fall into the default case.
    handleAction('suggest', message, suggestedTimes)
      .catch(error => {
        logger.error('[BookingActions] Error suggesting alternative time (via handleSuggestTime):', error);
        showToast('error', t('bookings:suggestTimeError'));
      })
      .finally(() => setSuggestModalState({ show: false, actionType: null })); // Assuming this should also close the unified modal
  }, [booking._id, handleAction, showToast, t]);

  const renderMessageInput = () => {
    if (!showMessage) return null;

    return (
      <div className="message-placeholder mt-2 p-3 bg-gray-50 rounded text-sm text-gray-500">
        {t('bookings:messagingComingSoon')}
        <button 
          onClick={() => setShowMessage(false)}
          className="ml-2 text-primary hover:text-primary-dark"
        >
          {t('common:close')}
        </button>
      </div>
    );
  };

  const renderActions = () => {
    const baseProps = { disabled: isLoading };
    const actionsMap = {
      accept: (
        <ActionButtonComponent
          key="accept"
          icon={Check}
          onClick={() => handleAction('accept')}
          title={t('bookings:actions.accept')}
          {...baseProps}
        />
      ),
      decline: (
        <ActionButtonComponent
          key="decline"
          icon={X}
          onClick={() => handleAction('decline')}
          title={t('bookings:actions.decline')}
          {...baseProps}
        />
      ),
      coach_suggest_reschedule: (
        <ActionButtonComponent
          key="coach_suggest_reschedule"
          icon={Clock}
          onClick={() => setSuggestModalState({ show: true, actionType: 'coach_suggest_reschedule' })}
          title={t('bookings:actions.suggestTime')}
          {...baseProps}
        />
      ),
      coach_initiate_reschedule: (
        <ActionButtonComponent
          key="coach_initiate_reschedule"
          icon={Calendar}
          onClick={() => setSuggestModalState({ show: true, actionType: 'coach_initiate_reschedule' })}
          title={t('bookings:actions.proposeReschedule')}
          {...baseProps}
        />
      ),
      coach_propose_alternatives: (
        <ActionButtonComponent
          key="coach_propose_alternatives"
          icon={Clock}
          onClick={onSuggestReschedule}
          title={t('bookings:actions.suggestTime')}
          {...baseProps}
        />
      ),
      client_respond_to_proposal: (
        <ActionButtonComponent
          key="client_respond_to_proposal"
          icon={Calendar}
          onClick={onSuggestReschedule}
          title={t('bookings:actions.respondToProposal')}
          {...baseProps}
        />
      ),
      client_reschedule_session: (
        <ActionButtonComponent
          key="client_reschedule_session"
          icon={Calendar}
          onClick={onClientRescheduleInitiate}
          title={t('bookings:actions.rescheduleSession')}
          {...baseProps}
        />
      ),
      cancel_by_client: (
       <ActionButtonComponent
        key="cancel_by_client"
        icon={X}
        onClick={onCancelBookingInitiate}
        title={t('bookings:actions.cancelBooking')}
        {...baseProps}
       />
      ),
      cancel_by_coach: (
       <ActionButtonComponent
        key="cancel_by_coach"
        icon={X}
        onClick={onCancelBookingInitiate} 
        title={t('bookings:actions.cancelBookingByCoach')}
        {...baseProps}
       />
      ),
      message: (
        <ActionButtonComponent
          key="message"
          icon={MessageSquare}
          onClick={() => setShowMessage(true)} 
          title={t('bookings:actions.addMessage')}
          {...baseProps}
        />
      ),
    };
  
    const effectiveActions = availableActions || [];
    logger.debug('[BookingActions] Effective actions to render:', effectiveActions);
    
    const buttonsToRender = effectiveActions.map(actionKey => actionsMap[actionKey]).filter(Boolean);

    if(buttonsToRender.length === 0) {
        logger.debug('[BookingActions] No actions to render based on availableActions prop.');
        return null;
    }

    switch (variant) {
      case 'compact':
      case 'icon-only': // For now, compact and icon-only will render the same small set
        return (
          <div className="flex space-x-1">
            {buttonsToRender}
          </div>
        );
      default: // 'default'
        return (
          <div className="flex flex-wrap gap-2">
            {buttonsToRender}
          </div>
        );
    }
  };

  return (
    <div className={className}>
      {renderActions()}
      {renderMessageInput()}
      {suggestModalState.show && (
        <SuggestAlternativeTimeModal
          booking={booking}
          onSuggest={handleSuggestTimeSubmit}
          onClose={() => setSuggestModalState({ show: false, actionType: null })}
        />
      )}
    </div>
  );
};

BookingActions.propTypes = {
  booking: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    coachId: PropTypes.string, // coachId might not always be present if booking.coach object is there
    coach: PropTypes.shape({ _id: PropTypes.string }),
    user: PropTypes.shape({ _id: PropTypes.string }),
    status: PropTypes.string.isRequired,
  }).isRequired,
  notificationId: PropTypes.string,
  onActionComplete: PropTypes.func,
  onCancelBookingInitiate: PropTypes.func,
  onClientRescheduleInitiate: PropTypes.func,
  onSuggestReschedule: PropTypes.func,
  variant: PropTypes.oneOf(['default', 'compact', 'icon-only']),
  className: PropTypes.string,
  availableActions: PropTypes.arrayOf(PropTypes.string),
};

export default BookingActions;