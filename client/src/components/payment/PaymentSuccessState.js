import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { logger } from '../../utils/logger';

const PaymentSuccessState = ({ 
  title,
  description,
  transactionDetails,
  receiptUrl,
  actionLabel,
  onAction,
  showAction = true 
}) => {
  const { t } = useTranslation(['payments']);
  
  logger.debug('[PaymentSuccessState] Rendering success state:', {
    hasTitle: !!title,
    hasDescription: !!description,
    showAction,
    hasActionHandler: !!onAction,
    hasTransactionDetails: !!transactionDetails,
    hasReceiptUrl: !!receiptUrl
  });

  const receiptVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  const containerVariants = {
    initial: { 
      opacity: 0,
      y: 20,
      transition: { staggerChildren: 0.1 }
    },
    visible: { 
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 200,
        damping: 20,
        staggerChildren: 0.2
      }
    },
    exit: { 
      opacity: 0,
      y: -20,
      transition: { staggerChildren: 0.05 }
    }
  };

  return (
<motion.div
  variants={containerVariants}
  initial="initial"
  animate="visible"
  exit="exit"
  className="space-y-4 relative"
  onAnimationComplete={() => {
    logger.debug('[PaymentSuccessState] Success animation completed:', {
      hasTransactionDetails: !!transactionDetails,
      hasAction: !!onAction,
      timestamp: new Date().toISOString()
    });
  }}
>
      <Alert variant="success" className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2 }}
          className="flex justify-center mb-4"
        >
          <CheckCircle className="h-12 w-12 text-green-500" />
        </motion.div>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="text-lg font-medium mb-2">
            {title || t('payments:connect.status.complete')}
          </h3>
          <AlertDescription>
            {description || t('payments:connect.setup.completed')}
          </AlertDescription>
        </motion.div>
      </Alert>

      {transactionDetails && (
        <motion.div
          variants={receiptVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.4 }}
          className="mt-6 p-4 bg-white rounded-lg shadow-sm border"
        >
          <h4 className="text-sm font-medium mb-2">{t('payments:transactionDetails')}</h4>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>{t('payments:transactionId')}</dt>
              <dd className="font-mono">{transactionDetails.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('payments:amount')}</dt>
              <dd>{transactionDetails.amount} {transactionDetails.currency}</dd>
            </div>
            {receiptUrl && (
              <div className="mt-4">
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/90 text-sm flex items-center gap-1"
                >
                  <Download size={14} />
                  {t('payments:downloadReceipt')}
                </a>
              </div>
            )}
          </dl>
        </motion.div>
      )}

      {showAction && onAction && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex justify-center"
        >
          <Button onClick={onAction}>
            {actionLabel || t('payments:connect.actions.viewDashboard')}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
};

export default PaymentSuccessState;