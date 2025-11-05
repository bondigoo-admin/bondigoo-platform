import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from 'react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import * as programAPI from '../services/programAPI';
import * as coachAPI from '../services/coachAPI';
import * as reviewAPI from '../services/ReviewAPI';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

export const programKeys = {
  all: ['programs'],
  lists: () => [...programKeys.all, 'list'],
  list: (filters) => [...programKeys.lists(), filters],
  details: () => [...programKeys.all, 'detail'],
  detail: (id) => [...programKeys.details(), id],
  content: (id) => [...programKeys.details(), id, 'content'],
  coach: (coachId) => [...programKeys.all, 'coach', coachId],
  enrollments: (userId) => [...programKeys.all, 'enrollments', userId],
  enrollment: (enrollmentId) => [...programKeys.enrollments(), 'detail', enrollmentId],
  categories: () => [...programKeys.all, 'categories'],
  comments: (lessonId) => [...programKeys.all, 'comments', lessonId],
  reviews: (programId) => [...programKeys.all, 'reviews', programId],
  submissions: (programId) => [...programKeys.all, 'submissions', programId],
  allSubmissions: () => [...programKeys.all, 'submissions', 'allCoach'],
  allQA: () => [...programKeys.all, 'qa', 'allCoach'],
  allParticipants: () => [...programKeys.all, 'participants', 'allCoach'],
};

export const usePrograms = (filters) => {
  const queryFunction = ({ pageParam = 1 }) => {
    const { limit, ...restOfFilters } = filters || {};
    const paramsForAPI = {
      page: pageParam,
      limit: limit,
      filters: restOfFilters,
    };
    return programAPI.getPublishedPrograms(paramsForAPI);
  };

  return useInfiniteQuery(
    programKeys.list(filters),
    queryFunction,
    {
      getNextPageParam: (lastPage) => {
        return lastPage.currentPage < lastPage.totalPages ? lastPage.currentPage + 1 : undefined;
      },
    }
  );
};

export const useProgramLandingPage = (programId) => {
  return useQuery(
    programKeys.detail(programId),
    () => programAPI.getProgramLandingPage(programId),
    {
      enabled: !!programId,
    }
  );
};

export const useProgramContent = (programId, isEnrolled) => {
  return useQuery(
    programKeys.content(programId),
    () => programAPI.getProgramContent(programId),
    {
      enabled: !!programId && !!isEnrolled,
    }
  );
};

export const useUserEnrollments = (userId) => {
  return useQuery(
    programKeys.enrollments(userId),
    () => programAPI.getUserEnrollments(),
    {
      enabled: !!userId,
    }
  );
};

export const useCoachPrograms = (coachId, params = {}) => {
  return useQuery(
    [...programKeys.coach(coachId), params],
    () => programAPI.getCoachPrograms(params),
    {
      enabled: !!coachId,
    }
  );
};

export const useCreateProgram = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['programs']);
  return useMutation(programAPI.createProgram, {
    onSuccess: () => {
      ////toast.success(t('program_created_toast'));
      queryClient.invalidateQueries(programKeys.coach());
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('create_program_error'));
    },
  });
};

export const useUpdateProgram = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation(['programs']);
    return useMutation(
      ({ programId, updateData }) => programAPI.updateProgramDetails(programId, updateData), 
      {
        onSuccess: (updatedProgramData) => {
            queryClient.invalidateQueries(programKeys.coach(updatedProgramData.coach));
            queryClient.invalidateQueries(programKeys.detail(updatedProgramData._id));
        },
        onError: (error) => {
            logger.error('[useUpdateProgram] X. onError: Mutation failed.', { error: error.response?.data });
        },
    });
};

export const useEnrollInProgram = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['programs']);
  return useMutation(
    // This now returns response.data directly, simplifying the component logic
    ({ programId, payload }) => programAPI.enrollInProgram(programId, payload),
    {
      // The onSuccess in the hook is for global side-effects, like cache invalidation.
      // The data will be passed to the component's onSuccess handler automatically.
      onSuccess: (response) => {
        // We still get the full axios response here
        queryClient.invalidateQueries(programKeys.enrollments());
      },
      onError: (error) => {
        // Added logging for better error tracking in the hook itself
        logger.error('[useEnrollInProgram] Mutation failed at the hook level.', { 
            errorMessage: error.message, 
            response: error.response?.data 
        });
        // The toast is kept here as a fallback, but component-level error handling is often preferred.
        toast.error(error.response?.data?.message || t('enrollment_failed_error'));
      },
    }
  );
};

