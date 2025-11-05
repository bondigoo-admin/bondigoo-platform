import { useMutation, useQueryClient } from 'react-query';
import * as refundAPI from '../services/refundAPI';
import { toast } from 'react-hot-toast';

export const useCreateRefundRequest = () => {
    const queryClient = useQueryClient();

    return useMutation(refundAPI.createRefundRequest, {
        onSuccess: (data, variables) => {
            
            queryClient.invalidateQueries(['booking', variables.bookingId]);
            queryClient.invalidateQueries('userSessions');
        },
        onError: (error) => {
            toast.error(error.response?.data?.message || "Failed to submit refund request.");
        },
    });
};

export const useRespondToRefundRequest = () => {
    const queryClient = useQueryClient();

   return useMutation(refundAPI.respondToRefundRequest, {
        onSuccess: (data) => {
            if (data?.booking) {
                queryClient.invalidateQueries(['booking', data.booking]);
            } else if (data?.ticket?.booking) {
                queryClient.invalidateQueries(['booking', data.ticket.booking]);
            }
            queryClient.invalidateQueries('coachOverview');
            queryClient.invalidateQueries('coachBookings');
            queryClient.invalidateQueries('adminDisputes');
        },
    });
};

export const useInitiateCoachRefund = () => {
    const queryClient = useQueryClient();

    return useMutation(refundAPI.initiateCoachRefund, {
        onSuccess: () => {
           
            queryClient.invalidateQueries('coachTransactions');
            queryClient.invalidateQueries('coachOverview');
        },
        onError: (error) => {
            toast.error(error.response?.data?.message || "Failed to initiate refund.");
        },
    });
};

export const useEscalateDisputeByClient = () => {
    const queryClient = useQueryClient();
    return useMutation(refundAPI.escalateDisputeByClient, {
        onSuccess: (data) => {
            if (data?.ticket?.booking) {
                queryClient.invalidateQueries(['booking', data.ticket.booking]);
            }
            queryClient.invalidateQueries('userSessions');
            queryClient.invalidateQueries('adminDisputes');
        },
        onError: (error) => {
            toast.error(error.response?.data?.message || "Failed to escalate request.");
        }
    });
};