import { io } from 'socket.io-client';
import { logger } from '../utils/logger';
import {
  CONNECTION_STATES,
  SUBSCRIPTION_STATES,
  PAYMENT_EVENTS,
  SUBSCRIPTION_EVENTS,
  SOCKET_CONFIG,
  SUBSCRIPTION_TIMEOUTS
} from '../constants/paymentSocketConstants';

class ConnectionStateManager {
  constructor() {
    this.connectionAttempts = new Map();
    this.stateTransitions = new Map();
    this.connectionGuards = new Map();
  }

  recordAttempt(connectionId, metadata = {}) {
    const attempts = this.connectionAttempts.get(connectionId) || [];
    attempts.push({
      timestamp: new Date().toISOString(),
      ...metadata
    });
    this.connectionAttempts.set(connectionId, attempts.slice(-5)); // Keep last 5 attempts
    
   
  }

  async createConnectionGuard(connectionId, timeoutMs = 5000) {
    const guardId = `${connectionId}-${Date.now()}`;
    
    logger.info('[ConnectionStateManager] Creating connection guard:', {
      connectionId,
      guardId,
      timeoutMs,
      timestamp: new Date().toISOString()
    });

    return new Promise((resolve, reject) => {
      const guard = {
        id: guardId,
        timeout: setTimeout(() => {
          this.connectionGuards.delete(guardId);
          logger.error('[ConnectionStateManager] Connection guard timeout:', {
            connectionId,
            guardId,
            duration: timeoutMs,
            timestamp: new Date().toISOString()
          });
          reject(new Error('Connection guard timeout'));
        }, timeoutMs),
        resolve: () => {
          clearTimeout(guard.timeout);
          this.connectionGuards.delete(guardId);
          resolve();
        }
      };

      this.connectionGuards.set(guardId, guard);
    });
  }

  recordTransition(connectionId, fromState, toState, metadata = {}) {
    const transitions = this.stateTransitions.get(connectionId) || [];
    const transition = {
      from: fromState,
      to: toState,
      timestamp: new Date().toISOString(),
      metadata
    };
    
    transitions.push(transition);
    this.stateTransitions.set(connectionId, transitions.slice(-10)); // Keep last 10 transitions

    
  }

  getConnectionHistory(connectionId) {
    return {
      attempts: this.connectionAttempts.get(connectionId) || [],
      transitions: this.stateTransitions.get(connectionId) || []
    };
  }

  cleanup(connectionId) {
    this.connectionAttempts.delete(connectionId);
    this.stateTransitions.delete(connectionId);
    
    // Clean up any pending guards
    for (const [guardId, guard] of this.connectionGuards.entries()) {
      if (guardId.startsWith(connectionId)) {
        clearTimeout(guard.timeout);
        this.connectionGuards.delete(guardId);
      }
    }

    logger.info('[ConnectionStateManager] Connection state cleaned up:', {
      connectionId,
      timestamp: new Date().toISOString()
    });
  }
}

class PaymentSocketService {
  constructor() {
    this._connections = new Map();
    this.socket = null;
    this.isConnecting = false;
    this.connectionAttempts = 0;
    this.MAX_RETRY_ATTEMPTS = 3;
    this.activeSubscriptions = new Map();
    this.retryTimeouts = new Map();
    this.connectionPromise = null;
    this.heartbeatInterval = null;
    this.disconnectTimeout = null;
    this.connectionState = CONNECTION_STATES.DISCONNECTED;
    this.connectionPromise = null;
    this.connectionTimeout = null;
    this._setupHeartbeat();
  }

  isSocketConnected() {
    return this.socket?.connected || false;
  }
  
  subscriptionStates = new Map();
  subscriptionTimeouts = new Map();
  _connectionAttempts = new Map();
  _pendingOperations = new Map();

