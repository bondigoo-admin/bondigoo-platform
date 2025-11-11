import { useQuery, useMutation, useQueryClient } from 'react-query';
import api from '../services/api';
import * as adminAPI from '../services/adminAPI'; 
import { logger } from '../utils/logger';

export const useAdminOverview = (dateRange) => {
  return useQuery(['adminOverview', dateRange], async () => {
    const { data } = await api.get('/api/admin/dashboard/overview', {
      params: { ...dateRange },
    });
    return data.data;
  });
};

export const useAdminUsers = (filters, options = {}) => {
  return useQuery(
    ['adminUsers', filters],
    async () => {
      const { data } = await api.get('/api/admin/users', {
        params: filters,
      });
      return data;
    },
    { 
      keepPreviousData: true,
      ...options 
    }
  );
};

export const useAdminUserDetail = (userId) => {
  return useQuery(['adminUserDetail', userId], async () => {
    const { data } = await api.get(`/api/admin/users/${userId}`);
    return data;
  }, {
    enabled: !!userId,
  });
};

export const useAdminUserRoles = () => {
  return useQuery('adminUserRoles', async () => {
    const { data } = await api.get('/api/admin/meta/user-roles');
    return data.map(role => ({ value: role, label: role.charAt(0).toUpperCase() + role.slice(1) }));
  }, {
    staleTime: Infinity, // Roles rarely change.
  });
};

export const useUpdateUserByAdmin = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ userId, updateData }) => api.patch(`/api/admin/users/${userId}`, { updateData }),
        {
            onSuccess: (data, variables) => {
                queryClient.invalidateQueries('adminUsers');
                queryClient.invalidateQueries(['adminUserDetail', variables.userId]);
            },
        }
    );
};

export const useAdminUniqueUserCountries = () => {
  return useQuery('adminUniqueUserCountries', async () => {
    const { data } = await api.get('/api/admin/users/unique-countries');
    return data;
  }, {
    staleTime: 1000 * 60 * 5,
  });
};

export const useImpersonateUser = () => {
    return useMutation(
        ({ userId, reason }) => api.post(`/api/admin/users/${userId}/impersonate`, { reason })
    );
};

export const useAdminLeads = (params) => {
    return useQuery(['adminLeads', params], () => adminAPI.getAdminLeads(params), {
        keepPreviousData: true,
    });
};

export const useAdminPayments = (params) => {
  return useQuery(['adminPaymentsLedger', params], () => adminAPI.getPaymentsLedger(params), { 
    keepPreviousData: true 
  });
};

export const useAdminRefundPayment = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ paymentId, amount, reason, policyType }) => adminAPI.executeAdminRefund(paymentId, { amount, reason, policyType }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('adminPaymentsLedger');
        queryClient.invalidateQueries('adminDisputes');
        queryClient.invalidateQueries('adminOverview');
      },
      onError: (error) => {
          console.error("Refund mutation failed:", error);
      }
    }
  );
};

export const useAdminUpdatePayoutStatus = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ paymentId, action, reason }) => adminAPI.updatePayoutStatus(paymentId, { action, reason }),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('adminPayouts');
            },
        }
    );
};

export const useAdminPayouts = (params) => {
  return useQuery(['adminPayouts', params], () => adminAPI.getPayouts(params), { 
    keepPreviousData: true,
  });
};

export const useAdminDisputes = (params) => {
  return useQuery(['adminDisputes', params], () => adminAPI.getAdminDisputes(params), {
    keepPreviousData: true,
  });
};

export const useAdminDisputeDetail = (ticketId) => {
    return useQuery(['adminDisputeDetail', ticketId], () => adminAPI.getDisputeDetail(ticketId), {
        enabled: !!ticketId, // Only run the query if a ticketId is provided
    });
};

export const useAdminDiscounts = (params) => {
    return useQuery(['adminDiscounts', params], () => adminAPI.getAdminDiscounts(params), {
        keepPreviousData: true,
    });
};

export const useCreateDiscount = () => {
    const queryClient = useQueryClient();
    return useMutation(adminAPI.createDiscountByAdmin, {
        onSuccess: () => {
            queryClient.invalidateQueries('adminDiscounts');
        }
    });
};

export const useUpdateDiscount = () => {
    const queryClient = useQueryClient();
    return useMutation(({ discountId, updates }) => adminAPI.updateDiscountByAdmin(discountId, updates), {
        onSuccess: () => {
            queryClient.invalidateQueries('adminDiscounts');
        }
    });
};

export const useDeleteDiscount = () => {
    const queryClient = useQueryClient();
    return useMutation(adminAPI.deleteDiscountByAdmin, {
        onSuccess: () => {
            queryClient.invalidateQueries('adminDiscounts');
        }
    });
};

export const useUpdateAdminDashboardPreferences = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ preferences }) => adminAPI.updateAdminDashboardPreferences(preferences),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('adminOverview');
            },
        }
    );
};

export const useRequestPasswordResetByAdmin = () => {
    return useMutation(
        ({ userId, reason }) => api.post(`/api/admin/users/${userId}/reset-password`, { reason })
    );
};