export const useUpdateUserProgress = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['programs']);
  return useMutation(
    ({ enrollmentId, lessonId }) => programAPI.updateUserProgress(enrollmentId, { lessonId }),
    {
      onMutate: async ({ enrollmentId, lessonId }) => {
        // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
        await queryClient.cancelQueries(programKeys.enrollments());
        await queryClient.cancelQueries(programKeys.content());

        // Snapshot the previous value
        const previousEnrollments = queryClient.getQueryData(programKeys.enrollments());

        // Optimistically update to the new value
        if (previousEnrollments) {
          queryClient.setQueryData(programKeys.enrollments(), (old) =>
            old.map(e => 
              e._id === enrollmentId
                ? {
                    ...e,
                    progress: {
                      ...e.progress,
                      completedLessons: [...new Set([...e.progress.completedLessons, lessonId])],
                      lastViewedLesson: lessonId
                    },
                  }
                : e
            )
          );
        }
        
        return { previousEnrollments };
      },
      // If the mutation fails, use the context returned from onMutate to roll back
      onError: (err, variables, context) => {
        if (context?.previousEnrollments) {
          queryClient.setQueryData(programKeys.enrollments(), context.previousEnrollments);
        }
        toast.error(t('update_progress_error'));
      },
      // Always refetch after error or success:
      onSettled: (data, error, variables) => {
        queryClient.invalidateQueries(programKeys.enrollments(variables.userId));
        if (data?.program) {
          queryClient.invalidateQueries(programKeys.content(data.program));
        }
      },
    }
  );
};

export const useProgramCategories = () => {
    return useQuery(programKeys.categories(), programAPI.getProgramCategories, {
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
};

export const useAddModuleToProgram = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation(['programs']);
    return useMutation(
        ({ programId, moduleData }) => programAPI.addModuleToProgram(programId, moduleData),
        {
            onSuccess: (data) => {
                //toast.success(t('module_added_success'));
                queryClient.invalidateQueries(programKeys.detail(data._id));
            },
            onError: (error) => {
                toast.error(error.response?.data?.message || t('add_module_error'));
            },
        }
    );
};

export const useUpdateModule = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation(['programs']);
    return useMutation(
        ({ moduleId, updateData }) => programAPI.updateModule(moduleId, updateData),
        {
            onSuccess: (data) => {
                //toast.success(t('module_updated_success'));
                queryClient.invalidateQueries(programKeys.detail(data.program));
            },
            onError: (error) => {
                toast.error(error.response?.data?.message || t('update_module_error'));
            },
        }
    );
};

export const useDeleteModule = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation(['programs']);
    return useMutation(programAPI.deleteModule, {
        onSuccess: (data, moduleId) => {
            //toast.success(t('module_deleted_success'));
            // We don't know the programId here, so we invalidate all details. A bit broad but safe.
            queryClient.invalidateQueries(programKeys.details());
        },
        onError: (error) => {
            toast.error(error.response?.data?.message || t('delete_module_error'));
        },
    });
};

export const useAddLessonToModule = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation(['programs']);
    return useMutation(
        ({ moduleId, lessonData }) => programAPI.addLessonToModule(moduleId, lessonData),
        {
            onSuccess: (data) => {
                //toast.success(t('lesson_added_success'));
                queryClient.invalidateQueries(programKeys.detail(data._id));
            },
            onError: (error) => {
                toast.error(error.response?.data?.message || t('add_lesson_error'));
            },
        }
    );
};

export const useUpdateLesson = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation(['programs']);
    return useMutation(
        ({ lessonId, updateData }) => programAPI.updateLesson(lessonId, updateData),
        {
            onSuccess: (data) => {
                //toast.success(t('lesson_updated_success'));
                queryClient.invalidateQueries(programKeys.detail(data.program));
            },
            onError: (error) => {
                toast.error(error.response?.data?.message || t('update_lesson_error'));
            },
        }
    );
};

export const useDeleteLesson = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation(['programs']);
    return useMutation(programAPI.deleteLesson, {
        onSuccess: () => {
            //toast.success(t('lesson_deleted_success'));
            queryClient.invalidateQueries(programKeys.details());
        },
        onError: (error) => {
            toast.error(error.response?.data?.message || t('delete_lesson_error'));
        },
    });
};

export const useDeleteProgram = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['programs']);
  const { user } = useAuth();

  return useMutation(programAPI.deleteProgram, {
    onSuccess: (data, programId) => {
      toast.success(t('program_deleted_toast'));

      const coachId = user?._id;
      if (!coachId) return;

      const queryKey = ['programs', 'coach', coachId];
      
      queryClient.setQueriesData(queryKey, (oldData) => {
        if (!oldData || !Array.isArray(oldData)) return oldData;
        return oldData.filter(program => program._id !== programId);
      });

      queryClient.invalidateQueries(queryKey);
      queryClient.removeQueries(programKeys.detail(programId));
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('delete_program_error'));
    },
  });
};

export const useLessonComments = (lessonId) => {
  return useInfiniteQuery(
    programKeys.comments(lessonId),
    ({ pageParam = 1 }) => programAPI.getLessonComments(lessonId, { page: pageParam }),
    {
      enabled: !!lessonId,
      getNextPageParam: (lastPage) => lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    }
  );
};

