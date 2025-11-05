import { useQueries, useQuery } from 'react-query';
import { getBookingPublicSummary } from '../services/bookingAPI';
import { useMemo, useEffect } from 'react';
import { logger } from '../utils/logger';

const logBookingOperation = (operation, details) => {
  logger.debug(`[useBookingData] ${operation}:`, details);
};

export const useBookingData = (bookingIds) => {
  // Log initial hook call
  logBookingOperation('Hook called with bookingIds', { rawBookingIds: bookingIds });

  // Process and normalize booking IDs
  const normalizedIds = useMemo(() => {
    logBookingOperation('Normalizing booking IDs', { input: bookingIds });

    if (!bookingIds) {
      logBookingOperation('No booking IDs provided', { bookingIds });
      return [];
    }
    
    const ids = Array.isArray(bookingIds) ? bookingIds : [bookingIds];
    const normalized = ids
      .map(id => {
        if (!id) {
          logBookingOperation('Skipping null/undefined ID', { id });
          return null;
        }
        const normalizedId = typeof id === 'object' ? id._id || id.id : id;
        logBookingOperation('Normalized ID', { original: id, normalized: normalizedId });
        return normalizedId;
      })
      .filter(Boolean);

    logBookingOperation('Finished normalizing IDs', { 
      originalCount: ids.length, 
      normalizedCount: normalized.length,
      normalizedIds: normalized 
    });

    return normalized;
  }, [bookingIds]);

  // Set up React Query for each booking
  const queries = useQueries(
    normalizedIds.map(id => ({
      queryKey: ['booking', id],
      queryFn: async () => {
        logBookingOperation('Fetching booking', { bookingId: id });
        try {
          const response = await getBookingPublicSummary(id);
          logBookingOperation('Booking fetch successful', { 
            bookingId: id,
            responseData: response 
          });
          return response;
        } catch (error) {
          // Handle 404s differently for declined bookings
          if (error?.response?.status === 404) {
            logBookingOperation('Booking not found (possibly declined)', {
              bookingId: id,
              status: 404
            });
            // Return null instead of throwing for 404s
            return null;
          }

          logBookingOperation('Booking fetch failed', {
            bookingId: id,
            error: {
              message: error.message,
              status: error.response?.status,
              statusText: error.response?.statusText,
              url: error.config?.url,
              method: error.config?.method
            }
          });
          throw error;
        }
      },
      enabled: !!id,
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry 404s
        if (error?.response?.status === 404) {
          return false;
        }
        // Retry other errors up to 2 times
        return failureCount < 2;
      },
      onError: (error) => {
        // Only log errors that aren't 404s
        if (error?.response?.status !== 404) {
          logger.error('[useBookingData] Error fetching booking:', {
            bookingId: id,
            error: {
              message: error.message,
              status: error.response?.status,
              statusText: error.response?.statusText,
              url: error.config?.url
            }
          });
        }
      }
    }))
  );

  // Process query results into bookings object
  const bookings = useMemo(() => {
    if (!queries || !Array.isArray(queries)) {
      logBookingOperation('No queries available', { queries });
      return {};
    }
    
    const processedBookings = queries.reduce((acc, query, index) => {
      const id = normalizedIds[index];
      if (query?.data && id) {
        logBookingOperation('Processing query result', { 
          bookingId: id,
          status: query.status,
          hasData: !!query.data
        });
        acc[id] = query.data;
      }
      return acc;
    }, {});

    logBookingOperation('Processed all bookings', { 
      totalQueries: queries.length,
      successfulBookings: Object.keys(processedBookings).length,
      bookingIds: Object.keys(processedBookings)
    });

    return processedBookings;
  }, [queries, normalizedIds]);

  const isLoading = queries?.some(query => query?.isLoading) ?? false;
  const error = queries?.find(query => query?.error)?.error ?? null;

  logBookingOperation('Hook state update', {
    isLoading,
    hasError: !!error,
    bookingCount: Object.keys(bookings).length,
    queriesStatus: queries?.map(q => ({
      id: q?.queryKey?.[1],
      status: q?.status,
      isLoading: q?.isLoading,
      isError: q?.isError
    }))
  });

  // Return empty state for no valid IDs
  if (!normalizedIds.length) {
    logBookingOperation('Returning empty state (no valid IDs)', null);
    return { bookings: {}, isLoading: false, error: null };
  }

  return { bookings, isLoading, error };
};

export const useSingleBookingData = (bookingId) => {
  logBookingOperation('Single booking hook called', { bookingId });

  const { data, isLoading, error } = useQuery(
    ['booking', bookingId],
    () => getBookingPublicSummary(bookingId),
    {
      enabled: !!bookingId,
      staleTime: 1000 * 60 * 5,
      retry: 2,
      select: (responseData) => {
        logBookingOperation('Transforming booking data', { 
          bookingId,
          hasResponseData: !!responseData 
        });

        if (!responseData) return null;

        try {
          const transformed = {
            start: new Date(responseData.start),
            end: new Date(responseData.end),
            clientName: responseData.user?.name || 'Unknown Client',
            sessionType: responseData.sessionType?.name || 'Unknown Session Type',
            status: responseData.status || 'unknown',
            _id: responseData._id,
            sessionTypeId: responseData.sessionType?._id || responseData.sessionType?.id,
            coach: responseData.coach || null,
            user: responseData.user || null
          };

          logBookingOperation('Successfully transformed booking data', {
            bookingId,
            transformedData: {
              ...transformed,
              start: transformed.start.toISOString(),
              end: transformed.end.toISOString()
            }
          });

          return transformed;
        } catch (error) {
          logBookingOperation('Error transforming booking data', {
            bookingId,
            error: error.message
          });
          return null;
        }
      },
      onError: (error) => {
        logger.error('[useSingleBookingData] Error fetching booking:', {
          bookingId,
          error: {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            url: error.config?.url
          }
        });
      }
    }
  );

  // Log final state
  logBookingOperation('Single booking hook state', {
    bookingId,
    isLoading,
    hasError: !!error,
    hasData: !!data
  });

  if (!bookingId) {
    logBookingOperation('Returning null state (no bookingId)', null);
    return { data: null, isLoading: false, error: null };
  }

  return { data, isLoading, error };
};

export default useBookingData;