export const useVerifyUserEmailByAdmin = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ userId, reason }) => api.post(`/api/admin/users/${userId}/verify-email`, { reason }),
        {
            onSuccess: (data, variables) => {
                queryClient.invalidateQueries('adminUsers');
                queryClient.invalidateQueries(['adminUserDetail', variables.userId]);
            },
        }
    );
};

export const useAdminResolveDispute = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ ticketId, ...payload }) => adminAPI.resolveDispute(ticketId, payload),
        {
            onSuccess: (data, variables) => {
                queryClient.setQueryData(['adminDisputeDetail', variables.ticketId], data.data);
                queryClient.invalidateQueries('adminDisputes');
                queryClient.invalidateQueries('adminOverview');
            }
        }
    );
};

export const useAdminVatReport = (filters) => {
  return useQuery(['adminVatReport', filters], () => adminAPI.getVatReport(filters), {
    enabled: !!filters.startDate && !!filters.endDate,
    keepPreviousData: true,
  });
};

export const useAdminB2bDocumentUrl = () => {
    return useMutation(adminAPI.getAdminB2bDocumentUrl);
};

export const useAdminDownloadSettlementAdvice = () => {
    return useMutation(adminAPI.downloadSettlementAdvice);
};

export const useAdminVatThresholds = () => {
    return useQuery('adminVatThresholds', adminAPI.getVatThresholdSummary, {
        staleTime: 1000 * 60 * 60, // Stale for 1 hour
    });
};

export const useDeleteUserByAdmin = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ userId, confirmationName }) => adminAPI.deleteUserByAdmin(userId, confirmationName),
        {
            onSuccess: (data, variables) => {
                queryClient.invalidateQueries('adminUsers');
                queryClient.removeQueries(['adminUserDetail', variables.userId]);
            },
        }
    );
};

export const useUpdateCoachByAdmin = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ userId, updateData }) => adminAPI.updateCoachByAdmin(userId, updateData),
        {
            onSuccess: (data, variables) => {
                queryClient.invalidateQueries('adminUsers');
            },
        }
    );
};

export const useAdminPrograms = (filters) => {
  return useQuery(['adminPrograms', filters], () => adminAPI.getAdminPrograms(filters), {
    keepPreviousData: true,
  });
};

export const useUpdateProgramByAdmin = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ programId, updateData }) => adminAPI.updateProgramByAdmin(programId, updateData),
        {
            onSuccess: (data, variables) => {
                queryClient.invalidateQueries('adminPrograms');
            },
        }
    );
};

export const useAdminModerationQueue = (filters) => {
    return useQuery(['adminModerationQueue', filters], () => adminAPI.getModerationQueue(filters), {
        keepPreviousData: true,
    });
};

export const useResolveReviewFlag = () => {
    const queryClient = useQueryClient();
    return useMutation(adminAPI.resolveReviewFlag, {
        onSuccess: () => {
            queryClient.invalidateQueries('adminModerationQueue');
        },
    });
};

export const useAdminSupportTickets = (filters) => {
    return useQuery(['adminSupportTickets', filters], () => adminAPI.getSupportTickets(filters), {
        keepPreviousData: true,
    });
};

export const useAdminTicketDetails = (ticketId) => {
    return useQuery(['adminTicketDetails', ticketId], () => adminAPI.getTicketDetails(ticketId), {
        enabled: !!ticketId, // Only fetch if ticketId is provided
    });
};

export const useAddSupportMessage = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ ticketId, content }) => adminAPI.addInternalNoteToTicket(ticketId, { content }),
        {
            onSuccess: (newNote, variables) => {
                queryClient.setQueryData(['adminTicketDetails', variables.ticketId], (oldData) => {
                    if (!oldData) return oldData;
                    return {
                        ...oldData,
                        internalNotes: [...(oldData.internalNotes || []), newNote],
                    };
                });
                queryClient.invalidateQueries('adminSupportTickets');
            },
        }
    );
};

export const useUpdateSupportTicket = () => {
    const queryClient = useQueryClient();
    return useMutation(adminAPI.updateTicket, {
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries('adminSupportTickets');
            queryClient.setQueryData(['adminTicketDetails', variables.ticketId], (oldData) => {
                 if (!oldData) return oldData;
                 return { ...oldData, ticket: data };
            });
        },
    });
};

export const useAdminBlockedPairs = (filters) => {
    return useQuery(['adminBlockedPairs', filters], () => adminAPI.getBlockedPairs(filters), {
        keepPreviousData: true,
    });
};

export const useForceUnblockUser = () => {
    const queryClient = useQueryClient();
    return useMutation(adminAPI.forceUnblockUser, {
        onSuccess: () => {
            queryClient.invalidateQueries('adminBlockedPairs');
        },
    });
};

export const useAdminWebhookLogs = (filters) => {
  return useQuery(
    ['adminWebhookLogs', filters],
    () => adminAPI.getWebhookLogs(filters),
    {
      keepPreviousData: true,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );
};

export const useReplayWebhook = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ logId, reason }) => adminAPI.replayWebhook(logId, reason),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('adminWebhookLogs');
      },
    }
  );
};