export const usePostComment = (lessonId) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['programs']);
  return useMutation(
    (commentData) => programAPI.postLessonComment(lessonId, commentData),
    {
      onSuccess: (newlyPostedComment) => {
        //toast.success(t('comment_posted_success'));
        const queryKey = programKeys.comments(lessonId);
        
        queryClient.setQueryData(queryKey, (oldData) => {
          if (!oldData) {
            return {
              pages: [{ docs: [newlyPostedComment], totalDocs: 1, limit: 10, page: 1, totalPages: 1, hasNextPage: false }],
              pageParams: [1],
            };
          }

          const newPages = JSON.parse(JSON.stringify(oldData.pages));

          if (newlyPostedComment.parentComment) {
            let parentFound = false;

            const findAndUpdateParent = (comments) => {
              if (!comments) return;
              for (let i = 0; i < comments.length; i++) {
                const currentComment = comments[i];
                if (currentComment._id === newlyPostedComment.parentComment) {
                  if (!currentComment.replies) {
                    currentComment.replies = [];
                  }
                  currentComment.replies.push(newlyPostedComment);
                  parentFound = true;
                  return;
                }
                if (currentComment.replies) {
                  findAndUpdateParent(currentComment.replies);
                  if (parentFound) return;
                }
              }
            };

            for (const page of newPages) {
              findAndUpdateParent(page.docs);
              if (parentFound) break;
            }

          } else {
            if (newPages[0]) {
              newPages[0].docs.unshift(newlyPostedComment);
            } else {
              newPages[0] = { docs: [newlyPostedComment], totalDocs: 1, limit: 10, page: 1, totalPages: 1, hasNextPage: false };
            }
          }

          return {
            ...oldData,
            pages: newPages,
          };
        });
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || t('post_comment_error'));
      },
    }
  );
};

export const useUpdateComment = (lessonId) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['programs']);
  return useMutation(
    ({ commentId, content }) => programAPI.updateComment(commentId, content),
    {
      onSuccess: () => {
        //toast.success(t('comment_updated_success'));
        queryClient.invalidateQueries(programKeys.comments(lessonId));
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || t('update_comment_error'));
      },
    }
  );
};

export const useDeleteComment = (lessonId) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['programs']);
  return useMutation(
    (commentId) => programAPI.deleteComment(commentId),
    {
      onSuccess: () => {
        //toast.success(t('comment_deleted_success'));
        queryClient.invalidateQueries(programKeys.comments(lessonId));
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || t('delete_comment_error'));
      },
    }
  );
};

export const useProgramReviews = (programId) => {
  return useQuery(
    programKeys.reviews(programId),
    () => reviewAPI.getProgramReviews(programId),
    {
      enabled: !!programId,
    }
  );
};

export const useSubmitProgramReview = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useTranslation(['programs']);
  return useMutation(reviewAPI.submitProgramReview, {
    onSuccess: (data, variables) => {
      //toast.success(t('review_submitted_successfully'));
      queryClient.invalidateQueries(programKeys.reviews(variables.programId));
      queryClient.invalidateQueries(programKeys.detail(variables.programId));
      if (data.enrollment) {
        queryClient.setQueryData(programKeys.enrollments(user?._id), (old) => {
            return old?.map(e => e._id === data.enrollment._id ? data.enrollment : e) ?? [];
        });
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('submit_review_error'));
    },
  });
};

export const useUpdatePresentationProgress = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation(programAPI.updatePresentationProgress, {
      onSuccess: (data, variables) => {
          queryClient.invalidateQueries(programKeys.enrollments(user?._id));
      },
      onError: (error) => {
          console.error("Failed to update presentation progress", error);
      }
  });
};

export const useSubmitLesson = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useTranslation(['programs']);

  return useMutation(programAPI.submitLesson, {
    onSuccess: (data) => {
      if (data.enrollment) {
        queryClient.setQueryData(programKeys.enrollments(user?._id), (old) => {
          return old?.map(e => e._id === data.enrollment._id ? data.enrollment : e) ?? [];
        });
      } else {
        queryClient.invalidateQueries(programKeys.enrollments(user?._id));
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('submit_lesson_error'));
    },
  });
};

export const useProgramSubmissions = (programId) => {
  return useQuery(
    programKeys.submissions(programId),
    () => programAPI.getProgramSubmissions(programId),
    {
      enabled: !!programId,
    }
  );
};

export const useAllCoachSubmissions = (options = {}) => {
  return useQuery(
    programKeys.allSubmissions(),
    coachAPI.getAllSubmissions,
    options
  );
};

export const useAllCoachQA = (options = {}) => {
  return useQuery(
    programKeys.allQA(),
    coachAPI.getAllQA,
    options
  );
};

export const useAllCoachParticipants = (options = {}) => {
  return useQuery(
    programKeys.allParticipants(),
    coachAPI.getAllParticipants,
    options
  );
};