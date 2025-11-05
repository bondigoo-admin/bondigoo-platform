import { useState, useCallback } from 'react';

const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT_SEARCHES = 5;

export const useRecentSearches = () => {
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const items = window.localStorage.getItem(RECENT_SEARCHES_KEY);
      return items ? JSON.parse(items) : [];
    } catch (error) {
      console.error('Error reading recent searches from localStorage', error);
      return [];
    }
  });

  const addRecentSearch = useCallback((searchTerm) => {
    if (!searchTerm) return;
    setRecentSearches(prevSearches => {
      const newSearch = {
        id: new Date().getTime(),
        term: searchTerm,
      };
      const updatedSearches = [newSearch, ...prevSearches.filter(s => s.term !== searchTerm)];
      const limitedSearches = updatedSearches.slice(0, MAX_RECENT_SEARCHES);

      try {
        window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(limitedSearches));
      } catch (error) {
        console.error('Error saving recent searches to localStorage', error);
      }
      return limitedSearches;
    });
  }, []);

  return { recentSearches, addRecentSearch };
};