export const useAdminQueues = () => {
    return useQuery('adminQueues', adminAPI.getAdminQueues);
};

export const useAdminQueueJobs = (queueName, filters) => {
    return useQuery(['adminQueueJobs', queueName, filters], 
        () => adminAPI.getAdminQueueJobs(queueName, filters), 
        {
            enabled: !!queueName,
            keepPreviousData: true,
        }
    );
};

export const useAdminJobDetails = (queueName, jobId) => {
    return useQuery(['adminJobDetails', queueName, jobId],
        () => adminAPI.getAdminJobDetails(queueName, jobId),
        {
            enabled: !!queueName && !!jobId,
        }
    );
};

export const useAdminPerformJobAction = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ queueName, ...payload }) => adminAPI.performAdminJobAction(queueName, payload),
        {
            onSuccess: (data, variables) => {
                queryClient.invalidateQueries(['adminQueueJobs', variables.queueName]);
                queryClient.invalidateQueries('adminQueues'); // Invalidate queues to update counts
            },
        }
    );
};

export const useAdminPerformQueueAction = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ queueName, ...payload }) => adminAPI.performAdminQueueAction(queueName, payload),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('adminQueues');
            }
        }
    );
};

export const useFeatureFlags = () => {
    return useQuery('featureFlags', adminAPI.getFeatureFlags);
};

export const useCreateFeatureFlag = () => {
    const queryClient = useQueryClient();
    return useMutation(adminAPI.createFeatureFlag, {
        onSuccess: () => {
            queryClient.invalidateQueries('featureFlags');
        },
    });
};

export const useUpdateFeatureFlag = () => {
    const queryClient = useQueryClient();
    return useMutation(
        ({ flagId, updateData }) => adminAPI.updateFeatureFlag(flagId, updateData),
        {
            onSuccess: (updatedFlag) => {
                queryClient.setQueryData('featureFlags', (oldData) =>
                    oldData ? oldData.map((flag) => (flag._id === updatedFlag._id ? updatedFlag : flag)) : []
                );
            },
        }
    );
};

export const useDeleteFeatureFlag = () => {
    const queryClient = useQueryClient();
    return useMutation(adminAPI.deleteFeatureFlag, {
        onSuccess: () => {
            queryClient.invalidateQueries('featureFlags');
        },
    });
};

export const useFlushCacheKey = () => {
    return useMutation(adminAPI.flushCacheKey);
};

export const useAdminSystemHealth = () => {
  return useQuery('adminSystemHealth', adminAPI.getSystemHealth, {
    refetchOnWindowFocus: true,
    staleTime: 30000, // Do not refetch automatically for 30 seconds
  });
};

export const useBulkReplayWebhooks = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ logIds, reason }) => adminAPI.bulkReplayWebhooks(logIds, reason),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('adminWebhookLogs');
      },
    }
  );
};

export const useResolveUserFlag = () => {
  const queryClient = useQueryClient();
  return useMutation(adminAPI.resolveUserFlag, {
    onSuccess: () => {
      queryClient.invalidateQueries('adminModerationQueue');
    },
  });
};

export const useModerationActionDetails = (auditId) => {
    return useQuery(
        ['moderationActionDetails', auditId],
        () => adminAPI.getModerationActionDetails(auditId),
        {
            enabled: !!auditId,
        }
    );
};

export const useSubmitAppeal = () => {
    return useMutation(adminAPI.submitSupportTicket);
};

export const useAdminVerificationQueue = (filters) => {
    return useQuery(['adminVerificationQueue', filters], () => adminAPI.getVerificationQueue(filters), {
        keepPreviousData: true,
    });
};

export const useVerificationDocumentUrl = (coachUserId, registryName, enabled) => {
    return useQuery(
        ['verificationDocumentUrl', coachUserId, registryName], 
        () => adminAPI.getVerificationDocumentUrl(coachUserId, registryName), 
        {
            enabled: !!enabled && !!coachUserId && !!registryName,
            staleTime: 1000 * 60 * 55, // Cache for 55 mins (URL expires in 60)
            cacheTime: 1000 * 60 * 60,
        }
    );
};

export const useResolveVerification = () => {
    const queryClient = useQueryClient();
    return useMutation(adminAPI.resolveVerification, {
        onSuccess: () => {
            queryClient.invalidateQueries('adminVerificationQueue');
        },
    });
};

export const useSubmitSupportTicket = () => {
    const queryClient = useQueryClient();
    return useMutation(adminAPI.submitSupportTicket, {
      onSuccess: () => {
        queryClient.invalidateQueries('adminSupportTickets');
      },
    });
};

export const useUpdateFeeOverride = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ userId, overrideData }) => adminAPI.updateFeeOverride(userId, overrideData),
    {
      onSuccess: (data, { userId }) => {
        queryClient.invalidateQueries(['adminUserDetail', userId]);
        queryClient.invalidateQueries('adminUsers');
      },
    }
  );
};