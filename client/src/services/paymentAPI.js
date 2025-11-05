import api from './api';
import { logger } from '../utils/logger';
import { toast } from 'react-hot-toast';
import { sendNotification } from './notificationAPI';
import { NotificationTypes, NotificationCategories, NotificationPriorities } from '../utils/notificationHelpers';
import PaymentSocketService from './PaymentSocketService';
import { SOCKET_EVENTS } from '../constants/socketEvents';
import { PaymentOrchestrator } from './PaymentOrchestratorService';

const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY: 1000,
  MAX_DELAY: 5000,
  JITTER_MAX: 100
};

class PaymentAPI {
  _activeRequests = new Map();
  _activePolls = new Map();
  constructor() {
    logger.info('[PaymentAPI] Initializing payment API service');
    this.socketService = PaymentSocketService;
  }
  _pendingIntents = new Map();

  async _ensureUniqueIntent(bookingId, operation) {
    if (this._pendingIntents.has(bookingId)) {
      logger.info('[PaymentAPI] Payment intent creation already in progress:', {
        bookingId,
        timestamp: new Date().toISOString()
      });
      return this._pendingIntents.get(bookingId);
    }
  
    const intentPromise = (async () => {
      try {
        return await operation();
      } finally {
        this._pendingIntents.delete(bookingId);
      }
    })();
  
    this._pendingIntents.set(bookingId, intentPromise);
    return intentPromise;
  }

