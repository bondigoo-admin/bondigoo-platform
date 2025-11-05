// src/config/queryClient.js
import { QueryClient } from 'react-query';
import { logger } from '../utils/logger';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
      retry: 2,
      refetchOnWindowFocus: true,
      onError: (error) => {
        logger.error('[QueryClient] Query error:', {
          message: error.message,
          status: error.response?.status,
          url: error.config?.url,
          timestamp: new Date().toISOString()
        });
      }
    }
  }
});

// Add global query cache listener
queryClient.getQueryCache().subscribe(event => {
  if (event.type === 'queryUpdated') {
    logger.debug('[QueryClient] Query cache updated:', {
      queryKey: event.query.queryKey,
      status: event.query.status,
      timestamp: new Date().toISOString()
    });
  }
});