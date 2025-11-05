import { useQuery } from 'react-query';
import * as coachAPI from '../services/coachAPI';
import * as earningsAPI from '../services/earningsAPI';
import { fetchDashboardStats } from '../services/earningsAPI';
import { logger } from '../utils/logger';
import api from '../services/api';

export const coachDashboardKeys = {
  all: ['coachDashboard'],
  stats: (coachId) => [...coachDashboardKeys.all, 'stats', coachId],
  overview: (coachId, filters) => [...coachDashboardKeys.all, 'overview', coachId, filters],
  programAnalytics: (coachId, filters) => [...coachDashboardKeys.all, 'programAnalytics', coachId, filters],
  earningsStats: (coachId) => [...coachDashboardKeys.all, 'earningsStats', coachId],
  transactions: (coachId, page, limit) => [...coachDashboardKeys.all, 'transactions', coachId, { page, limit }],
  clientsList: (coachId) => [...coachDashboardKeys.all, 'clientsList', coachId],
};

export const useCoachDashboardStats = (coachId) => {
  return useQuery(
    coachDashboardKeys.stats(coachId),
    () => coachAPI.getDashboardStats(),
    {
      enabled: !!coachId,
      staleTime: 1000 * 60 * 5,
      placeholderData: {
        totalRevenue: 0,
        totalEnrollments: 0,
        averageRating: 0,
        reviewCount: 0,
        monthlyRevenue: [],
        programEnrollments: [],
      },
    }
  );
};

export const useCoachOverview = (coachId, filters) => {
  return useQuery(
    coachDashboardKeys.overview(coachId, filters),
    () => coachAPI.getDashboardOverview(filters),
    {
      enabled: !!coachId,
       onSuccess: (data) => {
        logger.info('[useCoachOverview] Successfully fetched dashboard data.', { 
          hasData: !!data,
          actionCenterCount: data?.actionCenter?.length ?? 0,
          scheduleCount: data?.upcomingSchedule?.length ?? 0,
          filters,
        });
        logger.debug('[useCoachOverview] Full data from onSuccess:', { data });
      },
      onError: (error) => {
        logger.error('[useCoachOverview] FAILED to fetch dashboard data.', { error: error.response?.data || error.message, filters });
      }
    }
  );
};

export const useProgramAnalytics = (coachId, filters) => {
    return useQuery(
      coachDashboardKeys.programAnalytics(coachId, filters),
      () => coachAPI.getProgramAnalytics(filters),
      {
        enabled: !!coachId,
        staleTime: 1000 * 60 * 5,
      }
    );
};

export const useCoachClientsList = (coachId) => {
  return useQuery(
    coachDashboardKeys.clientsList(coachId),
    coachAPI.getCoachClientsList,
    {
      enabled: !!coachId,
      staleTime: 5 * 60 * 1000,
    }
  );
};

export const useEarningsStats = (coachId) => {
  return useQuery(
    coachDashboardKeys.earningsStats(coachId), 
    fetchDashboardStats, 
    {
      enabled: !!coachId,
      staleTime: 5 * 60 * 1000,
      cacheTime: 0, 
      select: (data) => data || {
          allTimeGross: 0,
          allTimeNet: 0,
          last30DaysGross: 0,
          last30DaysNet: 0
      },
    }
  );
};

export const useCoachTransactions = (coachId, page = 1, limit = 10) => {
  return useQuery(
    coachDashboardKeys.transactions(coachId, page, limit),
    () => earningsAPI.fetchTransactions({ queryKey: ['transactions', { page, limit }] }),
    {
      enabled: !!coachId,
      keepPreviousData: true,
      staleTime: 1000 * 60 * 1, // 1 minute
    }
  );
};