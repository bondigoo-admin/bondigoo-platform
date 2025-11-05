import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { 
  getPriceConfiguration, 
  updateBaseRate,
  updateLiveSessionRate,
  updateSessionTypeRate,
  removeSessionTypeRate,
  updateTimeBasedRate,
  updateSpecialPeriod,
  addTimeBasedRate,
  removeTimeBasedRate,
  addSpecialPeriod,
  removeSpecialPeriod
} from '../services/priceAPI';
import { logger } from '../utils/logger';

export const usePricingData = (userId) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['common', 'coachSettings']);

  // Main query for price configuration
  const {
    data: priceConfig,
    isLoading,
    error,
    refetch
  } = useQuery(
    ['priceConfig', userId],
    async () => {
      if (!userId) {
        logger.warn('[usePricingData] No userId provided');
        throw new Error('User ID is required');
      }
      return getPriceConfiguration(userId);
    },
    {
      enabled: Boolean(userId),
      staleTime: 30000,
      cacheTime: 3600000,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      onError: (error) => {
        logger.error('[usePricingData] Error fetching price configuration:', {
          error: error.message,
          userId
        });
        toast.error('Unable to load pricing configuration. Please try again later.');
      }
    }
  );

  const baseRateMutation = useMutation(
    (newBaseRate) => updateBaseRate(userId, newBaseRate),
    {
      onMutate: async (newBaseRate) => {
        await queryClient.cancelQueries(['priceConfig', userId]);
        const previousConfig = queryClient.getQueryData(['priceConfig', userId]);
        
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          baseRate: newBaseRate
        }));

        return { previousConfig };
      },
      onSuccess: (data) => {
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          baseRate: data.config.baseRate,
          metadata: {
            ...old.metadata,
            version: data.config.version,
            lastCalculation: data.config.lastUpdated
          }
        }));
       
      },
      onError: (error, _, context) => {
        queryClient.setQueryData(['priceConfig', userId], context.previousConfig);
        toast.error(t('coachSettings:baseRateUpdateFailed'));
        logger.error('[usePricingData] Base rate update failed:', error);
      }
    }
  );

  const liveSessionRateMutation = useMutation(
    (newRate) => updateLiveSessionRate(userId, newRate),
    {
      onMutate: async (newRate) => {
        await queryClient.cancelQueries(['priceConfig', userId]);
        const previousConfig = queryClient.getQueryData(['priceConfig', userId]);
        
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          liveSessionRate: newRate
        }));

        return { previousConfig };
      },
      onSuccess: (data) => {
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          liveSessionRate: data.liveSessionRate,
        }));
       
      },
      onError: (error, _, context) => {
        if (context?.previousConfig) {
          queryClient.setQueryData(['priceConfig', userId], context.previousConfig);
        }
        toast.error(t('coachSettings:errorSavingLiveSessionRate'));
        logger.error('[usePricingData] Live session rate update failed:', error);
      }
    }
  );

  const sessionTypeRateMutation = useMutation(
    ({ typeId, rate }) => updateSessionTypeRate(userId, typeId, rate),
    {
      onMutate: async ({ typeId, rate }) => {
        await queryClient.cancelQueries(['priceConfig', userId]);
        const previousConfig = queryClient.getQueryData(['priceConfig', userId]);
        
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          sessionTypeRates: rate === null 
            ? old.sessionTypeRates.filter(r => r.sessionType !== typeId)
            : [...old.sessionTypeRates.filter(r => r.sessionType !== typeId), { sessionType: typeId, rate }]
        }));
  
        return { previousConfig };
      },
      onSuccess: (data) => {
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          sessionTypeRates: data.config.sessionTypeRates,
          metadata: {
            ...old.metadata,
            version: data.config.version,
            lastCalculation: data.config.lastUpdated
          }
        }));
       
      },
      onError: (error, variables, context) => {
        queryClient.setQueryData(['priceConfig', userId], context.previousConfig);
        toast.error(t('coachSettings:sessionTypeRateUpdateFailed'));
        logger.error('[usePricingData] Session rate update failed:', error);
      }
    }
  );

  const addTimeBasedRateMutation = useMutation(
    (rateData) => addTimeBasedRate(userId, rateData),
    {
      onSuccess: (data) => {
        queryClient.setQueryData(['priceConfig', userId], old => ({
            ...old,
            timeBasedRates: data.config.timeBasedRates,
            metadata: {
                ...old.metadata,
                version: data.config.version,
                lastCalculation: data.config.lastUpdated
            }
        }));
     
      },
      onError: (error, _, context) => {
        queryClient.setQueryData(['priceConfig', userId], context.previousConfig);
        toast.error(t('coachSettings:addTimeBasedRateFailed'));
        logger.error('[usePricingData] Add time-based rate failed:', error);
      }
    }
  );

  const updateTimeBasedRateMutation = useMutation(
    ({ rateId, rateData }) => updateTimeBasedRate(userId, rateId, rateData),
    {
      onMutate: async ({ rateId, rateData }) => {
        await queryClient.cancelQueries(['priceConfig', userId]);
        const previousConfig = queryClient.getQueryData(['priceConfig', userId]);
        
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          timeBasedRates: old.timeBasedRates.map(r => 
            r._id === rateId ? { ...r, ...rateData } : r
          )
        }));

        return { previousConfig };
      },
      onSuccess: (data) => {
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          timeBasedRates: data.config.timeBasedRates,
          metadata: {
            ...old.metadata,
            version: data.config.version,
            lastCalculation: data.config.lastUpdated
          }
        }));

      },
      onError: (error, _, context) => {
        queryClient.setQueryData(['priceConfig', userId], context.previousConfig);
        toast.error(t('coachSettings:updateTimeBasedRateFailed'));
        logger.error('[usePricingData] Time-based rate update failed:', error);
      }
    }
  );

  const removeTimeBasedRateMutation = useMutation(
    (rateId) => removeTimeBasedRate(userId, rateId),
    {
      onMutate: async (rateId) => {
        await queryClient.cancelQueries(['priceConfig', userId]);
        const previousConfig = queryClient.getQueryData(['priceConfig', userId]);
        
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          timeBasedRates: old.timeBasedRates.filter(r => r._id !== rateId)
        }));
  
        return { previousConfig };
      },
      onSuccess: (data) => {
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          timeBasedRates: data.config.timeBasedRates,
          metadata: {
            ...old.metadata,
            version: data.config.version,
            lastCalculation: data.config.lastUpdated
          }
        }));
     
      },
      onError: (error, _, context) => {
        queryClient.setQueryData(['priceConfig', userId], context.previousConfig);
        toast.error(t('coachSettings:removeTimeBasedRateFailed'));
        logger.error('[usePricingData] Time-based rate deletion failed:', error);
      }
    }
  );
  
  const addSpecialPeriodMutation = useMutation(
    (periodData) => addSpecialPeriod(userId, periodData),
    {
      onSuccess: (data) => {
        queryClient.setQueryData(['priceConfig', userId], old => ({
            ...old,
            specialPeriods: data.config.specialPeriods,
            metadata: {
                ...old.metadata,
                version: data.config.version,
                lastCalculation: data.config.lastUpdated
            }
        }));
      
      },
      onError: (error, _, context) => {
        queryClient.setQueryData(['priceConfig', userId], context.previousConfig);
        toast.error(t('coachSettings:addSpecialPeriodFailed'));
        logger.error('[usePricingData] Add special period failed:', error);
      }
    }
  );

   const updateSpecialPeriodMutation = useMutation(
    ({ periodId, data }) => updateSpecialPeriod(userId, periodId, data),
    {
      onMutate: async ({ periodId, data }) => {
        await queryClient.cancelQueries(['priceConfig', userId]);
        const previousConfig = queryClient.getQueryData(['priceConfig', userId]);
        
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          specialPeriods: old.specialPeriods.map(p => 
            p._id === periodId ? { ...p, ...data } : p
          )
        }));

        return { previousConfig };
      },
      onSuccess: (data) => {
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          specialPeriods: data.config.specialPeriods,
          metadata: {
            ...old.metadata,
            version: data.config.version,
            lastCalculation: data.config.lastUpdated
          }
        }));
      },
      onError: (error, _, context) => {
        if (context?.previousConfig) {
          queryClient.setQueryData(['priceConfig', userId], context.previousConfig);
        }
        toast.error(t('coachSettings:updateSpecialPeriodFailed'));
        logger.error('[usePricingData] Special Period update failed:', error);
      }
    }
  );

  const removeSpecialPeriodMutation = useMutation(
    (periodId) => removeSpecialPeriod(userId, periodId),
    {
      onMutate: async (periodId) => {
        await queryClient.cancelQueries(['priceConfig', userId]);
        const previousConfig = queryClient.getQueryData(['priceConfig', userId]);
        
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          specialPeriods: old.specialPeriods.filter(p => p._id !== periodId)
        }));
  
        return { previousConfig };
      },
      onSuccess: (data) => {
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          specialPeriods: data.config.specialPeriods,
          metadata: {
            ...old.metadata,
            version: data.config.version,
            lastCalculation: data.config.lastUpdated
          }
        }));
      },
      onError: (error, _, context) => {
        queryClient.setQueryData(['priceConfig', userId], context.previousConfig);
        toast.error(t('coachSettings:removeSpecialPeriodFailed'));
        logger.error('[usePricingData] Special period deletion failed:', error);
      }
    }
  );

  const removeSessionTypeRateMutation = useMutation(
    (typeId) => removeSessionTypeRate(userId, typeId),
    {
      onMutate: async (typeId) => {
        await queryClient.cancelQueries(['priceConfig', userId]);
        const previousConfig = queryClient.getQueryData(['priceConfig', userId]);
        
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          sessionTypeRates: old.sessionTypeRates.filter(r => 
            r.sessionType !== typeId
          )
        }));
  
        return { previousConfig };
      },
      onSuccess: (data) => {
        queryClient.setQueryData(['priceConfig', userId], old => ({
          ...old,
          sessionTypeRates: data.config.sessionTypeRates,
           metadata: {
            ...old.metadata,
            version: data.config.version,
            lastCalculation: data.config.lastUpdated
          }
        }));
      },
      onError: (error, _, context) => {
        queryClient.setQueryData(['priceConfig', userId], context.previousConfig);
        toast.error(t('coachSettings:sessionTypeRateDeleteFailed'));
        logger.error('[usePricingData] Session rate deletion failed:', error);
      }
    }
  );

  return {
    // Data and loading states
    priceConfig,
    isLoading,
    error,
    refetch,
    
    // Base rate operations
    updateBaseRate: baseRateMutation.mutate,
    isUpdatingBaseRate: baseRateMutation.isLoading,

    updateLiveSessionRate: liveSessionRateMutation.mutateAsync,
    isUpdatingLiveSessionRate: liveSessionRateMutation.isLoading,
    
    // Session type operations
    updateSessionTypeRate: sessionTypeRateMutation.mutate,
    isUpdatingSessionType: sessionTypeRateMutation.isLoading,
    removeSessionTypeRate: removeSessionTypeRateMutation.mutate,
    isRemovingSessionType: removeSessionTypeRateMutation.isLoading,
    
    // Time-based rate operations
    addTimeBasedRate: addTimeBasedRateMutation.mutate,
    updateTimeBasedRate: updateTimeBasedRateMutation.mutate,
    removeTimeBasedRate: removeTimeBasedRateMutation.mutate,
    isRemovingTimeBasedRate: removeTimeBasedRateMutation.isLoading,
    isAddingTimeBasedRate: addTimeBasedRateMutation.isLoading,
    isUpdatingTimeBasedRate: updateTimeBasedRateMutation.isLoading,
    
    // Special period operations
    addSpecialPeriod: addSpecialPeriodMutation.mutate,
    updateSpecialPeriod: updateSpecialPeriodMutation.mutate,
    isUpdatingSpecialPeriod: updateSpecialPeriodMutation.isLoading,
    removeSpecialPeriod: removeSpecialPeriodMutation.mutate,
    isRemovingSpecialPeriod: removeSpecialPeriodMutation.isLoading,
    isAddingSpecialPeriod: addSpecialPeriodMutation.isLoading
  };
};