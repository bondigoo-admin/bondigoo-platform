import api from './api';

/**
 * Client initiates a refund request for a specific booking.
 */
export const createRefundRequest = async (payload) => {
  const { data } = await api.post('/api/payments/refund-requests', payload);
  return data;
};

/**
 * Coach responds to a client's refund request.
 */
export const respondToRefundRequest = async ({ ticketId, ...payload }) => {
  const { data } = await api.post(`/api/payments/refund-requests/${ticketId}/respond`, payload);
  return data;
};

/**
 * Coach proactively initiates a refund for a payment.
 */
export const initiateCoachRefund = async ({ paymentId, amount, reason }) => {
    const { data } = await api.post('/api/payments/coach/refunds/initiate', {
        paymentId,
        amount,
        reason
    });
    return data;
};

export const escalateDisputeByClient = ({ ticketId, reason }) => {
    return api.post(`/api/payments/refund-requests/${ticketId}/escalate`, { reason });
};