  _initializeAbortController() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    return this.abortController;
  }

  _cancelActiveRequest(bookingId) {
    const activeRequest = this._activeRequests.get(bookingId);
    if (activeRequest) {
      activeRequest.abort();
      this._activeRequests.delete(bookingId);
    }
  }
  
  _cancelActivePolling(bookingId) {
   
    const activePoll = this._activePolls.get(bookingId);
    if (activePoll) {
      activePoll.abort();
      this._activePolls.delete(bookingId);
    }
  }

  _normalizePaymentMethod(method) {
  
  
    return {
      id: method.id || method._id || method.payment_method_id,
      brand: method.brand || method.card?.brand,
      last4: method.last4 || method.card?.last4,
      expMonth: method.expMonth || method.card?.exp_month,
      expYear: method.expYear || method.card?.exp_year,
      isDefault: !!method.isDefault
    };
  }
  

  _startPollingPaymentStatus(bookingId, paymentIntentId) {
    logger.info('[PaymentAPI] Starting payment status polling:', {
      bookingId,
      paymentIntentId,
      timestamp: new Date().toISOString()
    });
  
    const pollInterval = setInterval(async () => {
      try {
        const status = await this.getPaymentStatus(bookingId);
        
        if (this._isTerminalState(status)) {
          clearInterval(pollInterval);
          logger.info('[PaymentAPI] Payment reached terminal state:', {
            bookingId,
            status,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        logger.error('[PaymentAPI] Error polling payment status:', {
          error: error.message,
          bookingId,
          timestamp: new Date().toISOString()
        });
      }
    }, 3000);
  
    this._activePolls.set(bookingId, {
      interval: pollInterval,
      paymentIntentId
    });
  }
  
  // Add helper method for terminal states:
  _checkTerminalState(status) {
    return ['succeeded', 'failed', 'cancelled'].includes(status);
  }

  _normalizePaymentIntentResponse(data) {
    logger.debug('[PaymentAPI] Normalizing payment intent response:', {
      hasData: !!data,
      responseKeys: data ? Object.keys(data) : [],
      timestamp: new Date().toISOString()
    });
  
    if (!data) {
      throw new Error('No response data received');
    }
  
    try {
      // Handle success response format from our backend
      if (data.success === true) {
        const normalized = {
          clientSecret: data.clientSecret,
          paymentIntent: {
            id: data.paymentIntent?.id || data.paymentIntent?._id,
            status: data.paymentIntent?.status || 'requires_payment_method',
            amount: data.paymentIntent?.amount,
            currency: (data.paymentIntent?.currency || 'chf').toLowerCase(),
            client_secret: data.clientSecret
          },
          timestamp: new Date().toISOString()
        };
  
        // Validate required fields
        if (!normalized.clientSecret) {
          logger.error('[PaymentAPI] Missing client secret in response:', { 
            originalData: data,
            normalizedData: normalized
          });
          throw new Error('Missing client secret in payment intent response');
        }
  
        if (!normalized.paymentIntent.amount) {
          logger.error('[PaymentAPI] Missing amount in payment intent:', {
            originalData: data,
            normalizedData: normalized
          });
          throw new Error('Missing amount in payment intent response');
        }
  
        logger.info('[PaymentAPI] Successfully normalized payment intent response:', {
          paymentIntentId: normalized.paymentIntent.id,
          amount: normalized.paymentIntent.amount,
          currency: normalized.paymentIntent.currency,
          timestamp: normalized.timestamp
        });
  
        return normalized;
      }
  
      // Handle direct Stripe payment intent response
      if (data.id && data.client_secret) {
        const normalized = {
          clientSecret: data.client_secret,
          paymentIntent: {
            id: data.id,
            status: data.status || 'requires_payment_method',
            amount: data.amount,
            currency: data.currency.toLowerCase(),
            client_secret: data.client_secret
          },
          timestamp: new Date().toISOString()
        };
  
        logger.info('[PaymentAPI] Normalized Stripe payment intent:', {
          paymentIntentId: normalized.paymentIntent.id,
          amount: normalized.paymentIntent.amount,
          currency: normalized.paymentIntent.currency,
          timestamp: normalized.timestamp
        });
  
        return normalized;
      }
  
      logger.error('[PaymentAPI] Invalid payment intent response format:', {
        originalData: data,
        hasClientSecret: !!data.clientSecret || !!data.client_secret,
        hasPaymentIntent: !!data.paymentIntent || !!data.id
      });
  
      throw new Error('Invalid payment intent response format');
  
    } catch (error) {
      logger.error('[PaymentAPI] Error normalizing payment intent response:', {
        error: error.message,
        originalData: data,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  _setupPaymentSocketHandlers(bookingId, paymentIntentId) {
    logger.info('[PaymentAPI] Setting up payment socket handlers:', {
      bookingId,
      paymentIntentId,
      timestamp: new Date().toISOString()
    });
  
    const handleStatusUpdate = (data) => {
      logger.debug('[PaymentAPI] Received status update:', {
        bookingId,
        status: data.status,
        timestamp: new Date().toISOString()
      });
  
      window.dispatchEvent(
        new CustomEvent('payment_status_update', { 
          detail: {
            bookingId,
            paymentIntentId,
            ...data
          }
        })
      );
  
      if (data.error) {
        this._handlePaymentError(bookingId, data.error);
      }
    };
  
    const handleActionRequired = (data) => {
      logger.info('[PaymentAPI] Action required:', {
        bookingId,
        action: data.action,
        timestamp: new Date().toISOString()
      });
  
      window.dispatchEvent(
        new CustomEvent('payment_action_required', { 
          detail: {
            bookingId,
            paymentIntentId,
            ...data
          }
        })
      );
    };
  
    const handlePaymentError = (data) => {
      logger.error('[PaymentAPI] Payment error event:', {
        bookingId,
        error: data.error,
        timestamp: new Date().toISOString()
      });
  
      window.dispatchEvent(
        new CustomEvent('payment_error', { 
          detail: {
            bookingId,
            paymentIntentId,
            error: data.error,
            timestamp: new Date().toISOString()
          }
        })
      );
  
      this._cancelActiveRequest(bookingId);
    };
  
    return this.socketService.subscribeToPayment(paymentIntentId, {
      [SOCKET_EVENTS.PAYMENT.STATUS_UPDATE]: handleStatusUpdate,
      [SOCKET_EVENTS.PAYMENT.ACTION_REQUIRED]: handleActionRequired,
      [SOCKET_EVENTS.PAYMENT.ERROR_OCCURRED]: handlePaymentError
    });
  }

  async _ensureSocketConnection(bookingId) {
    try {
      logger.info('[PaymentAPI] Ensuring socket connection:', {
        bookingId,
        timestamp: new Date().toISOString()
      });
  
      const connectionResult = await this.socketService.ensureConnection();
      
      if (!connectionResult) {
        logger.warn('[PaymentAPI] Socket connection failed, will use polling fallback:', {
          bookingId,
          timestamp: new Date().toISOString()
        });
        return false;
      }
  
      // Get socket state for extra validation
      const socketState = this.socketService.getConnectionState();
      logger.debug('[PaymentAPI] Socket connection state:', {
        ...socketState,
        bookingId,
        timestamp: new Date().toISOString()
      });
  
      return socketState.state === 'connected';
  
    } catch (error) {
      logger.error('[PaymentAPI] Error ensuring socket connection:', {
        error: error.message,
        bookingId,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }

  /**
 * Get payment status for a booking
 */
  async getPaymentStatus(bookingId, options = {}) {
    logger.info('[PaymentAPI] Getting payment status - START:', {
      bookingId,
      hasBookingId: !!bookingId,
      type: typeof bookingId,
      timestamp: new Date().toISOString()
    });
  
    if (!bookingId) {
      logger.error('[PaymentAPI] Missing bookingId in getPaymentStatus');
      throw new Error('Missing bookingId for status check');
    }
  
    try {
      const controller = new AbortController();
      this._activePolls.set(bookingId, controller);
  
      const response = await api.get(`/api/payments/status/${bookingId}`, {
        ...options,
        signal: controller.signal,
        validateStatus: status => status === 200
      });
  
      logger.info('[PaymentAPI] Payment status response received:', {
        bookingId,
        responseKeys: Object.keys(response?.data || {}),
        hasStatus: !!response?.data?.status,
        hasPaymentIntentId: !!response?.data?.paymentIntentId,
        timestamp: new Date().toISOString()
      });
  
      if (!response?.data?.status) {
        logger.error('[PaymentAPI] Invalid payment status response:', {
          bookingId,
          response: response?.data
        });
        throw new Error('Invalid payment status response');
      }
  
      // Try to extract payment intent ID from client secret if it exists but paymentIntentId doesn't
      let paymentIntentId = response.data.paymentIntentId;
      if (!paymentIntentId && response.data.clientSecret && response.data.clientSecret.includes('_secret_')) {
        paymentIntentId = response.data.clientSecret.split('_secret_')[0];
        logger.info('[PaymentAPI] Extracted payment intent ID from client secret:', {
          extractedId: paymentIntentId,
          bookingId,
          timestamp: new Date().toISOString()
        });
      }
  
      // Also look for paymentIntent.id if it exists
      if (!paymentIntentId && response.data.paymentIntent?.id) {
        paymentIntentId = response.data.paymentIntent.id;
        logger.info('[PaymentAPI] Found payment intent ID in paymentIntent object:', {
          paymentIntentId,
          bookingId,
          timestamp: new Date().toISOString()
        });
      }
  
      // Continue with existing return statement, but include paymentIntentId
      return {
        status: response.data.status,
        flowId: response.data.flowId,
        paymentIntentId,
        clientSecret: response.data.clientSecret,
        error: response.data.error,
        metadata: response.data.metadata
      };
  
    } catch (error) {
      const enhancedError = this._enhanceError(error, {
        context: 'payment_status_check',
        bookingId
      });
      
      logger.error('[PaymentAPI] Error checking payment status:', {
        error: enhancedError,
        bookingId,
        stack: error.stack
      });
      
      throw enhancedError;
    } finally {
      this._activePolls.delete(bookingId);
    }
  }

 /**
   * Set as Default
   */


 async setDefaultPaymentMethod(methodId) {
  try {
    if (!methodId) {
      logger.error('[PaymentAPI] Cannot set default: Missing payment method ID');
      throw new Error('Payment method ID is required');
    }

    logger.info('[PaymentAPI] Setting default payment method:', {
      methodId,
      timestamp: new Date().toISOString()
    });

    const response = await api.post('/api/payments/methods/default', {
      paymentMethodId: methodId
    });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to set default payment method');
    }

    logger.info('[PaymentAPI] Default payment method set successfully:', {
      methodId,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      message: 'Default payment method updated successfully'
    };
  } catch (error) {
    logger.error('[PaymentAPI] Error setting default payment method:', {
      error: error.message,
      methodId,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

 /**
   * Create payment intent for a booking
   */
 async createPaymentIntent(bookingId, options = {}) {
  const startTime = Date.now();
  logger.info('[PaymentAPI] Creating payment intent - configuration:', {
    bookingId,
    timeoutDuration: this.PAYMENT_REQUEST_TIMEOUT || 15000,
    hasSocket: !!PaymentSocketService.isSocketConnected(),
    timestamp: new Date().toISOString(),
  });


  if (!bookingId) {
    logger.error('[PaymentAPI] Missing bookingId for payment intent creation');
    console.error('[PaymentAPI] Missing bookingId');
    throw new Error('Missing booking ID');
  }

  return this._ensureUniqueIntent(bookingId, async () => {
    if (!PaymentSocketService.isSocketConnected()) {
      logger.warn('[PaymentAPI] Socket not connected, attempting to reconnect', { bookingId });
    
    }

    const controller = this._initializeAbortController();
    const timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) {
        logger.warn('[PaymentAPI] Payment request timeout:', {
          bookingId,
          duration: this.PAYMENT_REQUEST_TIMEOUT,
          timestamp: new Date().toISOString(),
        });
        console.warn('[PaymentAPI] Payment request timed out:', { bookingId });
        controller.abort();
      }
    }, this.PAYMENT_REQUEST_TIMEOUT || 10000);

    try {
      await this.socketService.ensureConnection().catch((error) => {
        logger.warn('[PaymentAPI] Socket connection failed, proceeding with payment:', {
          error: error.message,
          bookingId,
          timestamp: new Date().toISOString(),
        });
        console.warn('[PaymentAPI] Socket connection failed, using fallback:', { error: error.message });
      });

      logger.info('[PaymentAPI] Creating payment intent:', {
        bookingId,
        price: options.price,
        hasMetadata: !!options.metadata,
        timestamp: new Date().toISOString()
      });
     
      
      const response = await this.retryWithDelay(async () => {
        if (controller.signal.aborted) {
          const newController = this._initializeAbortController();
          logger.info('[PaymentAPI] Request aborted, using new controller:', { bookingId, timestamp: new Date().toISOString() });
         
          return await api.post(
            '/api/payments/create-intent',
            {
              bookingId,
              request_type: 'booking_payment',
              price: options.price, // Pass full price object
              metadata: {
                ...options.metadata,
                requestId: `${bookingId}-${Date.now()}`,
                timestamp: new Date().toISOString()
              }
            },
            {
              ...options,
              signal: newController.signal,
              timeout: this.PAYMENT_REQUEST_TIMEOUT || 10000,
              validateStatus: (status) => status === 200 || status === 201
            }
          );
        }
      
        return await api.post(
          '/api/payments/create-intent',
          {
            bookingId,
            request_type: 'booking_payment',
            price: options.price, // Pass full price object
            metadata: {
              ...options.metadata,
              requestId: `${bookingId}-${Date.now()}`,
              timestamp: new Date().toISOString()
            }
          },
          {
            ...options,
            signal: controller.signal,
            timeout: this.PAYMENT_REQUEST_TIMEOUT || 10000,
            validateStatus: (status) => status === 200 || status === 201
          }
        );
      });

      const normalizedResponse = this._normalizePaymentIntentResponse(response.data);

      if (!normalizedResponse.clientSecret || !normalizedResponse.paymentIntent?.id) {
        logger.error('[PaymentAPI] Invalid payment intent response', {
          bookingId,
          response: response.data,
          timestamp: new Date().toISOString(),
        });
       
        throw new Error('Invalid payment intent response');
      }

      logger.info('[PaymentAPI] Payment intent created successfully:', {
        bookingId,
        paymentIntentId: normalizedResponse.paymentIntent.id,
        hasClientSecret: !!normalizedResponse.clientSecret,
        timestamp: new Date().toISOString(),
      });
      console.log('[PaymentAPI] Payment intent created:', {
        bookingId,
        paymentIntentId: normalizedResponse.paymentIntent.id,
      });

      await this.startPaymentStatusMonitoring(normalizedResponse.paymentIntent.id, bookingId);

      return {
        clientSecret: normalizedResponse.clientSecret,
        paymentIntent: normalizedResponse.paymentIntent,
        flowId: await PaymentOrchestrator._getOrCreateFlowId(bookingId),
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        logger.info('[PaymentAPI] Payment request aborted:', {
          bookingId,
          wasTimeout: Date.now() - startTime >= (this.PAYMENT_REQUEST_TIMEOUT || 10000),
          timestamp: new Date().toISOString(),
        });
        console.error('[PaymentAPI] Payment request aborted:', { bookingId });
        const enhancedError = {
          message: 'Payment request canceled',
          code: 'payment_intent_creation_aborted',
          recoverable: true,
          originalError: error,
        };
        throw enhancedError;
      }

      const enhancedError = this._enhanceError(error, {
        context: 'payment_intent_creation',
        bookingId,
      });
      logger.error('[PaymentAPI] Error creating payment intent:', {
        error: enhancedError.message,
        bookingId,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
      console.error('[PaymentAPI] Payment intent creation error:', {
        bookingId,
        error: enhancedError.message,
      });

      throw enhancedError;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  });
}

async _createPaymentIntentRequest(bookingId, options, signal) {

  return await api.post('/api/payments/create-intent', 
    {
      bookingId,
      request_type: 'booking_payment',
      metadata: {
        ...options.metadata,
        requestId: `${bookingId}-${Date.now()}`,
        timestamp: new Date().toISOString()
      }
    },
    {
      ...options,
      signal,
      timeout: this.PAYMENT_REQUEST_TIMEOUT,
      validateStatus: (status) => status === 200 || status === 201
    }
  );
}

startPaymentStatusMonitoring(paymentIntentId, bookingId) {
  logger.info('[PaymentAPI] Starting payment status monitoring:', {
    paymentIntentId,
    bookingId,
    timestamp: new Date().toISOString()
  });

  // First clean up any existing polling
  this._stopPolling(paymentIntentId);

  try {
    const controller = new AbortController();
    const pollingInterval = setInterval(async () => {
      try {
        if (controller.signal.aborted) {
          this._stopPolling(paymentIntentId);
          return;
        }

        const status = await this.getPaymentStatus(bookingId);
        window.dispatchEvent(
          new CustomEvent('payment_status_update', {
            detail: {
              bookingId,
              paymentIntentId,
              status,
              timestamp: new Date().toISOString()
            }
          })
        );

        if (this._checkTerminalState(status)) {
          this._stopPolling(paymentIntentId);
        }
      } catch (error) {
        logger.error('[PaymentAPI] Polling error:', {
          error: error.message,
          paymentIntentId,
          bookingId,
          timestamp: new Date().toISOString()
        });
      }
    }, 3000);

    this._activePolls.set(paymentIntentId, {
      interval: pollingInterval,
      controller,
      bookingId,
      startedAt: Date.now()
    });

    logger.info('[PaymentAPI] Payment monitoring started:', {
      paymentIntentId,
      bookingId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('[PaymentAPI] Failed to start payment monitoring:', {
      error: error.message,
      paymentIntentId,
      bookingId,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

_stopPolling(paymentIntentId) {
  const polling = this._activePolls.get(paymentIntentId);
  if (polling) {
    logger.info('[PaymentAPI] Stopping payment polling:', {
      paymentIntentId,
      bookingId: polling.bookingId,
      duration: Date.now() - polling.startedAt,
      timestamp: new Date().toISOString()
    });

    if (polling.interval) {
      clearInterval(polling.interval);
    }
    if (polling.controller) {
      polling.controller.abort();
    }
    this._activePolls.delete(paymentIntentId);
  }
}

_isTerminalState(status) {
  return ['succeeded', 'failed', 'cancelled'].includes(status);
}

cleanup() {
  logger.info('[PaymentAPI] Cleaning up all payment polling');
  for (const [paymentIntentId] of this._activePolls) {
    this._stopPolling(paymentIntentId);
  }
}


_handlePaymentError(bookingId, error) {
  if (!bookingId || !error) return;

  const enhancedError = this._enhanceError(error, {
    context: 'payment_socket',
    bookingId
  });

  logger.error('[PaymentAPI] Socket payment error:', {
    error: enhancedError,
    bookingId,
    timestamp: new Date().toISOString()
  });

  this._cancelActiveRequest(bookingId);
  this._cancelActivePolling(bookingId);

  toast.error('Payment error: Please try again');
}

handlePaymentStatusUpdate(status, bookingId) {
  try {
    logger.info('[PaymentAPI] Processing payment status update:', {
      bookingId,
      status,
      timestamp: new Date().toISOString()
    });

    window.dispatchEvent(
      new CustomEvent('payment_status_update', {
        detail: {
          bookingId,
          status,
          timestamp: new Date().toISOString()
        }
      })
    );

    if (this._isTerminalState(status)) {
      logger.info('[PaymentAPI] Payment reached terminal state:', {
        bookingId,
        status,
        timestamp: new Date().toISOString()
      });
      this._cancelActivePolling(bookingId);
    }

  } catch (error) {
    logger.error('[PaymentAPI] Error processing status update:', {
      error: error.message,
      bookingId,
      status,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Confirm a payment
 */
async confirmPayment(paymentIntentId, paymentMethodId, context = {}) {
  try {
    logger.info('[PaymentAPI] Confirming payment:', {
      paymentIntentId,
      paymentMethodId,
      hasContext: !!context,
      bookingId: context?.bookingId,
      timestamp: new Date().toISOString()
    });

    if (context?.bookingId) {
      try {
        logger.info('[PaymentAPI] Checking payment status before confirmation:', {
          bookingId: context.bookingId,
          paymentIntentId,
          timestamp: new Date().toISOString()
        });
        
        const paymentStatus = await this.getPaymentStatus(context.bookingId);
        
        if (paymentStatus.status === 'succeeded') {
          return {
            success: true,
            status: 'succeeded',
            paymentIntentId,
            bookingId: context.bookingId,
            alreadyConfirmed: true,
            message: 'Payment was already confirmed',
            amount: paymentStatus.amount, 
            currency: paymentStatus.currency 
          };
        }
      } catch (statusCheckError) {
        logger.warn('[PaymentAPI] Error checking payment status before confirmation:', {
          error: statusCheckError.message,
          bookingId: context.bookingId,
          paymentIntentId,
          timestamp: new Date().toISOString()
        });
      }
    }

    logger.info('[PaymentAPI] Payment confirmation request details:', {
      url: '/api/payments/confirm',
      method: 'POST',
      data: {
        paymentIntentId,
        paymentMethodId,
        context: {
          ...context,
          sensitive: undefined
        }
      },
      timestamp: new Date().toISOString()
    });

    let response;
    try {
      response = await this.retryWithDelay(async () => {
        return await api.post('/api/payments/confirm', {
          paymentIntentId,
          paymentMethodId,
          ...context
        }, {
          timeout: 10000,
          validateStatus: (status) => status === 200 || status === 201
        });
      }, { maxAttempts: 2, context: 'payment_confirmation' });
    } catch (error) {
      if (error.response?.status === 500 && 
          (error.response?.data?.error?.includes('already succeeded') || error.message?.includes('already succeeded'))) {
        logger.info('[PaymentAPI] Detected already confirmed payment during API call error:', {
          paymentIntentId,
          bookingId: context?.bookingId,
          error: error.response?.data?.error || error.message,
          timestamp: new Date().toISOString()
        });
        try {
          const status = await this.getPaymentStatus(context.bookingId);
          if (status.status === 'succeeded') {
            return {
              success: true,
              status: 'succeeded',
              paymentIntentId,
              bookingId: context?.bookingId,
              alreadyConfirmed: true,
              message: 'Payment was already confirmed (recovered from API error)',
              amount: status.amount,
              currency: status.currency
            };
          }
        } catch (statusError) {
          logger.warn('[PaymentAPI] Error checking status after API error, assuming success for already confirmed', {
            bookingId: context?.bookingId,
            error: statusError.message,
            timestamp: new Date().toISOString()
          });
        }
        return {
          success: true,
          status: 'succeeded',
          paymentIntentId,
          bookingId: context?.bookingId,
          alreadyConfirmed: true,
          message: 'Payment was already confirmed (recovered from API error, status check failed)',
          // Attempt to extract from original context if possible for amount/currency
          amount: context?.amount, 
          currency: context?.currency?.toUpperCase()
        };
      }
      throw error; // Re-throw other errors
    }
    
    if (response.data.success) {
      logger.info('[PaymentAPI.confirmPayment] Successful response from /api/payments/confirm:', {
          paymentIntentId,
          bookingIdFromContext: context?.bookingId,
          responseStatus: response.status,
          responseData: JSON.parse(JSON.stringify(response.data)),
          timestamp: new Date().toISOString()
      });

const responseData = response.data;
      let notifyAmount = responseData.amount;
      let notifyCurrency = responseData.currency;

      if (typeof notifyAmount !== 'number' && typeof responseData.paymentIntent?.amount === 'number') {
        notifyAmount = responseData.paymentIntent.amount / 100;
      } else if (typeof notifyAmount !== 'number') {
        notifyAmount = context?.amount || 0;
      }

      if (!notifyCurrency && responseData.paymentIntent?.currency) {
        notifyCurrency = responseData.paymentIntent.currency;
      } else if (!notifyCurrency) {
        notifyCurrency = context?.currency || 'USD';
      }
      
      notifyCurrency = notifyCurrency.toUpperCase();

      logger.info('[PaymentAPI] Payment confirmed successfully:', {
        paymentIntentId,
        bookingId: responseData.bookingId || context?.bookingId,
        status: responseData.status,
        timestamp: new Date().toISOString()
      });
      
      return {
        ...responseData,
        amount: notifyAmount,
        currency: notifyCurrency
      };
    }

    logger.warn('[PaymentAPI.confirmPayment] Backend responded with success:false or unexpected structure', {
        paymentIntentId,
        responseData: response.data
    });
    throw this._enhanceError(new Error(response.data.message || 'Payment confirmation failed at backend'), {
        context: 'payment_confirmation_backend_fail',
        paymentIntentId,
        bookingId: context?.bookingId,
        serverResponse: response.data
    });
    
  } catch (error) {
    const errorDetails = {
      message: error.message,
      paymentIntentId,
      stack: error.stack,
      hasResponse: !!error.response,
      statusCode: error.response?.status,
      data: error.response?.data,
      timestamp: new Date().toISOString()
    };
    logger.error('[PaymentAPI] Error confirming payment:', errorDetails);
    
    if (context?.bookingId) {
      try {
        logger.info('[PaymentAPI] Checking payment status after error', {
          bookingId: context.bookingId,
          timestamp: new Date().toISOString()
        });
        
        const status = await this.getPaymentStatus(context.bookingId);
        if (status.status === 'succeeded') {
          logger.info('[PaymentAPI] Payment succeeded despite error (status check)', {
            bookingId: context.bookingId,
            status: status.status,
            timestamp: new Date().toISOString()
          });
          return {
            success: true,
            status: 'succeeded',
            recoveredFromError: true,
            originalError: error.message,
            paymentIntentId,
            bookingId: context.bookingId,
            amount: status.amount,
            currency: status.currency
          };
        }
      } catch (statusError) {
        logger.error('[PaymentAPI] Error checking payment status after error:', {
          error: statusError.message,
          originalError: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    if (error.response?.data?.recipientId || context?.userId) {
      await sendNotification({
        type: NotificationTypes.PAYMENT_FAILED,
        recipient: error.response?.data?.recipientId || context?.userId,
        category: NotificationCategories.PAYMENT,
        priority: NotificationPriorities.HIGH,
        channels: ['in_app', 'email'],
        content: {
          title: 'Payment Failed',
          message: `Your payment could not be processed. ${error.response?.data?.message || 'Please try again or use a different payment method.'}`
        },
        metadata: {
          paymentIntentId,
          bookingId: context?.bookingId,
          error: error.message,
          recoveryInstructions: error.response?.data?.recoveryInstructions || 'Please try again with a different payment method'
        }
      });
    }

    toast.error('Payment failed: Please try again');
    
    const enhancedError = error.originalError ? error : this._enhanceError(error, {
      context: 'payment_confirmation',
      paymentIntentId,
      bookingId: context?.bookingId
    });
    
    throw enhancedError;
  }
}

/**
 * Process a refund
 */
async processRefund(paymentIntentId, amount, reason) {
  try {
    logger.info('[PaymentAPI] Processing refund:', {
      paymentIntentId,
      amount,
      reason
    });

    const response = await api.post('/api/payments/refund', {
      paymentIntentId,
      amount,
      reason
    });

    if (response.data.success) {
      // Emit socket event for real-time updates
      if (this.socket) {
        this.socket.emit('payment_refunded', {
          paymentIntentId,
          bookingId: response.data.bookingId,
          amount: response.data.amount,
          timestamp: new Date().toISOString()
        });
      }

      // Send refund notification
      await sendNotification({
        type: NotificationTypes.PAYMENT_REFUNDED,
        recipient: response.data.recipientId,
        category: NotificationCategories.PAYMENT,
        priority: NotificationPriorities.MEDIUM,
        channels: ['in_app', 'email'],
        content: {
          title: 'Payment Refunded',
          message: `A refund of ${response.data.amount} ${response.data.currency.toUpperCase()} has been processed.${reason ? ` Reason: ${reason}` : ''}`
        },
        metadata: {
          paymentIntentId,
          bookingId: response.data.bookingId,
          amount: response.data.amount,
          currency: response.data.currency,
          reason: reason || 'Not specified'
        }
      });

      logger.info('[PaymentAPI] Refund processed successfully:', {
        paymentIntentId,
        refundId: response.data.refundId
      });
    }

    return response.data;
  } catch (error) {
    logger.error('[PaymentAPI] Error processing refund:', {
      error: error.message,
      paymentIntentId,
      stack: error.stack
    });
    
    toast.error('Refund failed: Please try again');
    throw error;
  }
}

async cancelPendingBooking(bookingId) {
  try {
    logger.info('[PaymentAPI] Cancelling pending booking via API.', { bookingId });
    const response = await api.post(`/api/bookings/${bookingId}/cancel-pending`);

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to cancel pending booking.');
    }

    logger.info('[PaymentAPI] Pending booking cancelled successfully.', { bookingId });
    return response.data;
  } catch (error) {
    logger.error('[PaymentAPI] Error cancelling pending booking.', {
      bookingId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

  /**
   * Add a payment method for a user
   */
 async addPaymentMethod(userId, paymentMethodId, isDefault = false) {
    try {
      if (!paymentMethodId) {
        logger.error('[PaymentAPI] Cannot add payment method: Missing ID');
        throw new Error('Payment method ID is required');
      }
       if (!userId) {
        logger.error('[PaymentAPI] Cannot add payment method: Missing userId');
        throw new Error('User ID is required');
      }
  
      logger.info('[PaymentAPI] Adding payment method:', {
        userId,
        paymentMethodId,
        isDefault,
        timestamp: new Date().toISOString()
      });
  
      const response = await api.post(`/api/payments/methods/${userId}`, {
        paymentMethodId,
        isDefault
      });
  
      const normalizedMethod = this._normalizePaymentMethod(response.data.paymentMethod);
  
      logger.info('[PaymentAPI] Payment method added:', {
        methodId: normalizedMethod.id,
        brand: normalizedMethod.brand,
        last4: normalizedMethod.last4,
        timestamp: new Date().toISOString()
      });
  
      return {
        success: true,
        paymentMethod: normalizedMethod
      };
    } catch (error) {
      logger.error('[PaymentAPI] Error adding payment method:', {
        error: error.message,
        userId,
        paymentMethodId,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Get payment methods for a user
   */
  async getPaymentMethods(userId) {
    try {
      if (!userId) {
        logger.error('[PaymentAPI] Cannot fetch payment methods: Missing userId');
        throw new Error('User ID is required');
      }
  
      logger.info('[PaymentAPI] Fetching payment methods:', {
        userId,
        timestamp: new Date().toISOString()
      });
  
      const response = await api.get(`/api/payments/methods/${userId}`);
  
      const methods = response.data.paymentMethods || [];
      const normalizedMethods = methods.map(method => this._normalizePaymentMethod(method));
  
    
  
      return normalizedMethods;
    } catch (error) {
      logger.error('[PaymentAPI] Error fetching payment methods:', {
        error: error.message,
        userId,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Handle payment webhook event
   */
  async handleWebhookEvent(event) {
    try {
      logger.info('[PaymentAPI] Processing webhook event:', {
        type: event.type,
        id: event.id
      });
  
      let response = { received: false };
  
      switch (event.type) {
        case 'payment_intent.succeeded':
          response = await this.handlePaymentSuccess(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          response = await this.handlePaymentFailure(event.data.object);
          break;
        case 'charge.refunded':
          response = await this.handleRefund(event.data.object);
          break;
        default:
          logger.info('[PaymentAPI] Unhandled webhook event type:', event.type);
      }
  
      logger.info('[PaymentAPI] Webhook event processed:', {
        type: event.type,
        id: event.id,
        success: response.received
      });
  
      return { ...response, received: true };
    } catch (error) {
      logger.error('[PaymentAPI] Error processing webhook:', {
        error: error.message,
        eventType: event.type,
        eventId: event.id,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Delete a payment method
   */
  async deletePaymentMethod(methodId) {
    try {
      logger.info('[PaymentAPI] Deleting payment method:', methodId);

      const response = await api.delete(`/api/payments/methods/${methodId}`);

      logger.info('[PaymentAPI] Payment method deleted successfully:', methodId);
      return response.data;
    } catch (error) {
      logger.error('[PaymentAPI] Error deleting payment method:', {
        error: error.message,
        methodId,
        stack: error.stack
      });
      throw error;
    }
  }

  async getConnectAccountStatus() {
    try {
      logger.info('[PaymentAPI] Fetching Connect account status');
      const response = await api.get('/api/payments/connect/account/status');
      return response.data;
    } catch (error) {
      logger.error('[PaymentAPI] Error fetching Connect status:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  async createConnectAccount() {
    try {
      logger.info('[PaymentAPI] Creating Connect account');
      const response = await api.post('/api/payments/connect/account');
      return response.data;
    } catch (error) {
      logger.error('[PaymentAPI] Error creating Connect account:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async retryWithDelay(operation, options = {}) {
    const {
      maxAttempts = RETRY_CONFIG.MAX_ATTEMPTS,
      baseDelay = RETRY_CONFIG.BASE_DELAY,
      maxDelay = RETRY_CONFIG.MAX_DELAY,
      context = {}
    } = options;
  
    let lastError = null;
  
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.debug('[PaymentAPI] Attempting operation:', {
          attempt,
          maxAttempts,
          context,
          timestamp: new Date().toISOString()
        });
  
        return await operation();
      } catch (error) {
        lastError = error;
  
        // Don't retry if the request was aborted or explicitly marked as not recoverable
        if (error.name === 'AbortError' || error.recoverable === false) {
          logger.info('[PaymentAPI] Operation not retryable:', {
            error: error.message,
            name: error.name,
            recoverable: error.recoverable,
            context,
            timestamp: new Date().toISOString()
          });
          throw error;
        }
  
        const shouldRetry = attempt < maxAttempts;
        if (!shouldRetry) break;
  
        // Calculate delay with exponential backoff and jitter
        const jitter = Math.random() * RETRY_CONFIG.JITTER_MAX;
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1) + jitter, maxDelay);
  
        logger.info('[PaymentAPI] Operation failed, retrying:', {
          attempt,
          maxAttempts,
          delay,
          error: error.message,
          context,
          timestamp: new Date().toISOString()
        });
  
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  
    // If we've exhausted all retries, enhance and throw the last error
    const enhancedError = this._enhanceError(lastError, {
      context: 'retry_exhausted',
      attempts: maxAttempts,
      ...context
    });
  
    logger.error('[PaymentAPI] All retry attempts failed:', {
      error: enhancedError,
      maxAttempts,
      context,
      timestamp: new Date().toISOString()
    });
  
    throw enhancedError;
  }
  
  // Add these helper methods
  async handlePaymentSuccess(paymentIntent) {
    // Implementation will depend on your booking update logic
    return { received: true };
  }
  
  async handlePaymentFailure(paymentIntent) {
    // Implementation will depend on your booking update logic
    return { received: true };
  }
  
  async handleRefund(charge) {
    // Implementation will depend on your refund handling logic
    return { received: true };
  }
  _enhanceError(error, context = {}) {
    const enhancedError = new Error(error.message);
    enhancedError.originalError = error;
    enhancedError.timestamp = new Date().toISOString();
    enhancedError.context = context;
  
    if (error.response) {
      enhancedError.code = `payment_${context.context}_${error.response.status}`;
      enhancedError.recoverable = ![422, 404].includes(error.response.status);
      enhancedError.serverResponse = error.response.data;
    } else if (error.request) {
      enhancedError.code = `payment_${context.context}_network_error`;
      enhancedError.recoverable = true;
    } else {
      enhancedError.code = `payment_${context.context}_client_error`;
      enhancedError.recoverable = false;
    }
  
    return enhancedError;
  }
}


export default new PaymentAPI();