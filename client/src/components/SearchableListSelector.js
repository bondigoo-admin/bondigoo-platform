import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import debounce from 'lodash/debounce';
import { X, Search, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { searchListItems } from '../services/coachAPI';
import { toast } from 'react-hot-toast';
import isEqual from 'lodash/isEqual';
import { logger } from '../utils/logger';
import { Input } from './ui/input.tsx';
import { Badge } from './ui/badge.tsx';

const SearchableListSelector = ({
  listType,
  selectedItems = [],
  onUpdate,
  isFilter = false,
  placeholder,
  showLanguageLevels = true,
  isEditable = true,
  availableItems,
  isLoading: isLoadingProp,
}) => {
  const { t, i18n } = useTranslation(['common', 'coachprofile', 'coachList']);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [allItems, setAllItems] = useState([]);
  const [error, setError] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  const hasFacets = availableItems !== undefined;

  const fetchAllItems = useCallback(async () => {
    if (!isEditable || hasFacets) return;
    setInternalLoading(true);
    setError(null);
    try {
      const results = await searchListItems(listType, '', i18n.language);
      setAllItems(results);
    } catch (err)
 {
      setError(err.message || t('common:errorFetchingItems'));
      toast.error(err.message || t('common:errorFetchingItems'));
    } finally {
      setInternalLoading(false);
    }
  }, [listType, i18n.language, t, isEditable, hasFacets]);

  useEffect(() => {
    if (hasFacets) {
      setAllItems(availableItems);
    } else {
      fetchAllItems();
    }
  }, [availableItems, hasFacets, fetchAllItems]);

  useEffect(() => {
    if (!isEditable || allItems.length === 0 || !selectedItems) {
        return;
    }

    const allItemsMap = new Map(allItems.map(item => [item._id, item]));

    const processedItems = selectedItems
      .map(item => {
        if (!item) return null;

        const id = typeof item === 'string' ? item : item._id;
        const freshData = allItemsMap.get(id);

        if (!freshData) {
          logger.warn(`[SearchableListSelector] Selected item with id ${id} for listType "${listType}" not found in master list. It will be removed.`);
          return null;
        }
        
        if (listType === 'languages' && typeof item === 'object' && item.strength) {
          return { ...freshData, strength: item.strength };
        }
        
        return freshData;
      })
      .filter(Boolean);

    const originalValidItems = selectedItems.filter(i => i && allItemsMap.has(typeof i === 'string' ? i : i._id));
    if (!isEqual(processedItems, originalValidItems)) {
        logger.info(`[SearchableListSelector] Syncing selected items for list "${listType}"`, { from: originalValidItems, to: processedItems });
        onUpdate(processedItems);
    }
  }, [allItems, selectedItems, onUpdate, listType, isEditable]);
  
  const toggleDropdown = () => {
    setIsDropdownOpen(prev => {
        if (!prev && allItems.length === 0 && !searchTerm && !hasFacets) {
            fetchAllItems();
        }
        return !prev;
    });
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    if (isEditable) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditable]);

  const debouncedSearch = useCallback(
    debounce(async (term) => {
      if (hasFacets) return;
      if (term.length > 0) {
        setInternalLoading(true);
        try {
          setError(null);
          const results = await searchListItems(listType, term, i18n.language);
          setSearchResults(results);
        } catch (err) {
          setError(err.message || t('common:errorSearchingItems'));
          toast.error(err.message || t('common:errorSearchingItems'));
        } finally {
          setInternalLoading(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300),
    [listType, i18n.language, t, hasFacets]
  );

  useEffect(() => {
    if (isEditable && !hasFacets) {
      debouncedSearch(searchTerm);
    }
    return () => debouncedSearch.cancel();
  }, [searchTerm, debouncedSearch, isEditable, hasFacets]);

  const handleSelect = useCallback((item) => {
    const newItem = listType === 'languages' && showLanguageLevels && !isFilter
        ? { ...item, strength: 'intermediate' }
        : item;
    const newItems = [...selectedItems, newItem];
    onUpdate(newItems);
    setSearchTerm('');
    setIsDropdownOpen(false);
  }, [listType, onUpdate, selectedItems, showLanguageLevels, isFilter]);

  const handleRemove = useCallback((itemToRemove) => {
    const idToRemove = itemToRemove?._id || itemToRemove;
    const newItems = selectedItems.filter(i => (i._id || i) !== idToRemove);
    onUpdate(newItems);
  }, [onUpdate, selectedItems]);

  const getDisplayName = (item) => {
      if (typeof item !== 'object' || item === null) return item;
      const name = item.translation || item.name;
      if (listType === 'skillLevels' && item.level > 0) {
          return `${item.level} - ${name}`;
      }
      if (isFilter && typeof item.count === 'number') {
        return `${name} (${item.count})`;
      }
      return name;
  }

  const currentList = hasFacets
    ? allItems.filter(item => {
        const name = item.translation || item.name || '';
        return name.toLowerCase().includes(searchTerm.toLowerCase());
      })
    : (searchTerm ? searchResults : allItems);

  const filteredResults = currentList.filter(
    item => !selectedItems.some(selectedItem => (selectedItem._id || selectedItem) === item._id)
  );
  
  const isLoading = isLoadingProp || internalLoading;

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {isEditable && (
        <>
          <div className="relative">
          <Input
              type="text"
              value={searchTerm}
              variant="compact"
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder={placeholder || t('coachList:search')}
              className="w-full pr-10 py-2.5 text-sm rounded-lg border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 focus:border-indigo-500 outline-none transition-all focus-visible:ring-0 focus-visible:ring-offset-0 text-gray-900 dark:text-gray-200 placeholder:text-gray-500 dark:placeholder:text-gray-400"
              aria-label={placeholder || t('coachList:search')}
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common:loading')}
                </div>
              ) : error ? (
                <div className="p-4 text-center text-sm text-red-500">{error}</div>
              ) : filteredResults.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">{t('coachList:noResults')}</div>
              ) : (
                <ul className="py-1">
                  {filteredResults.map((item) => (
                    <li
                      key={item._id}
                      onMouseDown={() => handleSelect(item)}
                      className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/50 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                    >
                      {getDisplayName(item)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {(selectedItems?.length > 0) ? (
        <div className={`flex flex-wrap gap-2 ${isEditable ? 'mt-3' : 'mt-1'}`}>
          {selectedItems.filter(Boolean).map((item) => (
            <Badge variant="secondary" key={item._id || item} className="flex items-center gap-1.5 py-1 px-3 text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 animate-tagIn">
              <span>{getDisplayName(item)}</span>
              {isEditable && !isFilter && listType === 'languages' && showLanguageLevels && (
                <select
                  value={item.strength}
                  onChange={(e) => onUpdate(selectedItems.filter(Boolean).map(i => i._id === item._id ? { ...i, strength: e.target.value } : i))}
                  className="ml-1.5 text-xs bg-white/50 dark:bg-black/20 border-indigo-300 dark:border-indigo-700 rounded focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="native">{t('coachprofile:languageLevel.native')}</option>
                  <option value="fluent">{t('coachprofile:languageLevel.fluent')}</option>
                  <option value="intermediate">{t('coachprofile:languageLevel.intermediate')}</option>
                  <option value="basic">{t('coachprofile:languageLevel.basic')}</option>
                </select>
              )}
              {isEditable && (
                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  className="rounded-full flex items-center justify-center w-4 h-4 text-indigo-500 hover:bg-indigo-200 dark:text-indigo-400 dark:hover:bg-indigo-800 focus:outline-none transition-all"
                  aria-label={t('common:remove')}
                >
                  <X size={12} />
                </button>
              )}
            </Badge>
          ))}
        </div>
      ) : (
        !isEditable && <p className="mt-1 text-sm text-gray-900">{t('coachprofile:notSpecified')}</p>
      )}
    </div>
  );
};

export default memo(SearchableListSelector, (prevProps, nextProps) =>
  isEqual(prevProps.selectedItems, nextProps.selectedItems) &&
  isEqual(prevProps.availableItems, nextProps.availableItems) &&
  prevProps.isLoading === nextProps.isLoading &&
  prevProps.listType === nextProps.listType &&
  prevProps.onUpdate === nextProps.onUpdate &&
  prevProps.isFilter === nextProps.isFilter &&
  prevProps.isEditable === nextProps.isEditable &&
  prevProps.showLanguageLevels === nextProps.showLanguageLevels
);