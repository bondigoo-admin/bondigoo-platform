import { useMemo } from 'react';
import { useQueries } from 'react-query';
import { getBookingSummary } from '../services/bookingAPI';
import { getProgramLandingPage } from '../services/programAPI';
import { logger } from '../utils/logger';

const entityFetchers = {
  booking: getBookingSummary,
  program: getProgramLandingPage,
};

export const useEntityData = (notifications) => {
   const queriesToRun = useMemo(() => {
    if (!notifications || notifications.length === 0) return [];
    
    const uniqueEntities = new Map();
    notifications.forEach(n => {
      const metadata = n.metadata || {};
      let entityId;
      let entityType;

      if (
        n.type?.startsWith('program_') ||
        (
          (n.type === 'payment_received' || n.type === 'payment_made_by_user') &&
          metadata?.additionalData?.type === 'program_purchase'
        )
      ) {
        entityType = 'program';
        entityId = metadata.programId;
      } else {
        entityType = 'booking';
        entityId = metadata.bookingId;
      }

      if (!entityId) return;

      if (typeof entityId === 'object' && entityId._id) {
        entityId = entityId._id.toString();
      }
      
      const uniqueKey = `${entityType}-${entityId}`;
      if (!uniqueEntities.has(uniqueKey)) {
        if (entityFetchers[entityType]) {
          logger.debug('[useEntityData] Found entity to fetch', { key: uniqueKey, type: n.type });
          uniqueEntities.set(uniqueKey, { entityId, entityType });
        } else {
          logger.warn('[useEntityData] No fetcher for determined entity type', { entityType, notificationType: n.type });
        }
      }
    });

    return Array.from(uniqueEntities.values());
  }, [notifications]);

  const entityQueries = useQueries(
    queriesToRun.map(({ entityId, entityType }) => ({
      queryKey: [entityType, entityId],
     queryFn: async () => {
        const fetcher = entityFetchers[entityType];
        if (!fetcher) {
          logger.error('[useEntityData] No fetcher for entity type', { entityType });
          return null;
        }
        try {
          logger.debug(`[useEntityData] Fetching ${entityType}`, { id: entityId });
          const data = await fetcher(entityId);
          return { ...data, _entityType: entityType };
        } catch (error) {
          if (error?.response?.status === 404 || error?.response?.status === 500) {
            logger.warn(`[useEntityData] Could not fetch entity (likely deleted)`, { 
              type: entityType, 
              id: entityId,
              status: error?.response?.status 
            });
            return null;
          }
          throw error;
        }
      },
      staleTime: 5 * 60 * 1000,
      enabled: !!entityId && !!entityType,
      retry: (failureCount, error) => {
        if (error?.response?.status === 404) return false;
        return failureCount < 2;
      },
    }))
  );

  const entitiesMap = useMemo(() => {
    return entityQueries.reduce((acc, query, index) => {
      if (query.data) {
        const { entityId } = queriesToRun[index];
        acc[entityId] = query.data;
      }
      return acc;
    }, {});
  }, [entityQueries, queriesToRun]);

  return {
    entitiesMap,
    isLoading: entityQueries.some(q => q.isLoading),
    isError: entityQueries.some(q => q.isError),
  };
};