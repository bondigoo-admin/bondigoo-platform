import React from 'react';
import { CreditCard, AlertTriangle, Info } from 'lucide-react';
import { calculateVAT } from '../../utils/taxHelpers';
import { logger } from '../../utils/logger';

const PaymentSummary = ({ 
  amount, 
  currency = 'CHF',
  showVAT = true,
  isConnected = false,
  platformFee = 15,
  className = ''
}) => {
  const vatCalculation = showVAT ? calculateVAT(amount, true) : null;
  
  logger.debug('[PaymentSummary] Rendering payment summary:', {
    amount,
    currency,
    showVAT,
    vatCalculation: vatCalculation ? {
      vatAmount: vatCalculation.vatAmount,
      totalAmount: vatCalculation.totalAmount
    } : 'VAT disabled',
    platformFeeAmount: (amount * (platformFee / 100))
  });

  return (
    <div className={`payment-summary-container bg-white rounded-lg shadow p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center">
          <CreditCard className="w-5 h-5 mr-2 text-gray-600" />
          Payment Summary
        </h3>
        {!isConnected && (
          <div className="flex items-center text-amber-600">
            <AlertTriangle className="w-4 h-4 mr-1" />
            <span className="text-sm">No connection discount available</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Base Amount</span>
          <span className="font-medium">
            {new Intl.NumberFormat('de-CH', {
              style: 'currency',
              currency
            }).format(amount)}
          </span>
        </div>

        {showVAT && vatCalculation && (
          <div className="flex justify-between items-center">
            <span className="text-gray-600 flex items-center">
              VAT ({vatCalculation.vatRate}%)
              <Info className="w-4 h-4 ml-1 text-gray-400" />
            </span>
            <span className="text-gray-600">
              {new Intl.NumberFormat('de-CH', {
                style: 'currency',
                currency
              }).format(vatCalculation.vatAmount)}
            </span>
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="text-gray-600">Platform Fee ({platformFee}%)</span>
          <span className="text-gray-600">
            {new Intl.NumberFormat('de-CH', {
              style: 'currency',
              currency
            }).format(amount * (platformFee / 100))}
          </span>
        </div>

        {isConnected && (
          <div className="flex justify-between items-center text-green-600">
            <span>Connection Discount (5%)</span>
            <span>
              -{new Intl.NumberFormat('de-CH', {
                style: 'currency',
                currency
              }).format(amount * 0.05)}
            </span>
          </div>
        )}

        <div className="border-t pt-3 mt-3">
          <div className="flex justify-between items-center font-semibold">
            <span>Total Amount</span>
            <span className="text-lg">
              {new Intl.NumberFormat('de-CH', {
                style: 'currency',
                currency
              }).format(
                isConnected 
                  ? amount * (1 - 0.05) 
                  : amount
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentSummary;