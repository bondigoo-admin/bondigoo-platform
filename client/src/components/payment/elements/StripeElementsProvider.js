import React, { useEffect, useState } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { logger } from '../../../utils/logger';
import { stripePromise } from '../../../contexts/PaymentContext';

const STRIPE_LOAD_TIMEOUT = 10000;

const StripeElementsProvider = ({ 
  children, 
  clientSecret,
  options = {} 
}) => {
  const [stripeLoadError, setStripeLoadError] = useState(null);
  const [isStripeLoaded, setIsStripeLoaded] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!isStripeLoaded) {
        const error = new Error('Stripe initialization timeout');
        logger.error('[StripeElementsProvider] Stripe load error:', {
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        setStripeLoadError(error);
      }
    }, STRIPE_LOAD_TIMEOUT);

    stripePromise.then(stripe => {
        clearTimeout(timeoutId);
        if (stripe) {
          logger.info('[StripeElementsProvider] Stripe loaded successfully from global promise', {
            timestamp: new Date().toISOString()
          });
          setIsStripeLoaded(true);
        } else {
          throw new Error('Failed to initialize Stripe');
        }
      }).catch(error => {
        clearTimeout(timeoutId);
        logger.error('[StripeElementsProvider] Stripe load error from global promise:', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
        setStripeLoadError(error);
      });

      return () => clearTimeout(timeoutId);
  }, [isStripeLoaded]);
  
  const ErrorDisplay = ({ error }) => (
    <div className="p-4 rounded-md bg-red-50 border border-red-200">
      <p className="text-sm font-medium text-red-800">
        Payment system initialization failed
      </p>
      <p className="mt-1 text-sm text-red-700">
        {error?.message || 'Please try again later'}
      </p>
    </div>
  );

  useEffect(() => {
    if (clientSecret) {
      logger.debug('[StripeElementsProvider] Client secret updated:', {
        hasSecret: !!clientSecret,
        hasStripe: !!stripePromise,
        timestamp: new Date().toISOString()
      });
    }
  }, [clientSecret, stripePromise]);

  if (stripeLoadError) {
    logger.error('[StripeElementsProvider] Rendering error state:', {
      error: stripeLoadError.message,
      timestamp: new Date().toISOString()
    });
    return <ErrorDisplay error={stripeLoadError} />;
  }

  if (!isStripeLoaded || !clientSecret) {
    logger.debug('[StripeElementsProvider] Waiting for initialization:', {
      isStripeLoaded,
      hasSecret: !!clientSecret,
      timestamp: new Date().toISOString()
    });
    return (
      <div className="stripe-loading p-4">
        <p className="text-gray-600">Initializing payment system...</p>
      </div>
    );
  }

  const defaultOptions = {
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#4a90e2',
        colorBackground: '#ffffff',
        colorText: '#333333',
        colorDanger: '#e53e3e',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        spacingUnit: '4px',
        borderRadius: '8px',
      },
      rules: {
        '.Label': {
          marginBottom: '8px',
          color: '#333333'
        },
        '.Input': {
          padding: '12px',
          borderColor: '#e2e8f0',
          boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)'
        },
        '.Input:focus': {
          borderColor: '#4a90e2',
          boxShadow: '0 0 0 1px #4a90e2'
        },
        '.Error': {
          color: '#e53e3e',
          marginTop: '4px'
        }
      }
    },
    clientSecret,
    loader: 'auto'
  };

  const mergedOptions = {
    ...defaultOptions,
    ...options,
    appearance: {
      ...defaultOptions.appearance,
      ...options.appearance,
      variables: {
        ...defaultOptions.appearance.variables,
        ...options.appearance?.variables
      },
      rules: {
        ...defaultOptions.appearance.rules,
        ...options.appearance?.rules
      }
    }
  };

  logger.info('[StripeElementsProvider] Rendering Elements with children:', {
    hasChildren: !!children,
    clientSecret: clientSecret ? '[REDACTED]' : null,
    options: mergedOptions,
    timestamp: new Date().toISOString()
  });

  return (
    <Elements 
      stripe={stripePromise} 
      options={mergedOptions}
    >
      {React.Children.map(children, child => {
        logger.debug('[StripeElementsProvider] Rendering child component:', {
          childType: child?.type?.name || 'Unknown',
          isStripeLoaded,
          hasClientSecret: !!clientSecret,
          timestamp: new Date().toISOString()
        });
        return child;
      })}
    </Elements>
  );
};

export default StripeElementsProvider;