import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { searchUsers } from '../services/userAPI';
import { requestConnection } from '../services/connectionAPI';
import { toast } from 'react-hot-toast';

const UserSearch = () => {
  const { t } = useTranslation(['common', 'userSearch']);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (searchTerm.length >= 3) {
      const delayDebounceFn = setTimeout(() => {
        performSearch();
      }, 300);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setSearchResults([]);
    }
  }, [searchTerm]);

  const performSearch = async () => {
    setIsLoading(true);
    try {
      const results = await searchUsers(searchTerm);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching users:', error);
      toast.error(t('userSearch:errorSearching'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (userId) => {
    try {
      await requestConnection(userId);
      toast.success(t('userSearch:connectionRequestSent'));
    } catch (error) {
      console.error('Error sending connection request:', error);
      toast.error(t('userSearch:errorSendingRequest'));
    }
  };

  return (
    <div className="user-search">
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder={t('userSearch:searchPlaceholder')}
        className="w-full p-2 border rounded mb-4"
      />
      {isLoading && <p>{t('common:loading')}</p>}
      <ul className="space-y-2">
        {searchResults.map((user) => (
          <li key={user.id} className="flex justify-between items-center bg-gray-100 p-2 rounded">
            <span>{user.name}</span>
            <button
              onClick={() => handleConnect(user.id)}
              className="bg-blue-500 text-white px-3 py-1 rounded"
            >
              {t('userSearch:connect')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default UserSearch;