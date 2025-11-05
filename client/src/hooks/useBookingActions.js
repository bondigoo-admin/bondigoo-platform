import { useMutation, useQueryClient } from 'react-query';
import { 
  acceptBooking, 
  declineBooking, 
  suggestAlternativeTime, 
  proposeRescheduleByCoach as apiProposeRescheduleByCoach,
  respondToRescheduleRequestByCoach as apiRespondToRescheduleRequestByCoach,
  respondToRescheduleRequestByClient,
    acceptBookingByClient as apiAcceptBookingByClient,
  declineBookingByClient as apiDeclineBookingByClient
} from '../services/bookingAPI';
import { useToast } from './useToast';
import { useTranslation } from 'react-i18next';
import { logger } from '../utils/logger';
import { toast } from 'react-hot-toast';

export const useBookingActions = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation(['bookings', 'common']);

  const handleMutationResponse = (action, data) => {
    logger.info(`[useBookingActions] ${action} action successful:`, data);
    queryClient.invalidateQueries('bookings');
    queryClient.invalidateQueries(['booking', data?.booking?._id || data?._id]);
    queryClient.invalidateQueries('notifications');
    queryClient.invalidateQueries('coachDashboard');
    showToast('success', t(`bookings:${action}Success`));
    return data;
  };
  
  const handleMutationError = (error, action) => {
    logger.error(`[useBookingActions] ${action} action error:`, error);
    showToast('error', t('common:errorOccurred'));
    throw error;
  };

  const acceptMutation = useMutation(
    async ({ bookingId, message }) => {
      logger.info('[useBookingActions] Accepting booking:', { bookingId, hasMessage: !!message });
      let attempts = 0;
      const maxAttempts = 3;
  
      while (attempts < maxAttempts) {
        try {
          const result = await acceptBooking(bookingId, message);
          logger.info('[useBookingActions] Booking accepted successfully:', { bookingId, attempt: attempts + 1 });
          return result;
        } catch (error) {
          attempts++;
          if (error.response?.status === 500 && attempts < maxAttempts) {
            logger.warn('[useBookingActions] Retrying accept operation:', { bookingId, attempt: attempts });
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            logger.error('[useBookingActions] Failed to accept booking:', { bookingId, error: error.message });
            throw error;
          }
        }
      }
      throw new Error('Failed to accept booking after multiple attempts');
    },
    {
      onMutate: async ({ bookingId }) => {
        await queryClient.cancelQueries(['booking', bookingId]);
        await queryClient.cancelQueries('notifications');

        const previousBooking = queryClient.getQueryData(['booking', bookingId]);
        const previousNotifications = queryClient.getQueryData('notifications');

        queryClient.setQueryData(['booking', bookingId], old => old ? ({
          ...old,
          status: 'confirmed'
        }) : undefined);

        queryClient.setQueryData('notifications', old => 
          old?.map(notification => 
            notification.metadata?.bookingId === bookingId
              ? { ...notification, status: 'actioned', actionResult: 'confirmed' }
              : notification
          )
        );

        return { previousBooking, previousNotifications };
      },
      onSuccess: (data, { bookingId }) => {
        handleMutationResponse('accept', data);
      },
      onError: (error, { bookingId }, context) => {
        if (context?.previousBooking) {
          queryClient.setQueryData(['booking', bookingId], context.previousBooking);
        }
        if (context?.previousNotifications) {
          queryClient.setQueryData('notifications', context.previousNotifications);
        }
        handleMutationError(error, 'accept');
      },
       onSettled: (data) => {
        queryClient.invalidateQueries('bookings');
        queryClient.invalidateQueries(['booking', data?.booking?._id || data?._id]);
        queryClient.invalidateQueries('notifications');
        queryClient.invalidateQueries('coachDashboard');
      },
    }
  );
  
  const declineMutation = useMutation(
    async ({ bookingId, message }) => {
      logger.info('[useBookingActions] Declining booking:', { bookingId, hasMessage: !!message });
      let attempts = 0;
      const maxAttempts = 3;
  
      while (attempts < maxAttempts) {
        try {
          const result = await declineBooking(bookingId, message);
          logger.info('[useBookingActions] Booking declined successfully:', { bookingId, attempt: attempts + 1 });
          return result;
        } catch (error) {
          attempts++;
          if (error.response?.status === 500 && attempts < maxAttempts) {
            logger.warn('[useBookingActions] Retrying decline operation:', { bookingId, attempt: attempts });
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
          } else {
            logger.error('[useBookingActions] Failed to decline booking:', { bookingId, error: error.message });
            throw error; // Rethrow the error to be caught by onError
          }
        }
      }
      throw new Error('Failed to decline booking after multiple attempts');
    },
    {
      onMutate: async ({ bookingId }) => {
        await queryClient.cancelQueries(['booking', bookingId]);
        await queryClient.cancelQueries('notifications');

        const previousBooking = queryClient.getQueryData(['booking', bookingId]);
        const previousNotifications = queryClient.getQueryData('notifications');

        queryClient.setQueryData(['booking', bookingId], old => old ? ({
          ...old,
          status: 'declined'
        }) : undefined);

        queryClient.setQueryData('notifications', old => 
          old?.map(notification => 
            notification.metadata?.bookingId === bookingId
              ? { ...notification, status: 'actioned', actionResult: 'declined' }
              : notification
          )
        );

        return { previousBooking, previousNotifications };
      },
      onSuccess: (data, { bookingId }) => {
        handleMutationResponse('decline', data);
        queryClient.removeQueries(['booking', bookingId]);
      },
      onError: (error, { bookingId }, context) => {
         if (context?.previousBooking) {
          queryClient.setQueryData(['booking', bookingId], context.previousBooking);
        }
        if (context?.previousNotifications) {
          queryClient.setQueryData('notifications', context.previousNotifications);
        }
        handleMutationError(error, 'decline');
      },
      onSettled: (data) => {
        queryClient.invalidateQueries('bookings');
         queryClient.invalidateQueries(['booking', data?.booking?._id || data?._id]);
        queryClient.invalidateQueries('notifications');
        queryClient.invalidateQueries('coachDashboard');
      },
    }
  );
  
 const suggestMutation = useMutation(
    ({ bookingId, times, message }) => suggestAlternativeTime(bookingId, times, message),
    {
      onSuccess: (data) => handleMutationResponse('suggest', data),
      onError: (error) => handleMutationError(error, 'suggest'),
      onSettled: (data, error, { bookingId }) => {
           queryClient.invalidateQueries(['booking', bookingId]);
        queryClient.invalidateQueries('bookings');
        queryClient.invalidateQueries('notifications');
        queryClient.invalidateQueries('coachDashboard');
      },
    }
  );

  const proposeRescheduleByCoachMutation = useMutation(
    ({ bookingId, data }) => apiProposeRescheduleByCoach(bookingId, data),
    {
      onSuccess: (data) => handleMutationResponse('proposeRescheduleByCoach', data),
      onError: (error) => handleMutationError(error, 'proposeRescheduleByCoach'),
      onSettled: (data, error, { bookingId }) => {
           queryClient.invalidateQueries(['booking', bookingId]);
        queryClient.invalidateQueries('bookings');
        queryClient.invalidateQueries('notifications');
        queryClient.invalidateQueries('coachDashboard');
      },
    }
  );

  const respondToRescheduleRequestByCoachMutation = useMutation(
    async (payload) => {
      const { bookingId, requestId, action, selectedTime, coachMessage, coachProposedTimes } = payload;
      logger.info('[useBookingActions] Responding to client reschedule request (coach action):', payload);
      return apiRespondToRescheduleRequestByCoach(bookingId, requestId, action, selectedTime, coachMessage, coachProposedTimes);
    },
    {
      onSuccess: (data) => handleMutationResponse('respondToRescheduleRequestByCoach', data),
      onError: (error) => handleMutationError(error, 'respondToRescheduleRequestByCoach'),
     onSettled: (data, error, { bookingId }) => {
           queryClient.invalidateQueries(['booking', bookingId]);
        queryClient.invalidateQueries('bookings');
        queryClient.invalidateQueries('notifications');
        queryClient.invalidateQueries('coachDashboard');
      }
    }
  );

  const respondToRescheduleRequestByClientMutation = useMutation(
    async (payload) => {
      const { bookingId, requestId, action, selectedTime, clientMessage, proposedSlots } = payload;
      logger.info('[useBookingActions] Responding to coach reschedule proposal (client action):', payload);
     return respondToRescheduleRequestByClient(bookingId, requestId, action, selectedTime, clientMessage, proposedSlots);
    },
    {
      onSuccess: (data) => handleMutationResponse('respondToRescheduleRequestByClient', data),
      onError: (error) => handleMutationError(error, 'respondToRescheduleRequestByClient'),
     onSettled: (data, error, { bookingId }) => {
        queryClient.invalidateQueries(['booking', bookingId]);
        queryClient.invalidateQueries('bookings');
        queryClient.invalidateQueries('notifications');
       queryClient.invalidateQueries('coachDashboard');
      }
    }
  );

  const acceptByClientMutation = useMutation(
    ({ bookingId }) => apiAcceptBookingByClient({ bookingId }),
    {
        onSuccess: (data) => handleMutationResponse('acceptByClient', data),
        onError: (error) => handleMutationError(error, 'acceptByClient'),
        onSettled: (data) => {
            queryClient.invalidateQueries('bookings');
            queryClient.invalidateQueries(['booking', data?.booking?._id]);
            queryClient.invalidateQueries('notifications');
        }
    }
);

