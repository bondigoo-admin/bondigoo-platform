import { toast } from 'react-hot-toast';

export const handleError = (error, t, customMessage) => {
  console.error('Error:', error);

  let errorMessage = customMessage || t('common:generalError');

  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    if (error.response.data && error.response.data.message) {
      errorMessage = error.response.data.message;
    } else if (error.response.status === 401) {
      errorMessage = t('common:unauthorizedError');
    } else if (error.response.status === 403) {
      errorMessage = t('common:forbiddenError');
    } else if (error.response.status === 404) {
      errorMessage = t('common:notFoundError');
    }
  } else if (error.request) {
    // The request was made but no response was received
    errorMessage = t('common:networkError');
  }

  toast.error(errorMessage);
};