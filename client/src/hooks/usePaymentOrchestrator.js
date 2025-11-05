import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PaymentOrchestrator } from '../services/PaymentOrchestratorService';
import { VISIBILITY_STATES, MODAL_STATES, PAYMENT_STEPS, PAYMENT_TIMING, PAYMENT_FLOW_STATES } from '../constants/paymentConstants';
import { logger } from '../utils/logger';

export const usePaymentOrchestrator = (bookingId) => {
  const [state, setState] = useState({
    flowId: null,
    flowState: null,
    visibilityState: VISIBILITY_STATES.HIDDEN,
    modalState: MODAL_STATES.BOOKING,
    paymentStep: PAYMENT_STEPS.SESSION,
    transitionState: null,
    initialized: false,
    error: null
  });
  

  // Handle flow initialization with required parameters
  const initializeFlow = useCallback(async (params) => {
    try {
      // Ensure we have minimum required parameters
      if (!params?.bookingId) {
        throw new Error('BookingId is required for flow initialization');
      }

      const initParams = {
        bookingId: params.bookingId,
        amount: params.amount || 0,
        currency: params.currency || 'CHF',
        timing: params.timing || PAYMENT_TIMING.IMMEDIATE,
        metadata: {
          ...params.metadata,
          preserveOnUnmount: true,
          flowState: params.flowState || 'initial',
          timestamp: new Date().toISOString()
        }
      };

      logger.info('[usePaymentOrchestrator] Initializing flow:', {
        params: initParams,
        timestamp: new Date().toISOString()
      });

      const flow = await PaymentOrchestrator.initializePayment(initParams);

      setState(prev => ({
        ...prev,
        flowId: flow.id,
        initialized: true,
        error: null
      }));

      return flow;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error.message
      }));
      throw error;
    }
  }, []);

  const dispatch = async (action) => {
    logger.info('[usePaymentOrchestrator] Dispatch entry:', {
      type: action.type,
      hasState: !!state,
      initialized: state?.initialized,
      flowId: state?.flowId,
      action,
      stateSnapshot: {
        ...state,
        sensitiveData: undefined
      },
      timestamp: new Date().toISOString()
    });
    try {
      logger.info('[usePaymentOrchestrator] Dispatching action:', {
        type: action.type,
        bookingId,
        flowId: state.flowId,
        timestamp: new Date().toISOString()
      });

      switch (action.type) {
        case 'INITIALIZE_PAYMENT': {
          return initializeFlow(action.payload);
        }

        case 'SET_FLOW_STATE': {
          if (!state.initialized && action.payload.state === PAYMENT_FLOW_STATES.CREATING_BOOKING) {
            const confirmationId = action.payload.metadata?.confirmationId;
            if (!confirmationId) {
              logger.error('[usePaymentOrchestrator] Cannot auto-initialize - missing confirmationId:', {
                action,
                timestamp: new Date().toISOString()
              });
              throw new Error('Missing confirmationId for auto-initialization');
            }
        
            const flowId = action.payload.flowId || uuidv4();
            const priceDetails = action.payload.metadata?.priceDetails;
        
            const initParams = {
              flowId,
              amount: priceDetails?.final?.amount || priceDetails?.base?.amount || 0,
              currency: priceDetails?.currency || 'CHF',
              timing: PAYMENT_TIMING.IMMEDIATE,
              metadata: {
                ...action.payload.metadata,
                autoInitialized: true,
                isPreBooking: true,
                flowState: PAYMENT_FLOW_STATES.CREATING_BOOKING,
                preserveOnUnmount: true,
                priceDetails // Preserve full price details
              }
            };
        
            logger.info('[usePaymentOrchestrator] Auto-initialization config:', {
              flowId,
              initConfig: initParams,
              originalAction: action,
              timestamp: new Date().toISOString()
            });
        
            const flow = await initializeFlow(initParams);
        
            if (!flow?.id) {
              logger.error('[usePaymentOrchestrator] Auto-initialization failed - no flow ID:', {
                flowId,
                flow,
                timestamp: new Date().toISOString()
              });
              throw new Error('Flow initialization failed');
            }
        
            logger.info('[usePaymentOrchestrator] Pre-booking flow initialized:', {
              flowId: flow.id,
              confirmationId,
              timestamp: new Date().toISOString()
            });
        
            await PaymentOrchestrator.updateFlow(flow.id, {
              state: action.payload.state,
              metadata: {
                ...action.payload.metadata,
                flowId: flow.id,
                isPreBooking: true,
                timestamp: new Date().toISOString(),
                previousState: state.flowState
              }
            });
        
            return flow;
          }}

        case 'UPDATE_FLOW': {
          const flowId = action.payload.flowId || state.flowId;
          if (!flowId) {
            logger.warn('[usePaymentOrchestrator] No flow ID available for update:', {
              action,
              timestamp: new Date().toISOString()
            });
            return null;
          }

          return PaymentOrchestrator.updateFlow(flowId, {
            ...action.payload,
            metadata: {
              ...action.payload.metadata,
              timestamp: new Date().toISOString(),
              previousState: state.flowState
            }
          });
        }

        case 'WAIT_FOR_MOUNT': {
          logger.info('[usePaymentOrchestrator] Handling wait for mount:', {
            bookingId: action.bookingId,
            flowId: action.flowId || state.flowId,
            timestamp: new Date().toISOString()
          });
        
          const targetFlowId = action.flowId || state.flowId;
          if (!targetFlowId) {
            logger.warn('[usePaymentOrchestrator] Cannot wait for mount - no flow ID:', {
              action,
              timestamp: new Date().toISOString()
            });
            return state;
          }
        
          const completed = await PaymentOrchestrator.waitForMountCompletion(targetFlowId);
          if (!completed) {
            throw new Error('Mount completion failed');
          }
        
          // After successful mount, transition to visible state
          await PaymentOrchestrator.handleVisibilityChange(targetFlowId, VISIBILITY_STATES.VISIBLE, {
            source: 'mount_completion',
            metadata: {
              mountCompletedAt: new Date().toISOString()
            }
          });
        
          return {
            ...state,
            mountComplete: true,
            flowId: targetFlowId,
            visibilityState: VISIBILITY_STATES.VISIBLE
          };
        }

        case 'TRANSITION_TO_PAYMENT': {
          const flowId = action.payload.flowId || state.flowId;
          if (!flowId) {
            logger.warn('[usePaymentOrchestrator] No flow ID available for transition:', {
              action,
              timestamp: new Date().toISOString()
            });
            return null;
          }
        
          try {
            logger.info('[usePaymentOrchestrator] Beginning payment transition:', {
              flowId,
              currentState: state.flowState,
              timestamp: new Date().toISOString()
            });
        
            // First wait for mount
            const mountComplete = await PaymentOrchestrator.waitForMountCompletion(flowId);
            if (!mountComplete) {
              throw new Error('Mount completion failed - cannot proceed with payment transition');
            }
        
            // Then proceed with flow update
            const result = await PaymentOrchestrator.updateFlow(flowId, {
              status: action.payload.status,
              metadata: {
                ...action.payload.metadata,
                timestamp: new Date().toISOString(),
                previousState: state.flowState,
                transitionType: 'payment',
                mountVerified: true
              }
            });
        
            logger.info('[usePaymentOrchestrator] Payment transition completed:', {
              flowId,
              newStatus: action.payload.status,
              timestamp: new Date().toISOString()
            });
        
            return result;
          } catch (error) {
            logger.error('[usePaymentOrchestrator] Payment transition failed:', {
              flowId,
              error: error.message,
              stack: error.stack,
              timestamp: new Date().toISOString()
            });
            throw error;
          }
        }

        case 'INITIATE_CLOSE': {
          if (!state.flowId) {
            logger.info('[usePaymentOrchestrator] No active flow to close');
            return null;
          }

          if (PaymentOrchestrator.handleCleanup) {
            await PaymentOrchestrator.handleCleanup(state.flowId, {
              ...action.payload.metadata,
              timestamp: new Date().toISOString(),
              previousState: state.flowState
            });
          }

          setState(prev => ({
            ...prev,
            flowId: null,
            initialized: false
          }));

          return null;
        }

        default:
          logger.warn('[usePaymentOrchestrator] Unknown action type:', {
            type: action.type,
            bookingId,
            flowId: state.flowId,
            timestamp: new Date().toISOString()
          });
          return null;
      }
    } catch (error) {
      logger.error('[usePaymentOrchestrator] Action dispatch failed:', {
        type: action.type,
        bookingId,
        flowId: state.flowId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });

      // Update state with error
      setState(prev => ({
        ...prev,
        error: error.message
      }));

      throw error;
    }
  };

  useEffect(() => {
    if (!state.flowId) return;
  
    const subscribe = async () => {
      try {
        const unsubscribe = PaymentOrchestrator.subscribeToFlow(
          state.flowId,
          (flowUpdate) => {
            setState(prev => ({
              ...prev,
              flowId: flowUpdate.id,
              flowState: flowUpdate,
              visibilityState: flowUpdate.visibilityState || prev.visibilityState,
              modalState: flowUpdate.modalState || prev.modalState,
              paymentStep: flowUpdate.paymentStep || prev.paymentStep,
              transitionState: flowUpdate.transitionState,
              error: null
            }));
          }
        );
        return unsubscribe;
      } catch (error) {
        logger.error('[usePaymentOrchestrator] Subscription failed:', {
          flowId: state.flowId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        return () => { logger.info('[usePaymentOrchestrator] No subscription to clean up'); };
      }
    };
  
    const unsubscribe = subscribe();
  
    return () => {
      unsubscribe.then(cleanup => cleanup())
        .catch(error => {
          logger.error('[usePaymentOrchestrator] Cleanup failed:', {
            flowId: state.flowId,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        });
    };
  }, [state.flowId]);

  return {
    state,
    dispatch,
    error: state.error
  };
};