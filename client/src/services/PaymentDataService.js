import { logger } from '../utils/logger';

class PaymentDataService {
  static normalizePriceData(priceDetails) {
    try {
      logger.debug('[PaymentDataService] Normalizing price data:', {
        input: priceDetails,
        inputType: typeof priceDetails,
        hasNestedStructure: !!(priceDetails?.final?.amount || priceDetails?.base?.amount),
        timestamp: new Date().toISOString()
      });
  
      if (!priceDetails) {
        throw new Error('Missing price details');
      }
  
      // Handle nested structure
      if (priceDetails.final?.amount) {
        const finalAmount = priceDetails.final.amount.amount ?? priceDetails.final.amount; // Handle object or number
        return {
          amount: Number(finalAmount),
          currency: priceDetails.final.currency || priceDetails.currency || 'CHF',
          originalData: priceDetails,
          baseAmount: priceDetails.base?.amount ? Number(priceDetails.base.amount.amount ?? priceDetails.base.amount) : null,
          platformFee: priceDetails.platformFee?.amount ? Number(priceDetails.platformFee.amount.amount ?? priceDetails.platformFee.amount) : null,
          vatAmount: priceDetails.vat?.amount ? Number(priceDetails.vat.amount) : null
        };
      }
  
      // Handle flat structure
      if (typeof priceDetails.amount === 'number' || typeof priceDetails.amount === 'string') {
        return {
          amount: Number(priceDetails.amount),
          currency: priceDetails.currency || 'CHF',
          originalData: priceDetails
        };
      }
  
      // Handle direct number
      if (typeof priceDetails === 'number') {
        return {
          amount: priceDetails,
          currency: 'CHF'
        };
      }
  
      throw new Error('Invalid price structure');
    } catch (error) {
      logger.error('[PaymentDataService] Price normalization failed:', {
        error: error.message,
        input: priceDetails,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  _validatePriceDetails(priceDetails) {
    if (!priceDetails) return false;

    const amount = priceDetails.final || priceDetails.amount;
    return (
      amount !== undefined &&
      amount !== null &&
      !isNaN(amount) &&
      priceDetails.currency
    );
  }

  _normalizePriceDetails(priceDetails) {
    const amount = priceDetails.final || priceDetails.amount;
    return {
      amount: typeof amount === 'object' ? amount.amount || amount.value : amount,
      currency: priceDetails.currency,
      original: priceDetails
    };
  }

  static validatePriceData(priceData) {
    const normalized = this.normalizePriceData(priceData);
    
    if (isNaN(normalized.amount)) {
      logger.error('[PaymentDataService] Invalid amount after normalization:', {
        normalizedAmount: normalized.amount,
        originalData: priceData,
        timestamp: new Date().toISOString()
      });
      throw new Error('Invalid amount after price normalization');
    }

    return normalized;
  }

  static formatPriceForPayment(priceData) {
    const normalized = this.validatePriceData(priceData);
    
    logger.info('[PaymentDataService] Formatting price for payment:', {
      normalizedAmount: normalized.amount,
      currency: normalized.currency,
      hasVat: !!normalized.vatAmount,
      hasPlatformFee: !!normalized.platformFee,
      timestamp: new Date().toISOString()
    });

    return {
      amount: normalized.amount,
      currency: normalized.currency,
      metadata: {
        originalAmount: normalized.baseAmount || normalized.amount,
        vatAmount: normalized.vatAmount,
        platformFee: normalized.platformFee,
        priceStructure: JSON.stringify(normalized.originalData)
      }
    };
  }
}

export default PaymentDataService;