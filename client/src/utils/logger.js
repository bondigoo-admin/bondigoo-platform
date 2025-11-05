// src/utils/logger.js

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const RATE_LIMITS = {
  error: 60000,  // 1 minute for errors
  warn: 30000,   // 30 seconds for warnings
  info: 30000,   // 30 seconds for info
  debug: 30000,  // 30 seconds for debug
};

class FrontendLogger {
  constructor() {
    this.currentLogLevel = LOG_LEVELS.DEBUG;
    this.recentLogs = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  getLogKey(message) {
    return typeof message === 'string' ? message.substring(0, 100) : 'non-string-message';
  }

  shouldLog(message) {
    const now = Date.now();
    const key = this.getLogKey(message);
    const lastLogTime = this.recentLogs.get(key);
    
    if (!lastLogTime || (now - lastLogTime) > RATE_LIMITS.error) {
      this.recentLogs.set(key, now);
      return true;
    }
    return false;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of this.recentLogs.entries()) {
      if (now - timestamp > Math.max(...Object.values(RATE_LIMITS))) {
        this.recentLogs.delete(key);
      }
    }
  }

 formatMessage(message, metadata = {}) {
    if (typeof message === 'string') {
      return metadata && Object.keys(metadata).length > 0
        ? `${message} ${JSON.stringify(metadata)}`
        : message;
    }
    return JSON.stringify(message);
  }

  //FORMAT MESSAGE WITH STACK TRACE, COMMENT OUT OR IN WHICH ONE I NEED

  /*formatMessage(message, metadata = {}) {
    // Capture detailed stack trace
    const stackTrace = new Error().stack.split("\n").slice(2);
    
    // Extract component and method names from the stack
    const caller = stackTrace[0]?.match(/at\s+(.*)\s+\(/)?.[1] || 'unknown';
    
    // Timestamp with milliseconds
    const timestamp = new Date().toISOString();
    
    // Process metadata
    const detailedMetadata = {
      ...metadata,
      timestamp,
      caller,
      componentChain: stackTrace
        .slice(0, 3)  // Take first 3 stack frames for component chain
        .map(line => line.match(/at\s+(.*)\s+\(/)?.[1] || 'unknown')
        .join(' → '),
      sessionId: window?.sessionStorage?.getItem('sessionId') || 'no-session'
    };
  
    // Format the verbose log message
    const verboseLog = [
      `[${timestamp}]`,
      `[${caller}]`,
      typeof message === 'string' ? message : JSON.stringify(message),
      '\nMetadata:',
      JSON.stringify(detailedMetadata, null, 2),
      '\nStack Trace:',
      stackTrace.join('\n')
    ].join(' ');
  
    return verboseLog;
  }*/

  error(message, metadata = {}) {
    if (this.shouldLog(message)) {
      console.error(this.formatMessage(message, metadata));
    }
  }

  warn(message, metadata = {}) {
    if (this.currentLogLevel >= LOG_LEVELS.WARN && this.shouldLog(message)) {
      console.warn(this.formatMessage(message, metadata));
    }
  }

  info(message, metadata = {}) {
    if (this.currentLogLevel >= LOG_LEVELS.INFO && this.shouldLog(message)) {
      console.log(this.formatMessage(message, metadata));
    }
  }

  debug(message, metadata = {}) {
    if (this.currentLogLevel >= LOG_LEVELS.DEBUG && this.shouldLog(message)) {
      console.log('[DEBUG]', this.formatMessage(message, metadata));
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Export a singleton instance
export const logger = new FrontendLogger();