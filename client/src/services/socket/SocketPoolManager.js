import { logger } from '../utils/logger';

const POOL_CONFIG = {
  MAX_SIZE: 5,
  MIN_CONNECTIONS: 2,
  CONNECTION_TIMEOUT: 10000,
  IDLE_TIMEOUT: 30000,
  CLEANUP_INTERVAL: 60000,
  RECONNECTION: {
    MAX_ATTEMPTS: 3,
    BASE_DELAY: 1000,
    MAX_DELAY: 5000
  }
};

class SocketPoolManager {
  constructor() {
    this.pools = new Map();
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      reconnections: 0,
      lastCleanup: Date.now()
    };
    
    this._startMetricsCollection();
    this._startCleanupInterval();
  }

  async acquireConnection(paymentId) {
    const poolKey = `payment:${paymentId}`;
    const pool = this._getOrCreatePool(poolKey);
    
    logger.info('[SocketPool] Acquiring connection:', {
      poolKey,
      activeConnections: pool.active.size,
      idleConnections: pool.idle.size,
      timestamp: new Date().toISOString()
    });

    // First try to get an idle connection
    const idleConnection = this._getIdleConnection(pool);
    if (idleConnection) {
      return this._activateConnection(idleConnection, pool);
    }

    // If pool isn't full, create new connection
    if (pool.active.size + pool.idle.size < POOL_CONFIG.MAX_SIZE) {
      return this._createNewConnection(pool, paymentId);
    }

    // Wait for an available connection
    return this._waitForConnection(pool, paymentId);
  }

  releaseConnection(connection) {
    const pool = this.pools.get(connection.poolKey);
    if (!pool) return;

    logger.debug('[SocketPool] Releasing connection:', {
      poolKey: connection.poolKey,
      connectionId: connection.id,
      timestamp: new Date().toISOString()
    });

    pool.active.delete(connection);
    connection.lastUsed = Date.now();
    pool.idle.add(connection);

    this._updateMetrics('release');
    this._notifyWaitingClients(pool);
  }

  _getOrCreatePool(poolKey) {
    if (!this.pools.has(poolKey)) {
      this.pools.set(poolKey, {
        active: new Set(),
        idle: new Set(),
        waiting: [],
        metrics: {
          created: Date.now(),
          totalConnections: 0,
          failures: 0
        }
      });
    }
    return this.pools.get(poolKey);
  }

  _startMetricsCollection() {
    setInterval(() => {
      const metrics = {
        timestamp: new Date().toISOString(),
        pools: Array.from(this.pools.entries()).map(([key, pool]) => ({
          key,
          active: pool.active.size,
          idle: pool.idle.size,
          waiting: pool.waiting.length,
          metrics: pool.metrics
        })),
        global: this.metrics
      };

      logger.info('[SocketPool] Metrics collected:', metrics);
    }, 10000);
  }

  _startCleanupInterval() {
    setInterval(() => {
      this._cleanupIdleConnections();
    }, POOL_CONFIG.CLEANUP_INTERVAL);
  }

  _cleanupIdleConnections() {
    const now = Date.now();
    let cleaned = 0;

    this.pools.forEach((pool, poolKey) => {
      pool.idle.forEach(conn => {
        if (now - conn.lastUsed > POOL_CONFIG.IDLE_TIMEOUT) {
          pool.idle.delete(conn);
          conn.disconnect();
          cleaned++;
        }
      });
    });

    if (cleaned > 0) {
      logger.info('[SocketPool] Cleaned idle connections:', {
        count: cleaned,
        timestamp: new Date().toISOString()
      });
    }
  }

  async _createNewConnection(pool, paymentId) {
    try {
      const connection = await this._initializeConnection(paymentId);
      pool.active.add(connection);
      pool.metrics.totalConnections++;
      this.metrics.totalConnections++;
      
      return connection;
    } catch (error) {
      pool.metrics.failures++;
      this.metrics.failedConnections++;
      throw error;
    }
  }

  _updateMetrics(action) {
    switch (action) {
      case 'acquire':
        this.metrics.activeConnections++;
        break;
      case 'release':
        this.metrics.activeConnections--;
        break;
      case 'reconnect':
        this.metrics.reconnections++;
        break;
    }
  }

  getPoolMetrics() {
    return {
      ...this.metrics,
      pools: Array.from(this.pools.entries()).map(([key, pool]) => ({
        key,
        active: pool.active.size,
        idle: pool.idle.size,
        waiting: pool.waiting.length,
        metrics: pool.metrics
      }))
    };
  }
}

export const socketPoolManager = new SocketPoolManager();