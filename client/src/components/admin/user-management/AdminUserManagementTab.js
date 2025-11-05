import React, { useState, useEffect, useRef} from 'react';
import UserMasterTable from './UserMasterTable';
import UserFilterBar from './UserFilterBar';
import UserDetailView from './UserDetailView';
import { useAdminUserDetail } from '../../../hooks/useAdmin';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { isEqual } from 'lodash';
import { Sheet, SheetContent } from '../../ui/sheet.jsx';

const usePrevious = (value) => {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

const AdminUserManagementTab = () => {
  const { t } = useTranslation(['admin']);
  const [selectedUserId, setSelectedUserId] = useState(null);
  
  const initialFilters = {
    page: 1,
    limit: 15, // Increased limit for full-width view
    search: '',
    role: '',
    status: '',
    sortField: 'createdAt',
    sortOrder: 'desc',
    isEmailVerified: '',
    countryCode: '',
    minTrust: 0,
    maxTrust: 100,
    stripeStatus: '',
    startDate: null,
    endDate: null,
    preferredLanguage: '',
    lastLoginStartDate: null,
    lastLoginEndDate: null,
    minProfileCompleteness: 0,
    maxProfileCompleteness: 100,
    minSessions: '',
    maxSessions: '',
    minEnrollments: '',
    maxEnrollments: '',
    hasDispute: '',
  };

  const [filters, setFilters] = useState(initialFilters);
  const prevFilters = usePrevious(filters);

  const { data: selectedUser, isLoading, isError, error, refetch } = useAdminUserDetail(selectedUserId);

  useEffect(() => {
    if (isError) {
      toast.error(t('userManagement.errorLoadingUser', 'Error loading user details:') + (error.message || ''));
    }
  }, [isError, error, t]);
  
  useEffect(() => {
    if (prevFilters) {
      const { page: prevPage, limit: prevLimit, sortField: prevSortField, sortOrder: prevSortOrder, ...prevFiltering } = prevFilters;
      const { page: currentPage, limit: currentLimit, sortField: currentSortField, sortOrder: currentSortOrder, ...currentFiltering } = filters;

      if (!isEqual(prevFiltering, currentFiltering)) {
        setSelectedUserId(null);
      }
    }
  }, [filters, prevFilters]);

  const handleUserUpdate = () => {
    refetch();
    // Invalidation in the MasterActionPanel handles the master table refetch.
  };
  
  const handleSheetOpenChange = (isOpen) => {
    if (!isOpen) {
      setSelectedUserId(null);
    }
  };

  return (
    <div className="flex h-full flex-col p-4 lg:p-6 space-y-4">
      <UserFilterBar onApplyFilters={setFilters} initialFilters={initialFilters} />
      
      <div className="flex-1 min-h-0">
        <UserMasterTable
          onUserSelect={setSelectedUserId}
          selectedUserId={selectedUserId}
          filters={filters}
          setFilters={setFilters}
        />
      </div>

      <Sheet open={!!selectedUserId} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl p-0 flex flex-col">
          <UserDetailView 
            user={selectedUser} 
            isLoading={isLoading && !!selectedUserId} // Only show loading skeleton when a user is selected and being fetched
            onUserUpdate={handleUserUpdate} 
          />
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AdminUserManagementTab;