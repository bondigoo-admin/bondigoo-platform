import { useQuery } from 'react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { getUserEnrollments } from '../services/programAPI';
import { getUserSessions } from '../services/bookingAPI';
import { getUserConnections } from '../services/connectionAPI';
import { getUserDashboardData } from '../services/userAPI';

export const useUserDashboard = () => {
    const { user } = useAuth();
    const userId = user?._id;

    // Replaced useQueries with a single, efficient useQuery
    const { data, isLoading, isError } = useQuery(
        ['userDashboardData', userId],
        getUserDashboardData,
        {
            enabled: !!userId,
            staleTime: 5 * 60 * 1000,
            onSuccess: (data) => {
                console.log('[useUserDashboard] Unified dashboard data fetched successfully:', data);
            },
            onError: (error) => {
                console.error('[useUserDashboard] Error fetching unified dashboard data:', {
                    message: error.message,
                    responseData: error.response?.data,
                    status: error.response?.status,
                });
            }
        }
    );

    // Return a simplified and consistent data structure
   return {
        // Overview Data
        overviewData: {
            nextSession: data?.nextSession,
            primaryCoach: data?.primaryCoach,
        },
        isLoadingOverview: isLoading,
        isErrorOverview: isError,

        // Enrollments Data
        enrollmentsData: data?.enrollments,
        isLoadingEnrollments: isLoading,
        isErrorEnrollments: isError,

        // Sessions Data
        sessionsData: data?.sessions,
        isLoadingSessions: isLoading,
        isErrorSessions: isError,
        
        // Action Center Data
        actionCenterData: data?.actionCenter,
        isLoadingActionCenter: isLoading,
        isErrorActionCenter: isError,

        // Connections Data
        connectionsData: data?.connections?.connections,
        isLoadingConnections: isLoading,
        isErrorConnections: isError,

        // Global States
        isLoading,
        isError,
    };
};