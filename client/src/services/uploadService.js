import api from './api';

export const uploadFile = async (file, onUploadProgress, params = {}) => {
  const formData = new FormData();
  formData.append('file', file);

  const config = {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress,
  };

  const queryString = new URLSearchParams(params).toString();
  const url = `/api/upload${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await api.post(url, formData, config);
    return response.data;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error.response ? error.response.data : new Error('File upload failed');
  }
};