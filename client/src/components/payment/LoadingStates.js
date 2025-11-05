// In LoadingStates.js - Update the component
import React from 'react';
import { motion } from 'framer-motion';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';

const LoadingStates = ({ state, message, error = null }) => {
  const { t } = useTranslation(['payments']);

  logger.debug('[LoadingStates] Rendering with state:', { state, message, error });

  const stateVariants = {
    initial: { 
      opacity: 0, 
      scale: 0.95 
    },
    animate: { 
      opacity: 1, 
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 200,
        damping: 20
      }
    },
    exit: { 
      opacity: 0,
      scale: 0.95
    }
  };

  const getStateContent = () => {
    switch (state) {
      case 'error':
        return {
          icon: <AlertTriangle className="h-8 w-8 text-destructive" />,
          messageKey: 'payments:error.general'
        };
      case 'success':
        return {
          icon: <CheckCircle className="h-8 w-8 text-success" />,
          messageKey: 'payments:success'
        };
      case 'processing':
        return {
          icon: <Loader2 className="h-8 w-8 animate-spin text-primary" />,
          messageKey: 'payments:loading.processing'
        };
      default:
        return {
          icon: <Loader2 className="h-8 w-8 animate-spin text-primary" />,
          messageKey: 'payments:loading.initializing'
        };
    }
  };

  const { icon, messageKey } = getStateContent();

  return (
    <motion.div
      className="flex flex-col items-center justify-center p-6 text-center"
      variants={stateVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="relative">
        {icon}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        />
      </div>

      <motion.p
        className="mt-4 text-base font-medium text-foreground"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {message || t(messageKey)}
      </motion.p>

      {error && (
        <motion.p
          className="mt-2 text-sm text-destructive"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {error}
        </motion.p>
      )}
    </motion.div>
  );
};

export default LoadingStates;