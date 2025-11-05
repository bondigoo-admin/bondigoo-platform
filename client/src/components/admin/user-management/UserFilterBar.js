import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import debounce from 'lodash/debounce';
import { Input } from '../../ui/input.tsx';
import { Button } from '../../ui/button.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { useAdminUniqueUserCountries } from '../../../hooks/useAdmin';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.jsx';
import { Calendar } from '../../ui/calendar.jsx';
import { Slider } from '../../ui/slider.tsx';
import { Badge } from '../../ui/badge.tsx';
import { X, SlidersHorizontal, CalendarIcon, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../../lib/utils';

const UserFilterBar = ({ onApplyFilters, initialFilters }) => {
  const { t } = useTranslation(['admin']);
  const [filters, setFilters] = useState(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { data: countries = [], isLoading: isLoadingCountries } = useAdminUniqueUserCountries();

  const debouncedApplyFilters = useMemo(
    () => debounce((newFilters) => onApplyFilters(newFilters), 500),
    [onApplyFilters]
  );

  useEffect(() => {
    debouncedApplyFilters(filters);
    return () => debouncedApplyFilters.cancel();
  }, [filters, debouncedApplyFilters]);

  const handleInputChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };
  
  const handleDateChange = (key, date) => {
    const isSignup = key === 'signup';
    setFilters(prev => ({
      ...prev,
      [isSignup ? 'startDate' : 'lastLoginStartDate']: date?.from,
      [isSignup ? 'endDate' : 'lastLoginEndDate']: date?.to,
      page: 1
    }));
  };

  const handleSliderChange = (key, value) => {
    setFilters(prev => ({ 
      ...prev, 
      [key === 'trust' ? 'minTrust' : 'minProfileCompleteness']: value[0], 
      [key === 'trust' ? 'maxTrust' : 'maxProfileCompleteness']: value[1], 
      page: 1 
    }));
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    onApplyFilters(initialFilters);
  };
  
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.role) count++;
    if (filters.status) count++;
    if (filters.isEmailVerified) count++;
    if (filters.countryCode) count++;
    if (filters.startDate || filters.endDate) count++;
    if (filters.minTrust > 0 || filters.maxTrust < 100) count++;
    if (filters.stripeStatus) count++;
    if (filters.preferredLanguage) count++;
    if (filters.lastLoginStartDate || filters.lastLoginEndDate) count++;
    if (filters.minProfileCompleteness > 0 || filters.maxProfileCompleteness < 100) count++;
    if (filters.minSessions || filters.maxSessions) count++;
    if (filters.minEnrollments || filters.maxEnrollments) count++;
    if (filters.hasDispute) count++;
    return count;
  }, [filters]);

     return (
    <div className="p-4 bg-card border rounded-lg space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Input
          placeholder={t('userManagement.searchPlaceholder', 'Search by name, email, phone, or Stripe ID...')}
          value={filters.search}
          variant="compact"
          onChange={(e) => handleInputChange('search', e.target.value)}
          className="lg:col-span-2"
        />
        <Select value={filters.role} onValueChange={(value) => handleInputChange('role', value === 'all' ? '' : value)}>
          <SelectTrigger><SelectValue placeholder={t('userManagement.roles.all', 'All Roles')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('userManagement.roles.all', 'All Roles')}</SelectItem>
            <SelectItem value="client">{t('userManagement.roles.client', 'Client')}</SelectItem>
            <SelectItem value="coach">{t('userManagement.roles.coach', 'Coach')}</SelectItem>
            <SelectItem value="admin">{t('userManagement.roles.admin', 'Admin')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(value) => handleInputChange('status', value === 'all' ? '' : value)}>
          <SelectTrigger><SelectValue placeholder={t('userManagement.status.all', 'All Statuses')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('userManagement.status.all', 'All Statuses')}</SelectItem>
            <SelectItem value="active">{t('userManagement.status.active', 'Active')}</SelectItem>
            <SelectItem value="suspended">{t('userManagement.status.suspended', 'Suspended')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
          <Select value={filters.isEmailVerified} onValueChange={(value) => handleInputChange('isEmailVerified', value === 'all' ? '' : value)}>
            <SelectTrigger><SelectValue placeholder={t('userManagement.emailStatus.all', 'All Email Statuses')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('userManagement.emailStatus.all', 'All Email Statuses')}</SelectItem>
              <SelectItem value="true">{t('userManagement.emailStatus.verified', 'Verified')}</SelectItem>
              <SelectItem value="false">{t('userManagement.emailStatus.notVerified', 'Not Verified')}</SelectItem>
            </SelectContent>
          </Select>
           <Select 
            value={filters.countryCode || ''} 
            onValueChange={(value) => handleInputChange('countryCode', value === 'all' ? '' : value)}
            disabled={isLoadingCountries}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('userManagement.countryPlaceholder.all', 'All Countries')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('userManagement.countryPlaceholder.all', 'All Countries')}</SelectItem>
              {countries.map((country) => (
                <SelectItem key={country} value={country}>
                  {country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !filters.startDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.startDate ? `${format(filters.startDate, "LLL d, y")} - ${filters.endDate ? format(filters.endDate, "LLL d, y") : ''}` : <span>{t('userManagement.signupDateFilter', 'Signup Date')}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="range" selected={{ from: filters.startDate, to: filters.endDate }} onSelect={(date) => handleDateChange('signup', date)} /></PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !filters.lastLoginStartDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.lastLoginStartDate ? `${format(filters.lastLoginStartDate, "LLL d, y")} - ${filters.lastLoginEndDate ? format(filters.lastLoginEndDate, "LLL d, y") : ''}` : <span>{t('userManagement.lastSeenFilter', 'Last Seen Date')}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="range" selected={{ from: filters.lastLoginStartDate, to: filters.lastLoginEndDate }} onSelect={(date) => handleDateChange('lastLogin', date)} /></PopoverContent>
          </Popover>
           <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">{t('userManagement.trustScoreRange', 'Trust Score: {{min}} - {{max}}', {min: filters.minTrust || 0, max: filters.maxTrust || 100})}</label>
            <Slider
              defaultValue={[0, 100]}
              value={[filters.minTrust || 0, filters.maxTrust || 100]}
              onValueChange={(value) => handleSliderChange('trust', value)}
              max={100}
              step={5}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">{t('userManagement.profileCompletenessRange', 'Profile Completeness: {{min}}% - {{max}}%', {min: filters.minProfileCompleteness || 0, max: filters.maxProfileCompleteness || 100})}</label>
            <Slider
              defaultValue={[0, 100]}
              value={[filters.minProfileCompleteness || 0, filters.maxProfileCompleteness || 100]}
              onValueChange={(value) => handleSliderChange('completeness', value)}
              max={100}
              step={5}
            />
          </div>
          <Select value={filters.preferredLanguage} onValueChange={(value) => handleInputChange('preferredLanguage', value === 'all' ? '' : value)}>
            <SelectTrigger><SelectValue placeholder={t('userManagement.language.all', 'All Languages')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('userManagement.language.all', 'All Languages')}</SelectItem>
              <SelectItem value="en">{t('userManagement.language.en', 'English')}</SelectItem>
              <SelectItem value="de">{t('userManagement.language.de', 'German')}</SelectItem>
              <SelectItem value="fr">{t('userManagement.language.fr', 'French')}</SelectItem>
              <SelectItem value="es">{t('userManagement.language.es', 'Spanish')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.hasDispute} onValueChange={(value) => handleInputChange('hasDispute', value === 'all' ? '' : value)}>
            <SelectTrigger>
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive/80" />
                    <SelectValue placeholder={t('userManagement.dispute.all', 'All Dispute Statuses')} />
                </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('userManagement.dispute.all', 'All Dispute Statuses')}</SelectItem>
              <SelectItem value="true">{t('userManagement.dispute.hasDispute', 'Has Active Dispute')}</SelectItem>
              <SelectItem value="false">{t('userManagement.dispute.noDispute', 'No Active Dispute')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.stripeStatus} onValueChange={(value) => handleInputChange('stripeStatus', value === 'all' ? '' : value)}>
            <SelectTrigger><SelectValue placeholder={t('userManagement.stripeStatus.all', 'Stripe Status (Coaches)')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('userManagement.stripeStatus.all', 'All Stripe Statuses')}</SelectItem>
              <SelectItem value="connected">{t('userManagement.stripeStatus.connected', 'Connected')}</SelectItem>
              <SelectItem value="not_connected">{t('userManagement.stripeStatus.notConnected', 'Not Connected')}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <Input
              type="number"
              placeholder={t('userManagement.sessions.min', 'Min Sessions')}
              variant="compact"
              value={filters.minSessions}
              onChange={(e) => handleInputChange('minSessions', e.target.value)}
            />
            <Input
              type="number"
              placeholder={t('userManagement.sessions.max', 'Max Sessions')}
              variant="compact"
              value={filters.maxSessions}
              onChange={(e) => handleInputChange('maxSessions', e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <Input
              type="number"
              placeholder={t('userManagement.enrollments.min', 'Min Enrollments')}
              variant="compact"
              value={filters.minEnrollments}
              onChange={(e) => handleInputChange('minEnrollments', e.target.value)}
            />
            <Input
              type="number"
              placeholder={t('userManagement.enrollments.max', 'Max Enrollments')}
              variant="compact"
              value={filters.maxEnrollments}
              onChange={(e) => handleInputChange('maxEnrollments', e.target.value)}
            />
          </div>
        </div>
      )}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="ghost" onClick={() => setShowAdvanced(!showAdvanced)}>
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          {showAdvanced ? t('userManagement.hideAdvanced', 'Hide Advanced') : t('userManagement.showAdvanced', 'More Filters')}
          {activeFilterCount > 0 && <Badge className="ml-2">{activeFilterCount}</Badge>}
        </Button>
        <Button variant="outline" onClick={resetFilters} disabled={activeFilterCount === 0}>
          <X className="mr-2 h-4 w-4" />
          {t('userManagement.resetFilters', 'Reset')}
        </Button>
      </div>
    </div>
  );
};

export default UserFilterBar;