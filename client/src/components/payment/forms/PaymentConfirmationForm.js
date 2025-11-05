// src/components/payment/forms/PaymentConfirmationForm.js
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Check, AlertTriangle, Clock, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../ui/card';
import { Alert, AlertTitle, AlertDescription } from '../../ui/alert';
import { logger } from '../../../utils/logger';

const staggerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30
    }
  }
};

const PaymentConfirmationForm = ({
  sessionDetails,
  priceDetails,
  paymentMethod,
  paymentTiming,
  onConfirm,
  onBack,
  onCancel,
  isProcessing = false
}) => {
  const { t } = useTranslation(['payments', 'common']);
  const [hasConfirmed, setHasConfirmed] = useState(false);

  logger.info('[PaymentConfirmationForm] Rendering confirmation form:', {
    hasSessionDetails: !!sessionDetails,
    hasPriceDetails: !!priceDetails,
    hasPaymentMethod: !!paymentMethod,
    timing: paymentTiming,
    timestamp: new Date().toISOString()
  });

  const handleConfirm = useCallback(async () => {
    if (!hasConfirmed) {
      setHasConfirmed(true);
      return;
    }

    logger.info('[PaymentConfirmationForm] Confirming payment:', {
      paymentMethodId: paymentMethod?.id,
      timing: paymentTiming,
      timestamp: new Date().toISOString()
    });

    await onConfirm();
  }, [hasConfirmed, paymentMethod, paymentTiming, onConfirm]);

  const formatDateTime = (date) => {
    return new Intl.DateTimeFormat('de-CH', {
      dateStyle: 'full',
      timeStyle: 'short'
    }).format(new Date(date));
  };

  const formatAmount = (amount, currency) => {
    return new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const getConfirmationStage = useCallback(() => {
    if (isProcessing) return 'processing';
    if (hasConfirmed) return 'confirmed';
    return 'initial';
  }, [isProcessing, hasConfirmed]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {hasConfirmed ? (
            <Check className="h-5 w-5 text-green-500" />
          ) : (
            <Info className="h-5 w-5 text-primary" />
          )}
          {t('payments:confirmation.title')}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
  <motion.div
    variants={staggerVariants}
    initial="hidden"
    animate="visible"
    className="space-y-6"
  >
          <h3 className="text-sm font-medium text-muted-foreground">
            {t('payments:confirmation.sessionDetails')}
          </h3>
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('payments:confirmation.startTime')}</span>
              <span className="font-medium">{formatDateTime(sessionDetails.start)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t('payments:confirmation.duration')}</span>
              <span className="font-medium">
                {sessionDetails.duration} {t('common:minutes')}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t('payments:confirmation.coach')}</span>
              <span className="font-medium">{sessionDetails.coachName}</span>
            </div>
          </div>
        </motion.div>

        {/* Payment Details */}
        <motion.div variants={itemVariants}>
          <h3 className="text-sm font-medium text-muted-foreground">
            {t('payments:confirmation.paymentDetails')}
          </h3>
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('payments:confirmation.paymentMethod')}</span>
              <span className="font-medium flex items-center gap-1">
                <CreditCard className="h-4 w-4" />
                {paymentMethod.brand} •••• {paymentMethod.last4}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t('payments:confirmation.timing')}</span>
              <span className="font-medium flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {t(`payments:timing.${paymentTiming}`)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Price Breakdown */}
        <motion.div variants={itemVariants}>
          <h3 className="text-sm font-medium text-muted-foreground">
            {t('payments:confirmation.priceBreakdown')}
          </h3>
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('payments:confirmation.basePrice')}</span>
              <span>{formatAmount(priceDetails.base, priceDetails.currency)}</span>
            </div>
            {priceDetails.platformFee && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{t('payments:confirmation.platformFee')}</span>
                <span>{formatAmount(priceDetails.platformFee.amount, priceDetails.currency)}</span>
              </div>
            )}
            {priceDetails.vat && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{t('payments:confirmation.vat', { rate: priceDetails.vat.rate })}</span>
                <span>{formatAmount(priceDetails.vat.amount, priceDetails.currency)}</span>
              </div>
            )}
            <div className="pt-2 mt-2 border-t flex justify-between font-medium">
              <span>{t('payments:confirmation.total')}</span>
              <span>{formatAmount(priceDetails.final, priceDetails.currency)}</span>
            </div>
          </div>
        </motion.div>

        {/* Terms and Conditions */}
        {!hasConfirmed && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('payments:confirmation.termsTitle')}</AlertTitle>
            <AlertDescription>
              {t('payments:confirmation.termsDescription')}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>



      <CardFooter className="flex justify-between">
        <button
          onClick={onBack}
          disabled={isProcessing}
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('common:back')}
        </button>

        <div className="flex gap-3">
         <button
  onClick={handleConfirm}
  disabled={isProcessing}
  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 relative overflow-hidden"
>
  <motion.div
    animate={{
      x: isProcessing ? 200 : 0,
      opacity: isProcessing ? 0 : 1
    }}
    transition={{ duration: 0.3 }}
  >
    {hasConfirmed ? <Check className="h-4 w-4" /> : null}
    {hasConfirmed
      ? t('payments:confirmation.confirmFinal')
      : t('payments:confirmation.confirm')}
  </motion.div>
  {isProcessing && (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute inset-0 flex items-center justify-center"
    >
      <Clock className="h-4 w-4 animate-spin mr-2" />
      {t('payments:confirmation.processing')}
    </motion.div>
  )}
</button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default PaymentConfirmationForm;