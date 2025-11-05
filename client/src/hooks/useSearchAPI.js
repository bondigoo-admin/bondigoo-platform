import { useQuery } from 'react-query';
import axios from 'axios';
import { useDebounce } from 'use-debounce';
import { logger } from '../utils/logger';

export const useSearchAPI = ({ query, scope, limit, page, types }) => {
  const [debouncedQuery] = useDebounce(query, 300);

  const params = new URLSearchParams({
    scope: scope || 'quick',
  });

  if (debouncedQuery) {
    params.set('q', debouncedQuery);
  }
  if (limit) {
    params.set('limit', limit);
  }
  if (page) {
    params.set('page', page);
  }
  if (types) {
    params.set('types', types);
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['globalSearch', debouncedQuery, scope, limit, page, types],
    queryFn: async () => {
      const { data } = await axios.get(`/api/search?${params.toString()}`);
      return data;
    },
    enabled: (!!debouncedQuery && debouncedQuery.length > 1) || (!debouncedQuery && scope === 'quick'),
  });

  return { data, isLoading, isError };
};

export const searchCoaches = async (queryParams) => {
  try {
    logger.info('[searchAPI] Searching coaches with params:', queryParams.toString());
    const { data } = await axios.get(`/api/search/coaches?${queryParams.toString()}`);
    return data;
  } catch (error) {
    logger.error('[searchAPI] Failed to search coaches:', { 
        message: error.message,
        response: error.response?.data
    });
    throw error;
  }
};