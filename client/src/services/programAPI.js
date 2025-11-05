import api from './api';

export const createProgram = async (programData) => {
  const response = await api.post('/api/programs', programData, {
    headers: {
      'Content-Type': null,
    },
  });
  return response.data;
};

export const updateProgramDetails = async (programId, updateData) => {
  const response = await api.put(`/api/programs/${programId}`, updateData, {
    headers: {
      'Content-Type': null,
    },
  });
  return response.data;
};

export const addModuleToProgram = async (programId, moduleData) => {
  const response = await api.post(`/api/programs/${programId}/modules`, moduleData);
  return response.data;
};

export const updateModule = async (moduleId, updateData) => {
  const response = await api.put(`/api/programs/modules/${moduleId}`, updateData);
  return response.data;
};

export const addLessonToModule = async (moduleId, lessonData) => {
  const response = await api.post(`/api/programs/modules/${moduleId}/lessons`, lessonData);
  return response.data;
};

export const updateLesson = async (lessonId, updateData) => {
  const response = await api.put(`/api/programs/lessons/${lessonId}`, updateData);
  return response.data;
};

export const getCoachPrograms = async (params = {}) => {
  const response = await api.get('/api/programs/coach/my-programs', { params });
  return response.data;
};

export const getProgramEnrollments = async (programId) => {
    const response = await api.get(`/api/programs/${programId}/enrollments`);
    return response.data;
};

export const getProgramQandA = async (programId) => {
    const response = await api.get(`/api/programs/${programId}/qa`);
    return response.data;
};

export const getPublishedPrograms = async ({ page = 1, limit = 12, filters = {} }) => {
  const params = {
    page,
    limit,
    filters: JSON.stringify(filters)
  };
  const response = await api.get('/api/programs', { params });
  return response.data;
};

export const getProgramLandingPage = async (programId) => {
  const response = await api.get(`/api/programs/${programId}`);
  return response.data;
};

export const getProgramContent = async (programId) => {
  const response = await api.get(`/api/programs/${programId}/content`);
  return response.data;
};

export const enrollInProgram = async (programId, payload) => {
  const response = await api.post(`/api/programs/${programId}/enroll`, payload);
  return response.data;
};

export const getUserEnrollments = async () => {
  const response = await api.get('/api/programs/enrollments/my-programs');
  return response.data;
};

export const updateUserProgress = async (enrollmentId, { lessonId, fileId }) => {
  const response = await api.post(`/api/programs/enrollments/${enrollmentId}/progress`, { lessonId, fileId });
  return response.data;
};

export const getLessonComments = async (lessonId, { page = 1 } = {}) => {
  const response = await api.get(`/api/programs/lessons/${lessonId}/comments`, { params: { page } });
  return response.data;
};

export const postLessonComment = async (lessonId, commentData) => {
  const response = await api.post(`/api/programs/lessons/${lessonId}/comments`, commentData);
  return response.data;
};

export const getProgramCategories = async (query = '', language = 'en') => {
  const response = await api.get('/api/programs/categories', {
    params: { query, language }
  });
  return response.data;
};

export const deleteModule = async (moduleId) => {
    const response = await api.delete(`/api/programs/modules/${moduleId}`);
    return response.data;
};

export const deleteLesson = async (lessonId) => {
    const response = await api.delete(`/api/programs/lessons/${lessonId}`);
    return response.data;
};

export const deleteProgram = async (programId) => {
    const response = await api.delete(`/api/programs/${programId}`);
    return response.data;
};

export const updateComment = async (commentId, content) => {
  const response = await api.put(`/api/programs/comments/${commentId}`, { content });
  return response.data;
};

export const deleteComment = async (commentId) => {
  const response = await api.delete(`/api/programs/comments/${commentId}`);
  return response.data;
};

export const submitLesson = async ({ enrollmentId, lessonId, submissionData, onUploadProgress }) => {
  const response = await api.post(
    `/api/programs/enrollments/${enrollmentId}/lessons/${lessonId}/submit`,
    submissionData,
    {
      onUploadProgress,
      headers: {
        'Content-Type': submissionData instanceof FormData ? null : 'application/json',
      },
    }
  );
  return response.data;
};

export const fetchAssignmentSubmission = async (lessonId) => {
  const response = await api.get(`/api/programs/lessons/${lessonId}/submission`);
  return response.data;
};

export const deleteAssignmentSubmission = async (lessonId) => {
  const response = await api.delete(`/api/programs/lessons/${lessonId}/submission`);
  return response.data;
};

export const deleteAssignmentFile = async (lessonId, publicId) => {
  const response = await api.delete(`/api/programs/lessons/${lessonId}/submission/file/${publicId}`);
  return response.data;
};

export const savePresentationNote = async ({ enrollmentId, lessonId, slideId, note }) => {
    const endpoint = `/api/programs/enrollments/${enrollmentId}/lessons/${lessonId}/notes`;
    const payload = { slideId, note };
    const response = await api.post(endpoint, payload);
    return response.data;
};

export const updatePresentationProgress = async ({ enrollmentId, lessonId, lastViewedSlideIndex }) => {
    const endpoint = `/api/programs/enrollments/${enrollmentId}/lessons/${lessonId}/presentation-progress`;
    const payload = { lastViewedSlideIndex };
    const response = await api.post(endpoint, payload);
    return response.data;
};

export const getProgramLearningOutcomes = async (query = '', language = 'en') => {
  const response = await api.get('/api/programs/learning-outcomes', {
    params: { query, language }
  });
  return response.data;
};

export const getProgramAuthors = async (query = '') => {
  const response = await api.get('/api/programs/authors', {
    params: { query }
  });
  return response.data;
};

export const getUploadSignature = async (payload) => {
  const response = await api.post('/api/programs/upload-signature', payload);
  return response.data;
};

export const getProgramSubmissions = async (programId) => {
  const { data } = await api.get(`/api/programs/${programId}/submissions`);
  return data;
};