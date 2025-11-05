import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import debounce from 'lodash/debounce';
import { X, Search, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { getProgramAuthors } from '../../services/programAPI';
import { toast } from 'react-hot-toast';
import isEqual from 'lodash/isEqual';
import { Input } from '../ui/input.tsx';
import { Badge } from '../ui/badge.tsx';
import { logger } from '../../utils/logger';

const AuthorFilter = ({
  selectedItems = [],
  onUpdate,
  placeholder,
}) => {
  const { t } = useTranslation(['programs', 'common']);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const fetchAndSetResults = useCallback(async (term) => {
    setIsLoading(true);
    try {
      const results = await getProgramAuthors(term);
      setSearchResults(results);
    } catch (error) {
      toast.error(t('common:errorSearchingItems'));
      logger.error("Error fetching program authors:", error);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const debouncedSearch = useCallback(debounce(fetchAndSetResults, 300), [fetchAndSetResults]);

  useEffect(() => {
    debouncedSearch(searchTerm);
    return () => debouncedSearch.cancel();
  }, [searchTerm, debouncedSearch]);
  
  const toggleDropdown = () => {
    setIsDropdownOpen(prev => {
        if (!prev && !searchTerm && searchResults.length === 0) {
            fetchAndSetResults('');
        }
        return !prev;
    });
  };

  const handleSelect = useCallback((item) => {
    if (!selectedItems.some(i => i._id === item._id)) {
        const newItems = [...selectedItems, item];
        onUpdate(newItems);
    }
    setSearchTerm('');
    setIsDropdownOpen(false);
  }, [onUpdate, selectedItems]);

  const handleRemove = useCallback((itemToRemove) => {
    const newItems = selectedItems.filter(i => i._id !== itemToRemove._id);
    onUpdate(newItems);
  }, [onUpdate, selectedItems]);

  const filteredResults = searchResults.filter(
    item => !selectedItems.some(selectedItem => selectedItem._id === item._id)
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDisplayName = (item) => item.name || item._id;

  return (
    <div className="relative w-full" ref={dropdownRef}>
        <div className="relative">
            <Input
              type="text"
              value={searchTerm}
              variant="compact"
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => {
                setIsDropdownOpen(true);
                if (!searchTerm && searchResults.length === 0) {
                    fetchAndSetResults('');
                }
              }}
              placeholder={placeholder || t('search_authors')}
              className="w-full pr-10 py-2.5 text-sm rounded-lg border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 focus:border-indigo-500 outline-none transition-all focus-visible:ring-0 focus-visible:ring-offset-0 text-gray-900 dark:text-gray-200 placeholder:text-gray-500 dark:placeholder:text-gray-400"
              aria-label={placeholder || t('search_authors')}
            />
            <button
                type="button"
                onClick={toggleDropdown}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 dark:text-gray-400 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                aria-label="Toggle dropdown"
            >
                {isDropdownOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
        </div>

           {isDropdownOpen && (
        <div className="w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto animate-fadeIn">
          {isLoading ? (
            <div className="p-4 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 mr-2 animate-spin"/>
                {t('common:loading')}
            </div>
          ) : filteredResults.length > 0 ? (
           <ul className="py-2">
              {filteredResults.map((item) => (
                <li
                  key={item._id}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
                  className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/50 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                >
                  {getDisplayName(item)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">{t('common:noResults')}</div>
          )}
        </div>
      )}

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {selectedItems.map((item) => (
            <Badge variant="secondary" key={item._id} className="flex items-center gap-1.5 py-1 px-3 text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 animate-tagIn">
              {getDisplayName(item)}
              <button
                type="button"
                onClick={() => handleRemove(item)}
                className="rounded-full flex items-center justify-center w-4 h-4 text-indigo-500 hover:bg-indigo-200 dark:text-indigo-400 dark:hover:bg-indigo-800 focus:outline-none transition-all"
                aria-label={t('common:remove')}
              >
                <X size={12} />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

export default memo(AuthorFilter, (prev, next) => isEqual(prev.selectedItems, next.selectedItems));