// server/utils/paymentLogger.js

const winston = require('winston');
const { format } = winston;
const path = require('path');

class PaymentFlowServerLogger {
  constructor() {
    this.activeFlows = new Map();
    this.debugMode = process.env.NODE_ENV !== 'production';

    // Create dedicated payment logger
    this.logger = winston.createLogger({
      level: this.debugMode ? 'debug' : 'info',
      format: format.combine(
        format.timestamp(),
        format.metadata(),
        format.json()
      ),
      defaultMeta: { service: 'payment-service' },
      transports: [
        // Console transport
        new winston.transports.Console({
          format: format.combine(
            format.colorize(),
            format.printf(({ timestamp, level, message, metadata }) => {
              return `${timestamp} [${level}] [PaymentFlow] ${message} ${
                Object.keys(metadata).length ? JSON.stringify(metadata) : ''
              }`;
            })
          )
        }),
        // File transport for payment flows
        new winston.transports.File({
          filename: path.join('logs', 'payment-flows.log'),
          format: format.combine(
            format.timestamp(),
            format.json()
          )
        }),
        // Separate file for errors
        new winston.transports.File({
          filename: path.join('logs', 'payment-errors.log'),
          level: 'error',
          format: format.combine(
            format.timestamp(),
            format.json()
          )
        })
      ]
    });

    // Initialize flow tracking
    this.flowTracker = new Map();
  }

  // Flow Tracking Methods
  initializeFlow(flowId, metadata = {}) {
    const flowData = {
      flowId,
      startTime: Date.now(),
      states: [],
      events: [],
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    };

    this.flowTracker.set(flowId, flowData);
    this.logFlowEvent(flowId, 'flow_initialized', metadata);
  }

  trackFlowState(flowId, state, metadata = {}) {
    if (!this.flowTracker.has(flowId)) {
      this.initializeFlow(flowId);
    }

    const flow = this.flowTracker.get(flowId);
    flow.states.push({
      state,
      timestamp: Date.now(),
      metadata
    });

    this.logFlowEvent(flowId, 'state_changed', {
      state,
      ...metadata
    });
  }

  // Event Logging
  logFlowEvent(flowId, eventType, metadata = {}) {
    const flow = this.flowTracker.get(flowId);
    const eventData = {
      flowId,
      eventType,
      timestamp: new Date().toISOString(),
      timeSinceStart: flow ? Date.now() - flow.startTime : 0,
      metadata
    };

    // Log to appropriate level based on event type
    if (eventType.includes('error')) {
      this.logger.error(`Payment Flow Error [${flowId}]`, eventData);
    } else if (eventType.includes('warning')) {
      this.logger.warn(`Payment Flow Warning [${flowId}]`, eventData);
    } else {
      this.logger.info(`Payment Flow Event [${flowId}]`, eventData);
    }

    // Store event in flow tracker
    if (flow) {
      flow.events.push(eventData);
    }
  }

  // Payment Intent Tracking
  trackPaymentIntent(flowId, paymentIntentId, metadata = {}) {
    this.logFlowEvent(flowId, 'payment_intent_created', {
      paymentIntentId,
      ...metadata
    });
  }

  // Error Tracking
  logFlowError(flowId, error, metadata = {}) {
    this.logger.error(`Payment Flow Error [${flowId}]`, {
      error: error.message,
      stack: error.stack,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }

  // Flow Completion
  completeFlow(flowId, status, metadata = {}) {
    const flow = this.flowTracker.get(flowId);
    if (!flow) return;

    const duration = Date.now() - flow.startTime;
    
    this.logFlowEvent(flowId, 'flow_completed', {
      status,
      duration,
      ...metadata
    });

    // Export flow data if in debug mode
    if (this.debugMode) {
      this.exportFlowData(flowId);
    }

    this.flowTracker.delete(flowId);
  }

  // Debug Methods
  exportFlowData(flowId) {
    const flow = this.flowTracker.get(flowId);
    if (!flow) return;

    const exportData = {
      flowId,
      duration: Date.now() - flow.startTime,
      states: flow.states,
      events: flow.events,
      metadata: flow.metadata,
      exportedAt: new Date().toISOString()
    };

    this.logger.debug('Flow Export', exportData);
    return exportData;
  }

  // Cleanup
  cleanup() {
    const now = Date.now();
    const FLOW_TIMEOUT = 30 * 60 * 1000; // 30 minutes

    for (const [flowId, flow] of this.flowTracker.entries()) {
      if (now - flow.startTime > FLOW_TIMEOUT) {
        this.logFlowEvent(flowId, 'flow_timeout', {
          duration: now - flow.startTime
        });
        this.flowTracker.delete(flowId);
      }
    }
  }
}

// Create singleton instance
const paymentFlowLogger = new PaymentFlowServerLogger();

// Start cleanup interval
setInterval(() => paymentFlowLogger.cleanup(), 15 * 60 * 1000); // Every 15 minutes

module.exports = paymentFlowLogger;