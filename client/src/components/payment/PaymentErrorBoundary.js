
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RefreshCw, XCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';

class PaymentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      error: null, 
      errorInfo: null,
      recoveryAttempts: 0 
    };
  }

  static getDerivedStateFromError(error) {
    logger.error('[PaymentErrorBoundary] Caught error:', {
      error: error.message,
      code: error.code,
      type: error.type
    });

    return { 
      error,
      recoveryAttempts: 0 // Reset on new error; subsequent updates via setState
    };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('[PaymentErrorBoundary] Component stack:', {
      error: error.message,
      stack: errorInfo.componentStack,
      recoveryAttempts: this.state.recoveryAttempts
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    logger.info('[PaymentErrorBoundary] Attempting recovery:', {
      attempt: this.state.recoveryAttempts + 1,
      error: this.state.error?.message
    });

    this.setState(prevState => ({
      error: null,
      errorInfo: null,
      recoveryAttempts: prevState.recoveryAttempts + 1
    }));

    if (this.props.onRetry) {
      this.props.onRetry(this.state.recoveryAttempts + 1);
    }
  };

  handleCancel = () => {
    logger.info('[PaymentErrorBoundary] Payment cancelled due to error');
    
    if (this.props.onCancel) {
      this.props.onCancel(this.state.error);
    }
  };

  render() {
    if (this.state.error) {
      return <PaymentErrorDisplay 
        error={this.state.error}
        recoveryAttempts={this.state.recoveryAttempts}
        maxRetries={this.props.maxRetries || 3}
        onRetry={this.handleRetry}
        onCancel={this.handleCancel}
      />;
    }

    return this.props.children;
  }
}

const PaymentErrorDisplay = ({ 
  error, 
  recoveryAttempts, 
  maxRetries, 
  onRetry, 
  onCancel 
}) => {
  const { t } = useTranslation(['payments']);
  const canRetry = recoveryAttempts < maxRetries && error.recoverable !== false;

  return (
    <motion.div
      className="payment-error-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="flex flex-col p-6 gap-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-base text-foreground">
              {t('payments:error.title')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {error.message}
            </p>
            {canRetry && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('payments:error.retriesRemaining', {
                  count: maxRetries - recoveryAttempts
                })}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-2">
          <button
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background border border-input hover:bg-accent hover:text-accent-foreground h-9 px-3"
          >
            {t('common:cancel')}
          </button>
          {canRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('payments:retry')}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default PaymentErrorBoundary;