const declineByClientMutation = useMutation(
    ({ bookingId, message }) => apiDeclineBookingByClient({ bookingId, message }),
    {
        onSuccess: (data) => handleMutationResponse('declineByClient', data),
        onError: (error) => handleMutationError(error, 'declineByClient'),
        onSettled: (data) => {
            queryClient.invalidateQueries('bookings');
            queryClient.invalidateQueries(['booking', data?.booking?._id]);
            queryClient.invalidateQueries('notifications');
        }
    }
);

return {
    acceptBooking: acceptMutation.mutateAsync,
    declineBooking: declineMutation.mutateAsync,
    suggestAlternativeTime: suggestMutation.mutateAsync, 
    proposeRescheduleByCoach: proposeRescheduleByCoachMutation.mutateAsync,
    respondToRescheduleRequestByCoach: respondToRescheduleRequestByCoachMutation.mutateAsync,
    respondToRescheduleRequestByClient: respondToRescheduleRequestByClientMutation.mutateAsync, 
    acceptBookingByClient: acceptByClientMutation.mutateAsync,
    declineBookingByClient: declineByClientMutation.mutateAsync,
    isLoading: acceptMutation.isLoading || declineMutation.isLoading || suggestMutation.isLoading || proposeRescheduleByCoachMutation.isLoading || respondToRescheduleRequestByCoachMutation.isLoading || respondToRescheduleRequestByClientMutation.isLoading || acceptByClientMutation.isLoading || declineByClientMutation.isLoading, 
    error: acceptMutation.error || declineMutation.error || suggestMutation.error || proposeRescheduleByCoachMutation.error || respondToRescheduleRequestByCoachMutation.error || respondToRescheduleRequestByClientMutation.error || acceptByClientMutation.error || declineByClientMutation.error,
  };
};