  _checkRateLimit() {
    const now = Date.now();
    const recentAttempts = Array.from(this._connectionAttempts.values())
        .filter(timestamp => (now - timestamp) < 60000); // Look at last minute

    if (recentAttempts.length >= 10) { // Max 10 attempts per minute
        logger.warn('[PaymentSocket] Rate limit exceeded:', {
            attempts: recentAttempts.length,
            timeWindow: '60s',
            timestamp: new Date().toISOString()
        });
        return false;
    }

    this._connectionAttempts.set(now, now);
    // Cleanup old attempts
    for (const [timestamp] of this._connectionAttempts) {
        if (now - timestamp > 60000) {
            this._connectionAttempts.delete(timestamp);
        }
    }
    
    return true;
}

async ensureConnection() {
  const connectionId = `conn-${Date.now()}`;
  this.stateManager = this.stateManager || new ConnectionStateManager();
  this.MAX_RETRY_ATTEMPTS = 5;

  if (this.socket?.connected) {
    if (await this._checkConnectionHealth(2000)) { // Increase timeout to 2s
     
      return true;
    }
    logger.warn('[PaymentSocket] Existing connection invalid, forcing reconnect:', {
      socketId: this.socket.id,
      timestamp: new Date().toISOString()
    });
  }

  if (this.isConnecting) {
    logger.info('[PaymentSocket] Connection in progress:', {
      connectionId,
      attempts: this.connectionAttempts,
      promise: !!this.connectionPromise,
      timestamp: new Date().toISOString()
    });
    return this.connectionPromise || false;
  }

  this.isConnecting = true;
  this.stateManager.recordAttempt(connectionId);

  try {
    if (this.socket) {
    
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    const userId = localStorage.getItem('userId') || JSON.parse(localStorage.getItem('user'))?._id;
      const token = localStorage.getItem('token');

      if (!userId || !token) {
          logger.error('[PaymentSocket] Cannot establish connection: Missing userId or token in localStorage.', { connectionId, attempt: this.connectionAttempts });
          this.isConnecting = false; // Reset connecting flag
          this.connectionPromise = null;
          this.connectionAttempts = 0; // Reset attempts as we can't proceed
          throw new Error('Authentication credentials not found for PaymentSocket.');
      }
     

    // Initialize heartbeat state early
    this._setupHeartbeat();

    this.connectionPromise = new Promise((resolve, reject) => {
      const socketUrl = process.env.REACT_APP_API_URL.replace('/api', '');
      

      this.socket = io(socketUrl, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        auth: { userId, token, connectionType: 'payment' }
      });



      this.socket.io.on("reconnect_failed", () => {
        logger.error('[PaymentSocket] Reconnection failed:', {
          connectionId,
          attempts: this.connectionAttempts,
          timestamp: new Date().toISOString()
        });
      });

      this._monitorConnection();

      this.socket.on('connect', async () => {
        try {
          await this._checkConnectionHealth(2000); // 2s timeout
          logger.info('[PaymentSocket] Connected successfully:', {
            socketId: this.socket.id,
            connectionId,
            attempt: this.connectionAttempts + 1,
            timestamp: new Date().toISOString()
          });
          this.connectionState = CONNECTION_STATES.CONNECTED;
          this.isConnecting = false;
          this._resetDisconnectTimeout();
          this.stateManager.recordTransition(
            connectionId,
            CONNECTION_STATES.CONNECTING,
            CONNECTION_STATES.CONNECTED,
            { socketId: this.socket.id }
          );

          // Re-subscribe to all active flow subscriptions
          this.activeSubscriptions.forEach((callbacksMap, eventName) => {
            callbacksMap.forEach((callbacks, subscriptionId) => {
              const flowId = subscriptionId.split('-')[0]; // Extract flowId from subscriptionId
              logger.info('[PaymentSocket] Re-subscribing to flow after reconnect:', {
                flowId,
                eventName,
                subscriptionId,
                callbackCount: Object.keys(callbacks).length,
                timestamp: new Date().toISOString()
              });
              this.socket.emit('join_flow', { 
                flowId,
                timestamp: new Date().toISOString()
              }, (ack) => {
                if (ack?.success) {
                  logger.info('[PaymentSocket] Re-joined flow room successfully:', {
                    flowId,
                    subscriptionId,
                    timestamp: new Date().toISOString()
                  });
                } else {
                  logger.warn('[PaymentSocket] Failed to re-join flow room:', {
                    flowId,
                    subscriptionId,
                    error: ack?.error,
                    timestamp: new Date().toISOString()
                  });
                }
              });
              // Re-bind callbacks
              Object.entries(callbacks).forEach(([event, callback]) => {
                const normalizedEvent = this._normalizeEventName(event);
                this._registerEventCallback(flowId, normalizedEvent, callback);
              });
            });
          });

          resolve(true);
        } catch (error) {
          logger.warn('[PaymentSocket] Connection established but unhealthy, proceeding anyway:', {
            socketId: this.socket.id,
            connectionId,
            error: error.message,
            timestamp: new Date().toISOString()
          });
          this.connectionState = CONNECTION_STATES.CONNECTED;
          this.isConnecting = false;
          resolve(true); // Proceed despite health check failure
        }
      });

      this.socket.on('connect_error', (error) => {
        logger.error('[PaymentSocket] Connection error:', {
          error: error.message,
          connectionId,
          attempt: this.connectionAttempts + 1,
          timestamp: new Date().toISOString()
        });
        reject(error);
      });

      this.socket.connect();
    });

    return await this.connectionPromise;
  } catch (error) {
    this.connectionAttempts++;
    this.isConnecting = false;
    this.connectionPromise = null;

    logger.error('[PaymentSocket] Connection attempt failed:', {
      error: error.message,
      connectionId,
      attempt: this.connectionAttempts,
      maxAttempts: this.MAX_RETRY_ATTEMPTS,
      timestamp: new Date().toISOString()
    });

    if (this.connectionAttempts >= this.MAX_RETRY_ATTEMPTS) {
      this.resetConnectionState();
      this.stateManager.cleanup(connectionId);
      throw error;
    }

    const delay = Math.min(
      SOCKET_CONFIG.TIMEOUTS.RETRY_BASE * Math.pow(2, this.connectionAttempts - 1),
      SOCKET_CONFIG.CONNECTION.reconnectionDelayMax
    );

    await new Promise(resolve => setTimeout(resolve, delay));
    return this.ensureConnection();
  } finally {
    if (!this.socket?.connected) {
      this.stateManager.cleanup(connectionId);
    }
  }
}

