import { logger } from '../../utils/logger';

class PaymentAnalyticsService {
  constructor() {
    this.metricsBuffer = new Map();
    this.flushInterval = 60000; // Flush metrics every minute
    this._initializeFlushInterval();

    logger.info('[PaymentAnalyticsService] Initialized analytics service');
  }

  trackPaymentSuccess(paymentId, data) {
    logger.info('[PaymentAnalyticsService] Tracking successful payment:', {
      paymentId,
      amount: data.amount,
      currency: data.currency,
      timestamp: new Date().toISOString()
    });

    this._bufferMetric('success_count', 1);
    this._bufferMetric('total_amount', data.amount);
    this._bufferMetric('processing_time', data.processingTime);

    if (data.retryCount > 0) {
      this._bufferMetric('retry_success_count', 1);
    }
  }

  trackPaymentFailure(paymentId, error) {
    logger.error('[PaymentAnalyticsService] Tracking failed payment:', {
      paymentId,
      errorCode: error.code,
      errorType: error.type,
      timestamp: new Date().toISOString()
    });

    this._bufferMetric('failure_count', 1);
    this._bufferMetric(`error_type_${error.type}`, 1);

    // Track specific failure metrics
    if (error.type === 'card_error') {
      this._bufferMetric('card_decline_count', 1);
    } else if (error.type === 'network_error') {
      this._bufferMetric('network_error_count', 1);
    }
  }

  trackRetryAttempt(paymentId, attemptNumber) {
    logger.info('[PaymentAnalyticsService] Tracking retry attempt:', {
      paymentId,
      attemptNumber,
      timestamp: new Date().toISOString()
    });

    this._bufferMetric('retry_attempt_count', 1);
    this._bufferMetric(`retry_attempt_${attemptNumber}`, 1);
  }

  async generateMetrics(period = '1h') {
    try {
      const metrics = await this._calculateMetrics(period);
      
      logger.info('[PaymentAnalyticsService] Generated metrics:', {
        period,
        metrics,
        timestamp: new Date().toISOString()
      });

      return metrics;
    } catch (error) {
      logger.error('[PaymentAnalyticsService] Error generating metrics:', {
        error: error.message,
        period,
        stack: error.stack
      });
      throw error;
    }
  }

  _bufferMetric(name, value) {
    const currentValue = this.metricsBuffer.get(name) || 0;
    this.metricsBuffer.set(name, currentValue + value);
  }

  async _flushMetrics() {
    if (this.metricsBuffer.size === 0) return;

    try {
      const metrics = Object.fromEntries(this.metricsBuffer);
      
      logger.debug('[PaymentAnalyticsService] Flushing metrics:', {
        metrics,
        timestamp: new Date().toISOString()
      });

      // Here you would typically send to your metrics storage system
      // await metricsAPI.store(metrics);

      this.metricsBuffer.clear();
    } catch (error) {
      logger.error('[PaymentAnalyticsService] Error flushing metrics:', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  async _calculateMetrics(period) {
    return {
      successRate: this._calculateSuccessRate(),
      averageProcessingTime: this._calculateAverageProcessingTime(),
      totalVolume: this._calculateTotalVolume(),
      retrySuccessRate: this._calculateRetrySuccessRate(),
      errorDistribution: this._calculateErrorDistribution()
    };
  }

  _initializeFlushInterval() {
    setInterval(() => this._flushMetrics(), this.flushInterval);
  }

  _calculateSuccessRate() {
    const successes = this.metricsBuffer.get('success_count') || 0;
    const failures = this.metricsBuffer.get('failure_count') || 0;
    return successes + failures > 0 ? (successes / (successes + failures)) * 100 : 0;
  }

  _calculateAverageProcessingTime() {
    const times = this.metricsBuffer.get('processing_time') || 0;
    const count = this.metricsBuffer.get('success_count') || 1;
    return times / count;
  }

  _calculateTotalVolume() {
    return this.metricsBuffer.get('total_amount') || 0;
  }

  _calculateRetrySuccessRate() {
    const retrySuccesses = this.metricsBuffer.get('retry_success_count') || 0;
    const retryAttempts = this.metricsBuffer.get('retry_attempt_count') || 0;
    return retryAttempts > 0 ? (retrySuccesses / retryAttempts) * 100 : 0;
  }

  _calculateErrorDistribution() {
    const errorTypes = Array.from(this.metricsBuffer.keys())
      .filter(key => key.startsWith('error_type_'));
    
    const distribution = {};
    errorTypes.forEach(type => {
      distribution[type.replace('error_type_', '')] = this.metricsBuffer.get(type);
    });

    return distribution;
  }
}

export default new PaymentAnalyticsService();