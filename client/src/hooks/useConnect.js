import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { logger } from '../utils/logger';
import { useConnectContext } from '../contexts/ConnectContext';
import api from '../services/api';
import { useLocation, useNavigate } from 'react-router-dom';
import stripeConfig from '../config/stripeConfig';
import { CONNECT_STATES, CONNECT_ERROR_TYPES } from '../constants/connectConstants';

export const useConnect = () => {
  const { t } = useTranslation(['common', 'payments']);
  const [state, dispatch] = useConnectContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const getAccountStatus = useCallback(async () => {
    console.log('Attempting to fetch account status', {
      endpoint: '/api/payments/connect/account/status'
    });
    
    try {
      dispatch({ type: 'FETCH_STATUS_START' });
      logger.info('[useConnect] Fetching account status');
      
      const response = await api.get('/api/payments/connect/account/status');
      
      logger.info('[useConnect] Account status received:', {
        success: response.data.success,
        status: response.data.status?.status,
        hasRequirements: !!response.data.status?.requirementsDue?.length
      });

      dispatch({
        type: 'FETCH_STATUS_SUCCESS',
        payload: response.data.status
      });

      return response.data.status;
    } catch (error) {
      // Handle 404 as a valid "no account" state
      if (error.response?.status === 404) {
        logger.info('[useConnect] No Connect account found - expected for new accounts');
        dispatch({
          type: 'FETCH_STATUS_SUCCESS',
          payload: null
        });
        return null;
      }

      logger.error('[useConnect] Error fetching account status:', {
        error: error.message,
        response: error.response?.data
      });

      dispatch({
        type: 'FETCH_STATUS_ERROR',
        payload: error.response?.data?.message || error.message
      });

      toast.error(t('payments:errorFetchingAccountStatus'));
      throw error;
    }
  }, [dispatch, t]);

  useEffect(() => {
    const handleConnectRedirect = async () => {
      const state = location.state;
      
      if (state?.connectSuccess || state?.connectRefresh) {
        logger.info('[useConnect] Handling Connect redirect:', {
          success: !!state?.connectSuccess,
          refresh: !!state?.connectRefresh
        });
        
        try {
          await getAccountStatus();
          // Clear the state after processing
          navigate(location.pathname, { replace: true, state: {} });
        } catch (error) {
          logger.error('[useConnect] Error handling redirect:', error);
        }
      }
    };
  
    handleConnectRedirect();
  }, [location.state, getAccountStatus, navigate]);

  const createAccount = useCallback(async () => {
    console.log('[useConnect] Initiating Connect account creation');
    console.log('[Debug] Creating account with config:', {
      urls: stripeConfig.connectAccountUrls,
      origin: window.location.origin
    });
    try {
      dispatch({ type: 'CREATE_ACCOUNT_START' });
      logger.info('[useConnect] Creating Connect account');
      
      // Removing the URLs from initial account creation
      const response = await api.post('/api/payments/connect/account', {});
      
      logger.info('[useConnect] Account creation response:', {
        success: response.data.success,
        hasLink: !!response.data.accountLink,
        urls: stripeConfig.connectAccountUrls
      });

      dispatch({
        type: 'CREATE_ACCOUNT_SUCCESS',
        payload: response.data
      });
  
      if (response.data.accountLink) {
        setIsRedirecting(true);
        window.location.href = response.data.accountLink;
      } else {
        throw new Error('No account link received');
      }
  
      return response.data;
    } catch (error) {
      dispatch({
        type: 'CREATE_ACCOUNT_ERROR',
        payload: error.response?.data?.message || error.message
      });

      logger.error('[useConnect] Error creating account:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
    
      if (error.response?.status === 403) {
        toast.error(t('payments:notAuthorized'));
        return;
      }
    
      toast.error(
        error.response?.data?.code === 'ACCOUNT_EXISTS'
          ? t('payments:connectAccountExists')
          : error.response?.data?.message || t('payments:errorCreatingConnectAccount')
      );
      
      throw error;
    }
  }, [dispatch, t]);

  const checkRequirements = useCallback((status) => {
    if (!status) return { complete: false, missing: [] };

    const requirements = {
      complete: status.detailsSubmitted && 
                status.chargesEnabled && 
                status.payoutsEnabled,
      missing: [
        ...status.requirementsPending || [],
        ...status.requirementsDue || []
      ],
      errors: status.requirementsErrors || []
    };

    logger.debug('[useConnect] Account requirements:', {
      complete: requirements.complete,
      missingCount: requirements.missing.length,
      errorCount: requirements.errors.length
    });

    return requirements;
  }, []);

  const getDashboardLink = useCallback(async () => {
    console.log('[useConnect] Initiating dashboard link fetch', {
      endpoint: '/api/payments/connect/account/dashboard',
      timestamp: new Date().toISOString()
    });
    try {
      dispatch({ type: 'FETCH_DASHBOARD_LINK_START' });
      logger.info('[useConnect] Fetching Stripe dashboard link', {
        timestamp: new Date().toISOString()
      });
      console.log('[useConnect] Starting dashboard link request', {
        currentState: state,
        timestamp: new Date().toISOString()
      });

      const response = await api.get('/api/payments/connect/account/dashboard');

      logger.info('[useConnect] Dashboard link received:', {
        success: response.data.success,
        redirectUrl: response.data.redirectUrl,
        timestamp: new Date().toISOString()
      });
      console.log('[useConnect] Dashboard link fetch result:', {
        success: response.data.success,
        url: response.data.redirectUrl,
        timestamp: new Date().toISOString()
      });

      dispatch({
        type: 'FETCH_DASHBOARD_LINK_SUCCESS',
        payload: response.data.redirectUrl
      });

      if (response.data.redirectUrl) {
        setIsRedirecting(true);
        logger.debug('[useConnect] Redirecting to Stripe dashboard:', {
          url: response.data.redirectUrl,
          timestamp: new Date().toISOString()
        });
        console.log('[useConnect] Redirecting to Stripe dashboard:', {
          redirectUrl: response.data.redirectUrl,
          timestamp: new Date().toISOString()
        });
        window.location.href = response.data.redirectUrl;
      } else {
        const error = new Error('No dashboard link received');
        logger.error('[useConnect] Missing dashboard link in response:', {
          response: response.data,
          timestamp: new Date().toISOString()
        });
        console.error('[useConnect] No redirect URL in response:', {
          responseData: response.data,
          timestamp: new Date().toISOString()
        });
        throw error;
      }

      return response.data.redirectUrl;
    } catch (error) {
      logger.error('[useConnect] Error fetching dashboard link:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      console.error('[useConnect] Failed to fetch dashboard link:', {
        errorMessage: error.message,
        status: error.response?.status,
        responseData: error.response?.data,
        timestamp: new Date().toISOString()
      });

      dispatch({
        type: 'FETCH_DASHBOARD_LINK_ERROR',
        payload: error.response?.data?.message || error.message
      });

      toast.error(t('payments:errorFetchingDashboardLink'));
      throw error;
    }
  }, [dispatch, t, state]);

  return {
    accountStatus: state.accountStatus,
    isLoading: state.isLoading,
    error: state.error,
    lastChecked: state.lastChecked,
    isRedirecting,
    getAccountStatus,
    createAccount,
    checkRequirements,
    getDashboardLink,
    clearError: () => dispatch({ type: 'CLEAR_ERROR' })
  };
};