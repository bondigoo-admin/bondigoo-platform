import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';
import paymentAPI from '../services/paymentAPI';

export const usePaymentMethodManagement = (userId) => {
  const { t } = useTranslation(['payments']);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPaymentMethods = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      logger.info('[usePaymentMethodManagement] Fetching payment methods for user:', userId);
      const methods = await paymentAPI.getPaymentMethods();
      setPaymentMethods(methods);
      logger.debug('[usePaymentMethodManagement] Payment methods fetched:', methods.length);
    } catch (err) {
      logger.error('[usePaymentMethodManagement] Error fetching payment methods:', err);
      setError(err.message);
      toast.error(t('payments:errorFetchingPaymentMethods'));
    } finally {
      setIsLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    if (userId) {
      fetchPaymentMethods();
    }
  }, [userId, fetchPaymentMethods]);

  const addPaymentMethod = useCallback(async (paymentMethodId) => {
    try {
      logger.info('[usePaymentMethodManagement] Adding new payment method:', paymentMethodId);
      await paymentAPI.addPaymentMethod(paymentMethodId);
      await fetchPaymentMethods(); // Refresh the list
      toast.success(t('payments:paymentMethodAdded'));
    } catch (err) {
      logger.error('[usePaymentMethodManagement] Error adding payment method:', err);
      toast.error(t('payments:errorAddingPaymentMethod'));
      throw err;
    }
  }, [fetchPaymentMethods, t]);

  const deletePaymentMethod = useCallback(async (paymentMethodId) => {
    try {
      logger.info('[usePaymentMethodManagement] Deleting payment method:', paymentMethodId);
      await paymentAPI.deletePaymentMethod(paymentMethodId);
      setPaymentMethods(prev => prev.filter(method => method.id !== paymentMethodId));
      toast.success(t('payments:paymentMethodDeleted'));
    } catch (err) {
      logger.error('[usePaymentMethodManagement] Error deleting payment method:', err);
      toast.error(t('payments:errorDeletingPaymentMethod'));
      throw err;
    }
  }, [t]);

  const setDefaultPaymentMethod = useCallback(async (paymentMethodId) => {
    try {
      logger.info('[usePaymentMethodManagement] Setting default payment method:', paymentMethodId);
      await paymentAPI.setDefaultPaymentMethod(paymentMethodId);
      setPaymentMethods(prev => prev.map(method => ({
        ...method,
        isDefault: method.id === paymentMethodId
      })));
      toast.success(t('payments:defaultPaymentMethodSet'));
    } catch (err) {
      logger.error('[usePaymentMethodManagement] Error setting default payment method:', err);
      toast.error(t('payments:errorSettingDefaultPaymentMethod'));
      throw err;
    }
  }, [t]);

  return {
    paymentMethods,
    isLoading,
    error,
    addPaymentMethod,
    deletePaymentMethod,
    setDefaultPaymentMethod,
    refreshPaymentMethods: fetchPaymentMethods
  };
};