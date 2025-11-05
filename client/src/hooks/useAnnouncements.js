import { useQuery, useMutation, useQueryClient } from 'react-query';
import * as announcementAPI from '../services/announcementAPI';
import { logger } from '../utils/logger';

// For Admin Panel
export const useAnnouncements = () => {
    return useQuery('announcements', announcementAPI.getAnnouncements);
};

export const useCreateAnnouncement = () => {
    const queryClient = useQueryClient();
    return useMutation(announcementAPI.createAnnouncement, {
        onSuccess: () => {
            queryClient.invalidateQueries('announcements');
        },
    });
};

export const useUpdateAnnouncement = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ id, updateData }) => announcementAPI.updateAnnouncement(id, updateData),
        {
            onMutate: async ({ id, updateData }) => {
                await queryClient.cancelQueries('announcements');
                const previousAnnouncements = queryClient.getQueryData('announcements');
                queryClient.setQueryData('announcements', (old) =>
                    old.map(item => item._id === id ? { ...item, ...updateData } : item)
                );
                return { previousAnnouncements };
            },
            onError: (err, variables, context) => {
                if (context?.previousAnnouncements) {
                    queryClient.setQueryData('announcements', context.previousAnnouncements);
                }
            },
            onSettled: () => {
                queryClient.invalidateQueries('announcements');
            },
        }
    );
};

export const useDeleteAnnouncement = () => {
    const queryClient = useQueryClient();
    return useMutation(announcementAPI.deleteAnnouncement, {
        onSuccess: () => {
            queryClient.invalidateQueries('announcements');
        },
    });
};

export const useActiveAnnouncements = (location = 'global_banner') => {
    return useQuery(['activeAnnouncements', location], () => announcementAPI.getActiveAnnouncements(location), {
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: true,
        onSuccess: (data) => {
            logger.info('[useActiveAnnouncements] Successfully fetched active announcements.', {
                count: data?.length || 0,
                location,
                data: data,
            });
        },
        onError: (error) => {
            logger.error('[useActiveAnnouncements] Failed to fetch active announcements.', {
                location,
                error: error.message,
            });
        }
    });
};