// In PaymentStepIndicator.js - Complete component rewrite
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CreditCard, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const PaymentStepIndicator = ({ currentStep, steps, error = null }) => {
  const { t } = useTranslation(['payments']);

  const getStepIcon = (step, isCompleted) => {
    if (isCompleted) return <Check className="h-4 w-4" />;
    
    switch (step) {
      case 'timing':
        return <Clock className="h-4 w-4" />;
      case 'method':
        return <CreditCard className="h-4 w-4" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const stepVariants = {
    inactive: { 
      scale: 0.8,
      opacity: 0.6 
    },
    active: { 
      scale: 1,
      opacity: 1
    },
    completed: {
      scale: 1,
      opacity: 1
    }
  };

  const connectorVariants = {
    inactive: {
      backgroundImage: 'linear-gradient(to right, var(--border-color) 50%, transparent 50%)',
      backgroundSize: '8px 1px',
      backgroundRepeat: 'repeat-x',
      opacity: 0.5
    },
    active: {
      backgroundImage: 'linear-gradient(to right, var(--primary) 50%, transparent 50%)',
      backgroundSize: '8px 1px',
      backgroundRepeat: 'repeat-x',
      opacity: 1
    },
    completed: {
      background: 'var(--primary)',
      opacity: 1
    }
  };

  return (
    <div className="payment-step-indicator relative pt-2 pb-4">
      <div className="flex justify-between items-center">
        {steps.map((step, index) => (
          <React.Fragment key={step}>
            <motion.div
              className={`step-item flex flex-col items-center gap-2 relative z-10
                ${currentStep === step ? 'text-primary' : 'text-muted-foreground'}
                ${index < steps.indexOf(currentStep) ? 'text-primary' : ''}`}
              initial="inactive"
              animate={
                index < steps.indexOf(currentStep) 
                  ? "completed" 
                  : currentStep === step 
                    ? "active" 
                    : "inactive"
              }
              variants={stepVariants}
            >
              <div className={`step-icon w-8 h-8 rounded-full flex items-center justify-center
                ${currentStep === step ? 'bg-primary text-primary-foreground' : 'bg-muted'}
                ${index < steps.indexOf(currentStep) ? 'bg-primary text-primary-foreground' : ''}
                transition-all duration-200`}
              >
                {getStepIcon(step, index < steps.indexOf(currentStep))}
              </div>
              <span className="step-label text-xs font-medium">
                {t(`payments:steps.${step}`)}
              </span>
            </motion.div>

            {index < steps.length - 1 && (
              <motion.div
                className="step-connector flex-1 h-px mx-2"
                initial="inactive"
                animate={
                  index < steps.indexOf(currentStep) - 1 
                    ? "completed" 
                    : index === steps.indexOf(currentStep) - 1 
                      ? "active" 
                      : "inactive"
                }
                variants={connectorVariants}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute -bottom-6 left-0 right-0 text-center text-xs text-destructive"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PaymentStepIndicator;