
const STRIPE_CONFIG = {
  connectAccountUrls: {
    success: `${window.location.origin}/settings/connect/complete`,
    refresh: `${window.location.origin}/settings/connect/refresh`,
    return: `${window.location.origin}/settings`,
  },
  publishableKey: process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY,
  options: {
    locale: 'auto',
    fonts: [{
      cssSrc: 'https://fonts.googleapis.com/css?family=Inter:400,500,600'
    }],
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#0F172A',
        colorBackground: '#ffffff',
        colorText: '#0F172A',
        colorDanger: '#df1b41',
        fontFamily: 'Inter, system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: '4px',
      }
    }
  }
};

// Add validation and error logging
if (!STRIPE_CONFIG.publishableKey) {
  console.error('[StripeConfig] Missing required environment variable: REACT_APP_STRIPE_PUBLISHABLE_KEY');
  throw new Error('Stripe configuration missing required publishableKey');
}

// Add key validation
const isValidStripeKey = (key) => {
  return /^pk_test_[A-Za-z0-9]+$/.test(key);
};

if (!isValidStripeKey(STRIPE_CONFIG.publishableKey)) {
  console.error('[StripeConfig] Invalid Stripe publishable key format');
  throw new Error('Invalid Stripe publishable key format');
}

// Add debug logging in development
if (process.env.NODE_ENV === 'development') {
  console.debug('[StripeConfig] Initialized with key:', 
    STRIPE_CONFIG.publishableKey.slice(0, 8) + '...'
  );
}

export default STRIPE_CONFIG;