// src/config/queryClient.js
import { QueryClient } from 'react-query';
import { logger } from '../utils/logger';

const retryLogic = (failureCount, error) => {
  logger.warn('[QueryClient] Retry attempt:', {
    failureCount,
    error: error.message,
    status: error.response?.status,
    timestamp: new Date().toISOString()
  });

  if (error.response?.status === 404) return false;
  if (failureCount >= 3) return false;
  return true;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
      retry: retryLogic,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      onError: (error, query) => {
        // Add null check and safe access
        /*logger.error('[QueryClient] Query error:', {
          queryKey: query?.queryKey || 'unknown',
          error: error?.message || 'Unknown error',
          status: error?.response?.status,
          timestamp: new Date().toISOString(),
          // Add more debug info
          query: query ? {
            queryHash: query.queryHash,
            status: query.status,
            state: query.state ? {
              data: !!query.state.data,
              error: !!query.state.error,
              status: query.state.status
            } : null
          } : 'query undefined'
        });*/
      }
    },
    mutations: {
      retry: 2,
      onError: (error, variables, context) => {
        // Add safe error logging
        logger.error('[QueryClient] Mutation error:', {
          error: error?.message || 'Unknown error',
          errorObject: error ? {
            name: error.name,
            stack: error.stack,
            code: error.code
          } : 'error undefined',
          variables: variables || 'no variables',
          context: context || 'no context',
          timestamp: new Date().toISOString()
        });
      }
    }
  }
});

// Global cache listeners
queryClient.getQueryCache().subscribe(event => {
  if (event?.type === 'queryUpdated' && event.query) {
   
  }
});

// Prefetch handler
export const prefetchQuery = async (queryKey, queryFn) => {
  if (!queryKey || !queryFn) {
    logger.warn('[QueryClient] Invalid prefetch parameters:', {
      hasQueryKey: !!queryKey,
      hasQueryFn: !!queryFn,
      timestamp: new Date().toISOString()
    });
    return;
  }

  logger.debug('[QueryClient] Prefetching query:', {
    queryKey,
    timestamp: new Date().toISOString()
  });

  try {
    await queryClient.prefetchQuery(queryKey, queryFn, {
      // Add specific options for prefetch
      staleTime: 2 * 60 * 1000, // 2 minutes
      cacheTime: 5 * 60 * 1000, // 5 minutes
      retry: false // Don't retry prefetch failures
    });
  } catch (error) {
    logger.error('[QueryClient] Prefetch error:', {
      queryKey,
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      timestamp: new Date().toISOString()
    });
  }
};