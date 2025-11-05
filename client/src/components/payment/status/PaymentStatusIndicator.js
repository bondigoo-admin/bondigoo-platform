
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Clock, Loader2, Calendar, CreditCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../../utils/logger';

const statusConfig = {
  initial: { 
    icon: Clock, 
    color: 'text-blue-500', 
    label: 'payments:statusInitial',
    description: 'payments:statusInitialDesc' 
  },
  processing: { 
    icon: Loader2, 
    color: 'text-blue-500', 
    label: 'payments:statusProcessing',
    description: 'payments:statusProcessingDesc',
    animate: true 
  },
  requires_payment_method: {
    icon: CreditCard,
    color: 'text-blue-500',
    label: 'payments:statusRequiresMethod',
    description: 'payments:statusRequiresMethodDesc'
  },
  requires_action: { 
    icon: AlertTriangle, 
    color: 'text-yellow-500', 
    label: 'payments:statusAction',
    description: 'payments:statusActionDesc' 
  },
  requires_confirmation: {
    icon: Clock,
    color: 'text-blue-500',
    label: 'payments:statusConfirmation',
    description: 'payments:statusConfirmationDesc'
  },
  succeeded: { 
    icon: CheckCircle, 
    color: 'text-green-500', 
    label: 'payments:statusSuccess',
    description: 'payments:statusSuccessDesc' 
  },
  failed: { 
    icon: XCircle, 
    color: 'text-red-500', 
    label: 'payments:statusFailed',
    description: 'payments:statusFailedDesc' 
  },
  requires_retry: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    label: 'payments:statusRetry',
    description: 'payments:statusRetryDesc'
  },
  scheduled: { 
    icon: Calendar, 
    color: 'text-blue-500', 
    label: 'payments:statusScheduled',
    description: 'payments:statusScheduledDesc' 
  }
};

const PaymentStatusIndicator = ({ 
  status, 
  showLabel = true,
  showDescription = false,
  className = '',
  size = 'default'
}) => {
  const { t } = useTranslation(['payments']);
  const config = statusConfig[status] || statusConfig.initial;
  const Icon = config.icon;

  logger.debug('[PaymentStatusIndicator] Rendering status:', {
    status,
    showLabel,
    showDescription,
    size,
    timestamp: new Date().toISOString()
  });

  const sizeClasses = {
    small: 'h-4 w-4',
    default: 'h-5 w-5',
    large: 'h-6 w-6'
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`flex items-center gap-2 ${className}`}
      >
        <div className="relative">
          <Icon 
            className={`${sizeClasses[size]} ${config.color} 
                     ${config.animate ? 'animate-spin' : ''}`} 
          />
          {status === 'requires_retry' && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-500 rounded-full"
            />
          )}
        </div>
        
        <div className="flex flex-col">
          {showLabel && (
            <span className={`font-medium ${
              size === 'small' ? 'text-sm' : 'text-base'
            }`}>
              {t(config.label)}
            </span>
          )}
          {showDescription && (
            <span className="text-sm text-muted-foreground">
              {t(config.description)}
            </span>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PaymentStatusIndicator;