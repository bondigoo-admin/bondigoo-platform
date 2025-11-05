const NodeCache = require('node-cache');
const cacheConfig = require('../config/cache');
const { logger } = require('../utils/logger');

class CacheService {
  constructor() {
    this.cache = new NodeCache({
      ...cacheConfig.options,
      checkperiod: cacheConfig.priceCalculation.checkperiod
    });

    // Setup event listeners for monitoring
    this.cache.on('expired', (key, value) => {
      logger.debug('[CacheService] Cache key expired:', { key });
    });

    this.cache.on('flush', () => {
      logger.info('[CacheService] Cache flushed');
    });

    logger.info('[CacheService] Cache service initialized');
  }

  async get(key) {
    try {
      const value = this.cache.get(key);
      logger.debug('[CacheService] Cache get attempt:', { 
        key, 
        hit: !!value 
      });
      return value;
    } catch (error) {
      logger.error('[CacheService] Error getting cached value:', { 
        key, 
        error: error.message 
      });
      return null;
    }
  }

  async set(key, value, ttl = cacheConfig.priceCalculation.ttl) {
    try {
      const success = this.cache.set(key, value, ttl);
      logger.debug('[CacheService] Cache set attempt:', { 
        key, 
        success,
        ttl 
      });
      return success;
    } catch (error) {
      logger.error('[CacheService] Error setting cached value:', { 
        key, 
        error: error.message 
      });
      return false;
    }
  }

  async delete(key) {
    try {
      const count = this.cache.del(key);
      logger.debug('[CacheService] Cache delete attempt:', { 
        key, 
        deleted: count > 0 
      });
      return count > 0;
    } catch (error) {
      logger.error('[CacheService] Error deleting cached value:', { 
        key, 
        error: error.message 
      });
      return false;
    }
  }

  async deletePattern(pattern) {
    try {
      // Fetch all keys matching the pattern
      const keys = this.cache.keys().filter(key => key.includes(pattern));
      
      // Delete matching keys
      keys.forEach(key => this.cache.del(key));
      
      logger.debug('[CacheService] Deleted keys matching pattern:', { 
        pattern, 
        deletedCount: keys.length 
      });
      
      return keys.length;
    } catch (error) {
      logger.error('[CacheService] Error deleting pattern:', { 
        pattern, 
        error: error.message 
      });
      return 0;
    }
  }

  async getOrSet(key, fetchFn, ttl = cacheConfig.priceCalculation.ttl) {
    try {
      let value = await this.get(key);
      if (value) {
        return value;
      }

      value = await fetchFn();
      await this.set(key, value, ttl);
      return value;
    } catch (error) {
      logger.error('[CacheService] Error in getOrSet:', { 
        key, 
        error: error.message 
      });
      throw error; // Let caller handle the error
    }
  }
}

// Export singleton instance
module.exports = new CacheService();