  async _ensureUniqueOperation(operationKey, operation) {
    // Check for existing operation
    if (this._pendingOperations.has(operationKey)) {
      logger.info('[PaymentSocket] Operation already in progress:', {
        operationKey,
        timestamp: new Date().toISOString()
      });
      return this._pendingOperations.get(operationKey);
    }
  
    // Create new operation promise
    const operationPromise = (async () => {
      try {
        logger.debug('[PaymentSocket] Starting unique operation:', {
          operationKey,
          timestamp: new Date().toISOString()
        });
        
        const result = await operation();
        
        logger.debug('[PaymentSocket] Operation completed successfully:', {
          operationKey,
          timestamp: new Date().toISOString()
        });
        
        return result;
      } catch (error) {
        logger.error('[PaymentSocket] Operation failed:', {
          operationKey,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      } finally {
        this._pendingOperations.delete(operationKey);
      }
    })();
  
    // Store the promise
    this._pendingOperations.set(operationKey, operationPromise);
    return operationPromise;
  }

  async _establishConnection() {
    if (this.connectionState === CONNECTION_STATES.CONNECTING) {
      
      return this.connectionPromise;
    }

    this.connectionState = CONNECTION_STATES.CONNECTING;
    this.isConnecting = true;

    try {
      // Fix the socket URL construction
      const socketUrl = process.env.REACT_APP_API_URL.replace('/api', '');
      
      logger.info('[PaymentSocket] Initializing connection:', {
        attempt: this.connectionAttempts + 1,
        socketUrl,
        path: SOCKET_CONFIG.CONNECTION.path,
        timestamp: new Date().toISOString()
      });

      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
      }

      this.socket = io(socketUrl, {
        path: SOCKET_CONFIG.CONNECTION.path,
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        auth: { type: 'payment' }
      });

      this.connectionPromise = Promise.race([
        this._handleConnectionEvents(),
        this._createTimeoutPromise(SOCKET_CONFIG.TIMEOUTS.CONNECTION)
      ]);

      await this.connectionPromise;
      
      this.connectionState = CONNECTION_STATES.CONNECTED;
      logger.info('[PaymentSocket] Connection established successfully', {
        socketId: this.socket.id,
        timestamp: new Date().toISOString()
      });
      
      return true;

    } catch (error) {
      return this._handleConnectionFailure(error);
    }
}

_cleanupSubscriptions(flowId) {
  logger.info('[PaymentSocket] Cleaning up subscriptions:', {
    flowId,
    activeSubscriptions: Array.from(this.activeSubscriptions.keys()),
    timestamp: new Date().toISOString()
  });

  // Remove all callbacks for this flowId across events
  this.activeSubscriptions.forEach((subscriptions, eventName) => {
    const flowSubscriptions = subscriptions.get(flowId);
    if (flowSubscriptions) {
      subscriptions.delete(flowId);
      logger.debug('[PaymentSocket] Removed subscriptions:', {
        flowId,
        eventName,
        callbackCount: flowSubscriptions.size,
        timestamp: new Date().toISOString()
      });
    }
    if (subscriptions.size === 0) {
      this.activeSubscriptions.delete(eventName);
    }
  });

  // Leave the flow room if connected
  if (this.socket?.connected) {
    this.socket.emit('leave_flow', { 
      flowId,
      timestamp: new Date().toISOString()
    }, (ack) => {
      if (ack?.success) {
        logger.info('[PaymentSocket] Successfully left flow room:', {
          flowId,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.warn('[PaymentSocket] Failed to leave flow room:', {
          flowId,
          error: ack?.error,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  // Clear subscription state
  this._subscriptionStates?.delete(flowId);
}

async _restorePersistentCallbacks(flowId) {
  logger.info('[PaymentSocket] Restoring persistent callbacks:', {
    flowId,
    persistentCount: this.persistentSubscriptions?.get(flowId)?.size || 0,
    timestamp: new Date().toISOString()
  });

  if (!this.persistentSubscriptions?.has(flowId) || !this.socket?.connected) return;

  const eventName = `flow:${flowId}`;
  const callbacksMap = this.activeSubscriptions.get(eventName) || new Map();
  this.activeSubscriptions.set(eventName, callbacksMap);

  const persistentCallbacks = this.persistentSubscriptions.get(flowId);
  persistentCallbacks.forEach((callbacks, subscriptionId) => {
    if (!callbacksMap.has(subscriptionId)) {
      callbacksMap.set(subscriptionId, callbacks);
      this._setSubscriptionState(subscriptionId, {
        flowId,
        eventName,
        callbacks,
        active: true,
        startedAt: new Date().toISOString()
      });
    }

    Object.entries(callbacks).forEach(([event, callback]) => {
      const normalizedEvent = this._normalizeEventName(event);
      this._registerEventCallback(flowId, normalizedEvent, (data) => {
        const currentCallbacks = this.activeSubscriptions.get(eventName);
        if (currentCallbacks?.get(subscriptionId)) {
          callback(data);
        } else {
          logger.warn('[PaymentSocket] Callback not found for event during restore:', {
            flowId,
            subscriptionId,
            event: normalizedEvent,
            timestamp: new Date().toISOString()
          });
        }
      });
    });
  });

  this.socket.emit('join_flow', { flowId }, (ack) => {
    logger.info('[PaymentSocket] Re-joined flow room during restore:', {
      flowId,
      success: ack?.success,
      error: ack?.error,
      timestamp: new Date().toISOString()
    });
  });
}

async subscribeToFlowStatus(flowId, callbacks = {}) {
  if (!flowId) {
    logger.error('[PaymentSocket] Cannot subscribe to flow - missing flowId', {
      timestamp: new Date().toISOString()
    });
    return () => {
      logger.debug('[PaymentSocket] Executing no-op cleanup for failed subscription');
    };
  }

  // Persistent storage for callbacks to survive reconnections
  if (!this.persistentSubscriptions) {
    this.persistentSubscriptions = new Map();
  }
  if (!this.persistentSubscriptions.has(flowId)) {
    this.persistentSubscriptions.set(flowId, new Map());
  }

 

  return this._ensureUniqueOperation(`subscribe:flow:${flowId}`, async () => {
    try {
      const connected = await this.ensureReliableConnection({ 
        context: { 
          operation: 'flow_subscription', 
          flowId 
        } 
      });
      
      if (!connected) {
        logger.warn('[PaymentSocket] Failed to establish reliable connection, subscription may not receive updates:', {
          flowId,
          timestamp: new Date().toISOString()
        });
      }

      const validatedCallbacks = this._normalizeCallbacks(callbacks);
      if (!Object.keys(validatedCallbacks).length) {
        logger.warn('[PaymentSocket] No valid callbacks for subscription:', {
          flowId,
          original: Object.keys(callbacks),
          timestamp: new Date().toISOString()
        });
        return () => {
          logger.debug('[PaymentSocket] No valid callbacks for subscription cleanup');
        };
      }

      const subscriptionId = `${flowId}-${Date.now()}`;
      const eventName = `flow:${flowId}`;
      let callbacksMap = this.activeSubscriptions.get(eventName);

      if (!callbacksMap) {
        callbacksMap = new Map();
        this.activeSubscriptions.set(eventName, callbacksMap);
      }

      // Store callbacks with unique subscription ID in both active and persistent maps
      callbacksMap.set(subscriptionId, validatedCallbacks);
      this.persistentSubscriptions.get(flowId).set(subscriptionId, validatedCallbacks);
      this._setSubscriptionState(subscriptionId, {
        flowId,
        eventName,
        callbacks: validatedCallbacks,
        active: true,
        startedAt: new Date().toISOString()
      });

      let roomJoined = false;
      try {
        roomJoined = await this._attemptRoomJoin(flowId);
        logger.info('[PaymentSocket] Room joined successfully:', {
          flowId,
          subscriptionId,
          roomJoined,
          timestamp: new Date().toISOString()
        });
      } catch (roomError) {
        logger.warn('[PaymentSocket] Room join failed, using direct events:', {
          flowId,
          error: roomError.message,
          timestamp: new Date().toISOString()
        });
      }

      // Restore persistent callbacks after reconnect or bind new ones
      if (!this.activeSubscriptions.get(eventName).size > 1 || roomJoined) {
        const allCallbacks = this.persistentSubscriptions.get(flowId);
        allCallbacks.forEach((persistentCallbacks, persistentSubId) => {
          Object.entries(persistentCallbacks).forEach(([event, callback]) => {
            const normalizedEvent = this._normalizeEventName(event);
            this._registerEventCallback(flowId, normalizedEvent, (data) => {
              const currentCallbacks = this.activeSubscriptions.get(eventName);
              if (currentCallbacks?.get(persistentSubId)) {
                callback(data);
              } else {
                logger.warn('[PaymentSocket] Callback not found for event:', {
                  flowId,
                  subscriptionId: persistentSubId,
                  event: normalizedEvent,
                  timestamp: new Date().toISOString()
                });
              }
            });
          });
        });
      }

      // Explicitly restore all persistent callbacks after connection
      if (connected) {
        await this._restorePersistentCallbacks(flowId);
      }

      return () => {
        logger.info('[PaymentSocket] Executing flow unsubscribe:', {
          flowId,
          subscriptionId,
          remainingCallbacks: callbacksMap.size - 1,
          timestamp: new Date().toISOString()
        });

        callbacksMap.delete(subscriptionId);
        this.persistentSubscriptions.get(flowId).delete(subscriptionId);
        if (callbacksMap.size === 0) {
          this.activeSubscriptions.delete(eventName);
          logger.debug('[PaymentSocket] All callbacks removed for event:', {
            eventName,
            flowId,
            timestamp: new Date().toISOString()
          });
        }
        if (this.persistentSubscriptions.get(flowId).size === 0) {
          this.persistentSubscriptions.delete(flowId);
        }
        this._cleanupSubscriptions(flowId);
      };
    } catch (error) {
      logger.error('[PaymentSocket] Flow subscription failed:', {
        flowId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });

      this._cleanupSubscriptions(flowId);
      throw error;
    }
  });
}

// Add these new helper methods
_normalizeCallbacks(callbacks) {
  return Object.entries(callbacks).reduce((normalized, [event, callback]) => {
    if (typeof callback !== 'function') {
      logger.warn('[PaymentSocket] Invalid callback type:', {
        event,
        type: typeof callback,
        timestamp: new Date().toISOString()
      });
      return normalized;
    }

    const normalizedEvent = this._normalizeEventName(event);
    if (!normalizedEvent) return normalized;

    return {
      ...normalized,
      [normalizedEvent]: callback
    };
  }, {});
}

_registerEventCallback(flowId, event, callback) {
  logger.debug('[PaymentSocket] Registering flow event callback:', {
    flowId,
    event,
    timestamp: new Date().toISOString()
  });

  if (!this.activeSubscriptions.has(event)) {
    this.activeSubscriptions.set(event, new Map());
  }

  const eventSubscriptions = this.activeSubscriptions.get(event);
  if (!eventSubscriptions.has(flowId)) {
    eventSubscriptions.set(flowId, new Set());
  }

  eventSubscriptions.get(flowId).add(callback);
}

_setSubscriptionState(flowId, state) {
  logger.debug('[PaymentSocket] Setting subscription state:', {
    flowId,
    state,
    timestamp: new Date().toISOString()
  });

  if (!this._subscriptionStates) {
    this._subscriptionStates = new Map();
  }

  this._subscriptionStates.set(flowId, {
    ...state,
    lastUpdated: new Date().toISOString()
  });
}

// Add new method for flow unsubscribe:
/*async unsubscribeFromFlow(flowId, callbacks = {}) {
  if (!flowId) return;

  logger.info('[PaymentSocket] Unsubscribing from flow:', {
    flowId,
    timestamp: new Date().toISOString()
  });

  // Cleanup subscriptions
  Object.entries(callbacks).forEach(([event, callback]) => {
    this._cleanupSubscriptions(flowId, event, callback);
  });

  // Leave flow room
  if (this.socket?.connected) {
    try {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 1000);
        this.socket.emit('leave_flow', { 
          flowId,
          timestamp: new Date().toISOString()
        }, () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } catch (error) {
      logger.warn('[PaymentSocket] Error leaving flow room:', {
        flowId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  this._cleanupSubscriptionss(flowId);
}*/

// Add a new handler for flow events:
_handleFlowEvent(eventName, data) {
  const subscriptions = this.activeSubscriptions.get(eventName);
  
  logger.debug('[PaymentSocket] Received flow event:', {
    event: eventName,
    flowId: data?.flowId,
    hasSubscriptions: !!subscriptions?.has(data?.flowId),
    timestamp: new Date().toISOString()
  });

  if (subscriptions?.has(data?.flowId)) {
    const callbacks = subscriptions.get(data?.flowId);
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        logger.error('[PaymentSocket] Error in flow event handler:', {
          event: eventName,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }
}

  _updateSubscriptionState(paymentId, state, metadata = {}) {
    logger.info('[PaymentSocket] Updating subscription state:', {
      paymentId,
      previousState: this.subscriptionStates.get(paymentId)?.state,
      newState: state,
      metadata,
      timestamp: new Date().toISOString()
    });
  
    this.subscriptionStates.set(paymentId, {
      state,
      updatedAt: new Date().toISOString(),
      ...metadata
    });
  }

  _handleConnectionEvents() {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      logger.info('[PaymentSocket] Setting up connection event handlers:', {
        connectionState: this.connectionState,
        isConnecting: this.isConnecting,
        connectionAttempts: this.connectionAttempts,
        hasExistingSocket: !!this.socket,
        activeSubscriptions: Array.from(this.activeSubscriptions.keys()),
        timestamp: new Date().toISOString()
      });

      // Handle successful connection
      this.socket.on('connect', () => {
        logger.info('[PaymentSocket] Connected successfully:', {
          socketId: this.socket.id,
          timestamp: new Date().toISOString()
        });
        
        this.connectionAttempts = 0;
        this._resetDisconnectTimeout();
        this._resubscribeAll();
        resolve(true);
      });

      // Handle connection errors
      this.socket.on('connect_error', (error) => {
        logger.error('[PaymentSocket] Connection error:', {
          error: error.message,
          attempt: this.connectionAttempts + 1,
          timestamp: new Date().toISOString()
        });
        reject(error);
      });

      // Handle disconnects
      this.socket.on('disconnect', (reason) => {
        this._handleDisconnect(reason);
      });

      // Set up payment event handlers
      Object.values(SOCKET_CONFIG.EVENTS.PAYMENT).forEach(eventName => {
        this.socket.on(eventName, this._createEventHandler(eventName));
      });
    });
  }

  _createTimeoutPromise(duration) {
    return new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, duration);

      // Cleanup timeout if socket connects
      if (this.socket) {
        this.socket.once('connect', () => clearTimeout(timeoutId));
      }
    });
  }

  async _handleConnectionFailure(error) {
    this.connectionAttempts++;
    logger.error('[PaymentSocket] Connection failed:', {
      error: error.message,
      attempt: this.connectionAttempts,
      maxAttempts: this.MAX_RETRY_ATTEMPTS,
      timestamp: new Date().toISOString()
    });

    if (this.connectionAttempts >= this.MAX_RETRY_ATTEMPTS) {
      logger.error('[PaymentSocket] Max connection attempts reached:', {
        attempts: this.connectionAttempts,
        timestamp: new Date().toISOString()
      });
      this.resetConnectionState();
      throw error;
    }

    // Calculate backoff delay with jitter
    const baseDelay = SOCKET_CONFIG.TIMEOUTS.RETRY_BASE;
    const maxJitter = 1000; // 1s maximum jitter
    const jitter = Math.random() * maxJitter;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.connectionAttempts - 1) + jitter,
      SOCKET_CONFIG.CONNECTION.reconnectionDelayMax
    );

    logger.info('[PaymentSocket] Scheduling reconnection:', {
      attempt: this.connectionAttempts,
      delay,
      timestamp: new Date().toISOString()
    });

    await new Promise(resolve => setTimeout(resolve, delay));
    return this.ensureConnection();
  }

  _scheduleReconnect(immediate = false) {
    if (this.retryTimeouts.has('reconnect')) {
      clearTimeout(this.retryTimeouts.get('reconnect'));
    }

    const timeoutId = setTimeout(() => {
      this.retryTimeouts.delete('reconnect');
      if (!this.socket?.connected) {
        this.ensureConnection();
      }
    }, immediate ? 0 : SOCKET_CONFIG.TIMEOUTS.RETRY_BASE);

    this.retryTimeouts.set('reconnect', timeoutId);
  }

  _setupHeartbeat() {
    this._clearHeartbeat();
  
    // Track heartbeat state
    this._heartbeatState = {
      lastPing: Date.now(),
      lastPong: Date.now(),
      missedBeats: 0,
      maxMissedBeats: 3
    };
  
    this.heartbeatInterval = setInterval(() => {
      if (!this.socket?.connected) {
        this._clearHeartbeat();
        return;
      }
  
      const now = Date.now();
      const timeSinceLastPong = now - this._heartbeatState.lastPong;
  
      // Check for missed heartbeats
      if (timeSinceLastPong > 20000) { // 20s threshold
        this._heartbeatState.missedBeats++;
        
        logger.warn('[PaymentSocket] Missed heartbeat:', {
          socketId: this.socket.id,
          missedBeats: this._heartbeatState.missedBeats,
          timeSinceLastPong: timeSinceLastPong,
          timestamp: new Date().toISOString()
        });
  
        if (this._heartbeatState.missedBeats >= this._heartbeatState.maxMissedBeats) {
          logger.error('[PaymentSocket] Max missed heartbeats exceeded:', {
            socketId: this.socket.id,
            missedBeats: this._heartbeatState.missedBeats,
            timestamp: new Date().toISOString()
          });
          
          // Force reconnection
          this.socket.disconnect();
          this.ensureConnection();
          return;
        }
      }
  
      // Send ping
      const pingStart = Date.now();
      this._heartbeatState.lastPing = pingStart;
  
      this.socket.emit('ping', () => {
        const latency = Date.now() - pingStart;
        this._heartbeatState.lastPong = Date.now();
        this._heartbeatState.missedBeats = 0;
  
      
      });
    }, 15000);
  
    // Add pong handler
    if (this.socket) {
      this.socket.on('pong', () => {
        this._heartbeatState.lastPong = Date.now();
        this._heartbeatState.missedBeats = 0;
        this._resetDisconnectTimeout();
      });
    }
  }

  async ensureReliableConnection(options = {}) {
    const { maxAttempts = 3, timeout = 5000, context = {} } = options;
    
    logger.info('[PaymentSocket] Ensuring reliable connection:', {
      maxAttempts,
      timeout,
      context,
      currentState: this.getConnectionState(),
      timestamp: new Date().toISOString()
    });
    
    // If already connected and connection is healthy, return immediately
    if (this.socket?.connected && await this._checkConnectionHealth()) {
      logger.info('[PaymentSocket] Using existing healthy connection:', {
        socketId: this.socket.id,
        context,
        timestamp: new Date().toISOString()
      });
      return true;
    }
    
    // Create a connection promise with timeout
    const connectionPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, timeout);
      
      this.ensureConnection()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
    
    // Try connecting with retry logic
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await connectionPromise;
        logger.info('[PaymentSocket] Connection established successfully:', {
          attempt,
          context,
          socketId: this.socket?.id,
          timestamp: new Date().toISOString()
        });
        // Restore all persistent callbacks for all flows after successful reconnect
        if (this.persistentSubscriptions) {
          await Promise.all(
            Array.from(this.persistentSubscriptions.keys()).map(flowId =>
              this._restorePersistentCallbacks(flowId)
            )
          );
        }
        return result;
      } catch (error) {
        if (attempt === maxAttempts) {
          logger.error('[PaymentSocket] Failed to establish connection after all attempts:', {
            attempts: maxAttempts,
            context,
            error: error.message,
            timestamp: new Date().toISOString()
          });
          throw error;
        }
        
        const delay = 1000 * Math.pow(2, attempt - 1);
        logger.warn('[PaymentSocket] Connection attempt failed, retrying:', {
          attempt,
          nextAttemptDelay: delay,
          error: error.message,
          context,
          timestamp: new Date().toISOString()
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return false;
  }
  
  // Add a connection health check method
  async _checkConnectionHealth(timeoutMs = 2000) {
    if (!this.socket?.connected) return false;
  
    try {
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Ping timeout'));
        }, timeoutMs);
  
        this.socket.emit('ping', () => {
          clearTimeout(timeout);
          resolve(true);
        });
      });
      return response === true;
    } catch (error) {
      logger.warn('[PaymentSocket] Connection health check failed:', {
        error: error.message,
        socketId: this.socket?.id,
        timeoutMs,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }

  _monitorConnection() {
    if (this._monitorInterval) clearInterval(this._monitorInterval);
  
    this._monitorInterval = setInterval(() => {
      if (!this.socket?.connected) return;
  
      if (!this._heartbeatState) {
        logger.warn('[PaymentSocket] Heartbeat state not initialized, forcing setup:', {
          socketId: this.socket.id,
          timestamp: new Date().toISOString(),
        });
        this._setupHeartbeat(); // Force heartbeat setup if missing
      }
  
      const connectionStats = {
        socketId: this.socket.id,
        uptime: Date.now() - this._heartbeatState.lastPong,
        missedBeats: this._heartbeatState.missedBeats,
        reconnectionAttempts: this.connectionAttempts,
        subscriptions: this.activeSubscriptions.size,
        timestamp: new Date().toISOString(),
      };
  
      if (connectionStats.uptime > 300000) { // 5 minutes
        logger.info('[PaymentSocket] Connection health check:', connectionStats);
      }
  
      // Check for stale subscriptions
      this.activeSubscriptions.forEach((subscriptions, eventName) => {
        subscriptions.forEach((callbacks, subId) => {
          const subState = this.subscriptionStates.get(subId);
          if (subState && (Date.now() - new Date(subState.updatedAt).getTime() > 600000)) { // 10 minutes
            logger.warn('[PaymentSocket] Stale subscription detected:', {
              eventName,
              subId,
              age: Date.now() - new Date(subState.updatedAt).getTime(),
              timestamp: new Date().toISOString(),
            });
          }
        });
      });
    }, 60000); // Check every minute
  }

  _clearHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  _resetDisconnectTimeout() {
    if (this.disconnectTimeout) {
      clearTimeout(this.disconnectTimeout);
      this.disconnectTimeout = null;
    }
  }

  // Event handling with timeout protection
  _createEventHandler(eventName) {
    return (data) => {
      const timeoutId = setTimeout(() => {
        logger.warn('[PaymentSocket] Event handler timeout:', {
          event: eventName,
          paymentId: data?.paymentId,
          timestamp: new Date().toISOString()
        });
      }, SOCKET_CONFIG.TIMEOUTS.EVENT);

      try {
        this._handlePaymentEvent(eventName, data);
      } catch (error) {
        logger.error('[PaymentSocket] Error handling payment event:', {
          event: eventName,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      } finally {
        clearTimeout(timeoutId);
      }
    };
  }

// Subscription Management
async subscribeToPayment(paymentId, callbacks = {}) {
  if (!paymentId) {
    logger.error('[PaymentSocket] Cannot subscribe - missing paymentId');
    return () => {
      logger.debug('[PaymentSocket] Executing cleanup for invalid subscription:', {
        paymentId: 'invalid',
        timestamp: new Date().toISOString()
      });
    };
  }

  logger.info('[PaymentSocket] Setting up payment subscription:', {
    paymentId,
    connectionState: this.connectionState,
    socketConnected: this.socket?.connected,
    existingSubscriptions: Array.from(this.activeSubscriptions.entries()).map(([key, value]) => ({
      key,
      subscribersCount: value.size
    })),
    timestamp: new Date().toISOString()
  });

  return this._ensureUniqueOperation(`subscribe:${paymentId}`, async () => {
    const validatedCallbacks = this._validateCallbacks(callbacks);
    if (Object.keys(validatedCallbacks).length === 0) {
      logger.warn('[PaymentSocket] No valid callbacks provided:', {
        paymentId,
        timestamp: new Date().toISOString()
      });
      return () => {
        logger.debug('[PaymentSocket] Cleanup for no valid callbacks:', {
          paymentId,
          timestamp: new Date().toISOString()
        });
      };
    }

    this._updateSubscriptionState(paymentId, SUBSCRIPTION_STATES.SUBSCRIBING);

    try {
      const connected = await Promise.race([
        this.ensureConnection(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Subscription timeout')), 
          SUBSCRIPTION_TIMEOUTS.SUBSCRIBE)
        )
      ]);

      if (!connected) {
        throw new Error('Failed to establish socket connection');
      }

      Object.entries(validatedCallbacks).forEach(([event, callback]) => {
        this._registerEventCallback(paymentId, event, callback);
      });

      const roomJoined = await this._attemptRoomJoin(paymentId);
      if (!roomJoined) {
        logger.warn('[PaymentSocket] Room join failed, using direct events:', {
          paymentId,
          timestamp: new Date().toISOString()
        });
      }

      this._updateSubscriptionState(paymentId, SUBSCRIPTION_STATES.ACTIVE);

      return () => {
        logger.info('[PaymentSocket] Unsubscribing from payment:', {
          paymentId,
          timestamp: new Date().toISOString()
        });
        this.unsubscribeFromPayment(paymentId, validatedCallbacks);
      };
    } catch (error) {
      logger.error('[PaymentSocket] Subscription setup failed:', {
        paymentId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      this._handleSubscriptionError(paymentId, error);
      return () => {
        logger.debug('[PaymentSocket] Cleanup for failed subscription:', {
          paymentId,
          timestamp: new Date().toISOString()
        });
      };
    }
  });
}

_normalizeEventName(event) {
  

  // Handle direct matches
  if (PAYMENT_EVENTS[event]) {
    return PAYMENT_EVENTS[event];
  }

  // Handle shortened versions (e.g., 'status' -> 'payment_status_update')
  const eventMap = {
    'status': PAYMENT_EVENTS.STATUS_UPDATE,
    'payment_status': PAYMENT_EVENTS.STATUS_UPDATE,
    'intent_created': PAYMENT_EVENTS.INTENT_CREATED,
    'confirmation': PAYMENT_EVENTS.CONFIRMATION_RECEIVED,
    'action_required': PAYMENT_EVENTS.ACTION_REQUIRED,
    'error': PAYMENT_EVENTS.ERROR_OCCURRED
  };

  const normalizedEvent = eventMap[event] || event;
  
  logger.debug('[PaymentSocket] Event name normalized:', {
    original: event,
    normalized: normalizedEvent,
    isKnownEvent: Object.values(PAYMENT_EVENTS).includes(normalizedEvent),
    timestamp: new Date().toISOString()
  });

  return normalizedEvent;
}

/**
 * Creates a SetupIntent to validate and save a customer's card for future use.
 * @param {object} payload - The details for the SetupIntent.
 * @param {string} payload.stripeCustomerId - The Stripe Customer ID.
 * @param {object} payload.metadata - Metadata to attach to the intent.
 * @returns {Promise<object>} The Stripe SetupIntent object.
 */
async createSetupIntentForSession({ stripeCustomerId, metadata = {} }) {
  const logContext = { function: 'createSetupIntentForSession', stripeCustomerId, metadata };
  logger.info('[PaymentService] Creating SetupIntent for session.', logContext);
  
  try {
    const setupIntent = await this.stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session', // Indicate we intend to charge this card later
      metadata,
    });

    logger.info('[PaymentService] SetupIntent created successfully.', { setupIntentId: setupIntent.id, ...logContext });
    return setupIntent;
  } catch (error) {
    logger.error('[PaymentService] Error creating SetupIntent.', { ...logContext, error: error.message });
    throw this.enhanceStripeError(error);
  }
}

_validateCallbacks(callbacks) {


  return Object.entries(callbacks).reduce((valid, [event, callback]) => {
    if (typeof callback !== 'function') {
      logger.warn('[PaymentSocket] Invalid callback type for event:', { 
        event,
        callbackType: typeof callback,
        timestamp: new Date().toISOString()
      });
      return valid;
    }

    const normalizedEvent = this._normalizeEventName(event);
    const isValidEvent = Object.values(PAYMENT_EVENTS).includes(normalizedEvent) ||
                        Object.values(SOCKET_CONFIG.EVENTS.PAYMENT).includes(normalizedEvent);

    if (!isValidEvent) {
      logger.warn('[PaymentSocket] Unrecognized payment event:', { 
        originalEvent: event,
        normalizedEvent,
        timestamp: new Date().toISOString()
      });
      return valid;
    }

    logger.info('[PaymentSocket] Validated callback for event:', {
      originalEvent: event,
      normalizedEvent,
      timestamp: new Date().toISOString()
    });

    return { ...valid, [normalizedEvent]: callback };
  }, {});
}

_registerCallbacks(paymentId, callbacks) {
  Object.entries(callbacks).forEach(([event, callback]) => {
    const eventName = PAYMENT_EVENTS[event];
    if (!this.activeSubscriptions.has(eventName)) {
      this.activeSubscriptions.set(eventName, new Map());
    }

    const subscriptions = this.activeSubscriptions.get(eventName);
    if (!subscriptions.has(paymentId)) {
      subscriptions.set(paymentId, new Set());
    }

    logger.debug('[PaymentSocket] Registering callback:', {
      paymentId,
      event: eventName,
      timestamp: new Date().toISOString()
    });

    subscriptions.get(paymentId).add(callback);
  });
}

async _attemptRoomJoin(roomId, maxAttempts = 3) {
  const JOIN_TIMEOUT = 5000; // 5 seconds
  const BASE_DELAY = 1000;   // 1 second

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info('[PaymentSocket] Attempting room join:', {
        roomId,
        attempt,
        wasConnected: this.socket?.connected,
        socketId: this.socket?.id,
        timestamp: new Date().toISOString()
      });

      // Ensure connection is ready
      if (!this.socket?.connected) {
        const connected = await this.ensureConnection();
        if (!connected) {
          logger.error('[PaymentSocket] Cannot join room - connection failed:', {
            roomId,
            attempt,
            timestamp: new Date().toISOString()
          });
          continue;
        }
      }

      const joinPromise = new Promise((resolve, reject) => {
        // Set timeout for join operation
        const timeout = setTimeout(() => {
          this.socket?.off('room_joined');
          reject(new Error('Room join timeout'));
        }, JOIN_TIMEOUT);

        // Listen for successful join
        this.socket.once('room_joined', (response) => {
          clearTimeout(timeout);
          if (response?.error) {
            reject(new Error(response.error));
          } else {
            resolve(true);
          }
        });

        // Emit join request with acknowledgment
        this.socket.emit('join_payment', { 
          roomId,
          timestamp: new Date().toISOString()
        }, (ackResponse) => {
          if (ackResponse?.success) {
            this.socket.emit('room_joined', { roomId });
          }
        });
      });

      await joinPromise;
      
      logger.info('[PaymentSocket] Room joined successfully:', {
        roomId,
        attempt,
        socketId: this.socket?.id,
        timestamp: new Date().toISOString()
      });

      // Track successful join
      this._trackRoomJoin(roomId, attempt);
      return true;

    } catch (error) {
      logger.warn('[PaymentSocket] Room join attempt failed:', {
        roomId,
        attempt,
        error: error.message,
        remainingAttempts: maxAttempts - attempt,
        timestamp: new Date().toISOString()
      });

      if (attempt === maxAttempts) {
        logger.error('[PaymentSocket] Max room join attempts reached:', {
          roomId,
          attempts: maxAttempts,
          timestamp: new Date().toISOString()
        });
        return false;
      }

      // Add exponential backoff between attempts
      const delay = BASE_DELAY * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return false;
}
 
 // Add this new helper method
 _trackRoomJoin(roomId, attemptCount) {

 
  if (!this._roomJoins) {
    this._roomJoins = new Map();
  }

  this._roomJoins.set(roomId, {
    joinedAt: new Date().toISOString(),
    attempts: attemptCount,
    socketId: this.socket?.id,
    lastActivity: Date.now()
  });

  // Setup keep-alive for room
  const keepAliveInterval = setInterval(() => {
    if (this.socket?.connected) {
      this.socket.emit('room_keepalive', { roomId });
    } else {
      clearInterval(keepAliveInterval);
    }
  }, 30000);

  // Store interval for cleanup
  this._keepAliveIntervals = this._keepAliveIntervals || new Map();
  this._keepAliveIntervals.set(roomId, keepAliveInterval);
}

_handleSubscriptionError(paymentId, error) {
  logger.error('[PaymentSocket] Subscription setup failed:', {
    paymentId,
    error: error.message,
    timestamp: new Date().toISOString()
  });

  this._updateSubscriptionState(paymentId, SUBSCRIPTION_STATES.FAILED, {
    error: error.message,
    timestamp: new Date().toISOString()
  });

  // Cleanup any partial subscriptions
  this._cleanupSubscriptionss(paymentId);
}

async unsubscribeFromPayment(paymentId, callbacks = {}) {
  if (!paymentId) {
    logger.warn('[PaymentSocket] Attempted to unsubscribe with invalid paymentId');
    return;
  }

  logger.info('[PaymentSocket] Unsubscribing from payment updates:', {
    paymentId,
    events: Object.keys(callbacks),
    timestamp: new Date().toISOString()
  });

  // First cleanup all subscriptions
  Object.entries(callbacks).forEach(([event, callback]) => {
    const eventName = SUBSCRIPTION_EVENTS[event] || event;
    this._cleanupSubscriptions(paymentId, eventName, callback);
  });

  // Then handle room leave with timeout
  try {
    if (this.socket?.connected) {
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          logger.warn('[PaymentSocket] Room leave timeout:', {
            paymentId,
            timestamp: new Date().toISOString()
          });
          resolve();
        }, 1000); // 1s timeout for leave operation

        this.socket.emit(PAYMENT_EVENTS.ROOM.LEAVE, { 
          paymentId,
          timestamp: new Date().toISOString()
        }, () => {
          clearTimeout(timeout);
          logger.debug('[PaymentSocket] Successfully left payment room:', {
            paymentId,
            timestamp: new Date().toISOString()
          });
          resolve();
        });
      });
    }
  } catch (error) {
    logger.warn('[PaymentSocket] Error during room leave:', {
      paymentId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    // Continue with cleanup even if leave fails
  }

  // Clean up all subscription state
  this.subscriptionStates.delete(paymentId);
  
  // Clear any pending timeouts
  const timeoutId = this.subscriptionTimeouts.get(paymentId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    this.subscriptionTimeouts.delete(paymentId);
    logger.debug('[PaymentSocket] Cleared subscription timeout:', {
      paymentId,
      timestamp: new Date().toISOString()
    });
  }

  // Ensure all maps are cleaned
  this.activeSubscriptions.forEach((subscriptions, eventName) => {
    if (subscriptions.has(paymentId)) {
      subscriptions.delete(paymentId);
      logger.debug('[PaymentSocket] Cleaned up subscription:', {
        paymentId,
        eventName,
        timestamp: new Date().toISOString()
      });
    }
    
    // Remove empty subscription maps
    if (subscriptions.size === 0) {
      this.activeSubscriptions.delete(eventName);
    }
  });

  logger.info('[PaymentSocket] Completed subscription cleanup:', {
    paymentId,
    timestamp: new Date().toISOString()
  });
}

// Payment Event Handling
_handlePaymentEvent(eventName, data) {
  const subscriptionKey = `payment:${data?.paymentId}`;
  const subscriptions = this.activeSubscriptions.get(eventName);
  
  logger.debug('[PaymentSocket] Received payment event:', {
    event: eventName,
    paymentId: data?.paymentId,
    hasSubscriptions: !!subscriptions?.has(subscriptionKey),
    timestamp: new Date().toISOString()
  });

  if (subscriptions?.has(subscriptionKey)) {
    const callbacks = subscriptions.get(subscriptionKey);
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        logger.error('[PaymentSocket] Error in event handler:', {
          event: eventName,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }
}

// Utility Methods
_resubscribeAll() {
  this.activeSubscriptions.forEach((subscriptions, eventName) => {
    subscriptions.forEach((callbacks, subscriptionKey) => {
      const paymentId = subscriptionKey.split(':')[1];
      if (paymentId && this.socket?.connected) {
        logger.info('[PaymentSocket] Resubscribing to event:', {
          event: eventName,
          paymentId,
          timestamp: new Date().toISOString()
        });
        this.socket.emit('join_payment', { paymentId });
      }
    });
  });
}

  resetConnectionState() {
    logger.info('[PaymentSocket] Resetting connection state:', {
      previousState: this.connectionState,
      timestamp: new Date().toISOString()
    });
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    this.connectionState = CONNECTION_STATES.DISCONNECTED;
    this.isConnecting = false;
    this.connectionAttempts = 0;
    this.connectionPromise = null;
    
    this.retryTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.retryTimeouts.clear();

    if (this.socket) {
    
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

   getConnectionState() {
    return {
      state: this.connectionState,
      attempts: this.connectionAttempts,
      isConnecting: this.isConnecting,
      hasSocket: !!this.socket,
      isSocketConnected: this.socket?.connected || false,
      timestamp: new Date().toISOString()
    };
  }


// Health Check
isConnectionHealthy() {


  return {
    connected: this.socket?.connected ?? false,
    connecting: this.isConnecting,
    subscriptions: Object.fromEntries(
      Array.from(this.activeSubscriptions.entries()).map(([event, subs]) => [
        event,
        Array.from(subs.keys()).length
      ])
    )
  };
}

async cleanup(paymentId) {
  const { PaymentOrchestrator } = await import('./PaymentOrchestratorService');

  await PaymentOrchestrator.handleCleanup(paymentId, {
    source: 'socket',
    reason: 'socket_cleanup'
  });
}

// Cleanup
disconnect() {
  logger.info('[PaymentSocket] Disconnecting socket service');
  
  // Force cleanup all active subscriptions
  this.activeSubscriptions.forEach((_, paymentId) => {
    this.cleanup(paymentId);
  });
  
  this.resetConnectionState();
}
}

// Export singleton instance
export default new PaymentSocketService();