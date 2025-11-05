import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Draggable from 'react-draggable';
import { AlertTriangle, XCircle, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from './ui/button.tsx';
import { logger } from '../utils/logger';

const PaymentFailureModal = ({ onAction, onClose, sessionId }) => {
  const { t } = useTranslation(['session', 'common']);
  const nodeRef = useRef(null);

   logger.info('[PaymentFailureModal] Rendering modal', { sessionId });

  const handleAction = (choice) => {
    logger.info('[PaymentFailureModal] Action selected', { choice, sessionId });
     if (typeof onAction === 'function') {
        onAction(choice);
    } else {
        logger.error('[PaymentFailureModal] onAction prop is not a function', { sessionId });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1003] flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <Draggable handle=".drag-handle" bounds="parent" nodeRef={nodeRef}>
        <div
          ref={nodeRef}
          className="pointer-events-auto w-full max-w-md overflow-hidden rounded-lg border bg-destructive text-destructive-foreground shadow-xl"
           onClick={(e) => e.stopPropagation()}
        >
           <div className="drag-handle flex cursor-move items-center justify-between border-b border-destructive-foreground/20 p-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <AlertTriangle size={20} /> {t('paymentFailedTitle', 'Payment Failed')}
            </h3>
          </div>

          <div className="p-4">
            <p className="mb-6 text-sm text-destructive-foreground/90">{t('paymentFailedCoachMessage', 'The user\'s payment for overtime failed. You can choose to continue the session or terminate it.')}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
               <Button
                onClick={() => handleAction('continue')}
                className="flex-1 justify-center bg-destructive-foreground text-destructive hover:bg-destructive-foreground/90"
                aria-label={t('continueSession')}
              >
                <CheckCircle size={18} className="mr-2"/> {t('continueSession', 'Continue Session')}
              </Button>
              <Button
                onClick={() => handleAction('terminate')}
                variant="outline"
                className="flex-1 justify-center border-destructive-foreground/50 text-destructive-foreground hover:bg-destructive-foreground/10 hover:text-destructive-foreground"
                aria-label={t('terminateSession')}
              >
                 <XCircle size={18} className="mr-2"/> {t('terminateSession', 'Terminate Session')}
              </Button>
            </div>
          </div>
        </div>
      </Draggable>
    </motion.div>
  );
};

export default PaymentFailureModal;