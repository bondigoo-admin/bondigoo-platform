import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClientProvider } from 'react-query';
import { ReactQueryDevtools } from 'react-query/devtools';
import { AuthProvider } from './contexts/AuthContext';
import { queryClient } from './config/queryClient';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { logger } from './utils/logger';

console.log(">>> BATTLEDOME: React App JS bundle is executing. <<<");

logger.info('[LOG] index.js: SCRIPT EXECUTION STARTED.');

if (process.env.NODE_ENV === 'development') {
  window.addEventListener('error', e => {
    if (e.message.includes('ResizeObserver loop completed with undelivered notifications')) {
      // This is the key to hiding the red error overlay
      const resizeObserverErrDiv = document.getElementById('webpack-dev-server-client-overlay-div');
      const resizeObserverErr = document.getElementById('webpack-dev-server-client-overlay');
      if (resizeObserverErr) {
        resizeObserverErr.setAttribute('style', 'display: none');
      }
      if (resizeObserverErrDiv) {
        resizeObserverErrDiv.setAttribute('style', 'display: none');
      }
    }
  });
}

if (typeof window.process === 'undefined') {
  window.process = {
    env: {
      NODE_ENV: process.env.NODE_ENV || 'development', // Preserve CRA's NODE_ENV
      REACT_APP_API_URL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
      REACT_APP_API_BASE_URL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api',
      REACT_APP_FRONTEND_URL: process.env.REACT_APP_FRONTEND_URL || 'http://localhost:3000',
      // Add other REACT_APP_* vars if needed
    },
    nextTick: (fn, ...args) => setTimeout(() => fn(...args), 0), // Shim for process.nextTick
  };
  logger.info('[index.js] Process polyfill applied', { process: window.process });
}

// Log application startup
logger.info('[App] Initializing application', {
  environment: process.env.NODE_ENV,
  apiUrl: process.env.REACT_APP_API_URL,
  timestamp: new Date().toISOString()
});

const root = ReactDOM.createRoot(document.getElementById('root'));
logger.info('[LOG] index.js: React root created.');


// Error boundary for the entire app
if (process.env.NODE_ENV === 'development') {
  window.onerror = (message, source, lineno, colno, error) => {
    logger.error('[App] Global error:', {
      message,
      source,
      lineno,
      colno,
      error: error?.stack,
      timestamp: new Date().toISOString()
    });
  };
}

logger.info('[LOG] index.js: Calling root.render(). Application render begins now.');

root.render(
  <React.StrictMode>
    <Router>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
        {/* {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />} */}
      </QueryClientProvider>
    </Router>
  </React.StrictMode>
);

// Performance monitoring in development
if (process.env.NODE_ENV === 'development') {
  reportWebVitals((metric) => {
    logger.debug('[Performance]', {
      metric: metric.name,
      value: metric.value,
      timestamp: new Date().toISOString()
    });
  });
} else {
  reportWebVitals();
}

// Log successful render
logger.info('[App] Application mounted successfully', {
  timestamp: new Date().toISOString()
});

// Add development-only error tracking for React Query
if (process.env.NODE_ENV === 'development') {
  queryClient.getQueryCache().subscribe(event => {
    if (event.type === 'error') {
      logger.error('[QueryCache] Query error:', {
        queryKey: event.query.queryKey,
        error: event.error,
        timestamp: new Date().toISOString()
      });
    }
  });
}

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  logger.error('[App] Unhandled Promise Rejection:', {
    reason: event.reason,
    timestamp: new Date().toISOString()
  });
});