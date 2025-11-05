import React from 'react';
import { useAdminUsers, useUpdateCoachByAdmin } from '../../../hooks/useAdmin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table.tsx';
import { Button } from '../../ui/button.tsx';
import { ChevronLeft, ChevronRight, ArrowUpDown, CheckCircle2, XCircle, AlertTriangle, Star } from 'lucide-react';
import { Badge } from '../../ui/badge.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar.tsx';
import { useTranslation } from 'react-i18next';
import { format, formatDistanceToNow } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip.tsx';
import { Switch } from '../../ui/switch.tsx';
import { toast } from 'react-hot-toast';

const UserMasterTable = ({ onUserSelect, selectedUserId, filters, setFilters }) => {
  const { t } = useTranslation(['admin', 'common']);

  const { data, isLoading, isError, error } = useAdminUsers(filters);
  const updateCoachMutation = useUpdateCoachByAdmin();

  const handleFeatureToggle = (userId, currentStatus) => {
    updateCoachMutation.mutate({ userId, updateData: { isTopCoach: !currentStatus } }, {
        onSuccess: () => toast.success(t('userManagement.actions.coachUpdated', 'Coach updated successfully.')),
        onError: (err) => toast.error(err.response?.data?.message || t('common:error.generic')),
    });
  };

  const handleSort = (field) => {
    const newSortOrder = filters.sortField === field && filters.sortOrder === 'asc' ? 'desc' : 'asc';
    setFilters(prev => ({ ...prev, sortField: field, sortOrder: newSortOrder, page: 1 }));
  };
  
  const users = data?.users || [];
  const totalPages = data?.totalPages || 1;

  if (isError) {
    return <div className="text-red-500 p-4">{t('userManagement.errorLoadingUsers', 'Error loading users:')} {error.message}</div>;
  }
  
  const getTrustScoreVariant = (score) => {
    if (score >= 80) return 'success';
    if (score >= 50) return 'warning';
    return 'destructive';
  };

return (
    <div className="flex flex-col h-full bg-card md:rounded-lg md:border">
      <div className="overflow-auto flex-grow">
        <Table>
          <TableHeader className="hidden md:table-header-group">
            <TableRow>
              <TableHead onClick={() => handleSort('firstName')} className="cursor-pointer whitespace-nowrap">
                {t('userManagement.table.name', 'Name')} <ArrowUpDown className="ml-2 h-4 w-4 inline" />
              </TableHead>
              <TableHead onClick={() => handleSort('isActive')} className="cursor-pointer whitespace-nowrap">
                {t('userManagement.table.status', 'Status')} <ArrowUpDown className="ml-2 h-4 w-4 inline" />
              </TableHead>
              <TableHead onClick={() => handleSort('billingDetails.address.country')} className="cursor-pointer whitespace-nowrap hidden lg:table-cell">
                {t('userManagement.table.country', 'Country')} <ArrowUpDown className="ml-2 h-4 w-4 inline" />
              </TableHead>
              <TableHead className="hidden lg:table-cell whitespace-nowrap">
                {t('userManagement.table.stripe', 'Stripe')}
              </TableHead>
              <TableHead onClick={() => handleSort('ltv.amount')} className="cursor-pointer whitespace-nowrap hidden lg:table-cell">
                {t('userManagement.table.ltv', 'LTV')} <ArrowUpDown className="ml-2 h-4 w-4 inline" />
              </TableHead>
              <TableHead onClick={() => handleSort('trustScore')} className="cursor-pointer whitespace-nowrap hidden md:table-cell">
                {t('userManagement.table.trust', 'Trust')} <ArrowUpDown className="ml-2 h-4 w-4 inline" />
              </TableHead>
              <TableHead onClick={() => handleSort('warningCount')} className="cursor-pointer whitespace-nowrap hidden md:table-cell">
                {t('moderation.support.warnings', 'Warnungen')} <ArrowUpDown className="ml-2 h-4 w-4 inline" />
              </TableHead>
              <TableHead className="hidden md:table-cell">{t('userManagement.table.featured', 'Featured')}</TableHead>
              <TableHead onClick={() => handleSort('averageRating')} className="cursor-pointer whitespace-nowrap hidden xl:table-cell">
                {t('userManagement.table.rating', 'Avg. Rating')} <ArrowUpDown className="ml-2 h-4 w-4 inline" />
              </TableHead>
              <TableHead onClick={() => handleSort('totalSessions')} className="cursor-pointer whitespace-nowrap hidden xl:table-cell">
                {t('userManagement.table.sessions', 'Sessions')} <ArrowUpDown className="ml-2 h-4 w-4 inline" />
              </TableHead>
              <TableHead onClick={() => handleSort('totalEnrollments')} className="cursor-pointer whitespace-nowrap hidden xl:table-cell">
                {t('userManagement.table.enrollments', 'Enrollments')} <ArrowUpDown className="ml-2 h-4 w-4 inline" />
              </TableHead>
              <TableHead onClick={() => handleSort('blockedByCount')} className="cursor-pointer whitespace-nowrap hidden xl:table-cell">
                {t('userManagement.table.blockedBy', 'Blocked By')} <ArrowUpDown className="ml-2 h-4 w-4 inline" />
              </TableHead>
              <TableHead onClick={() => handleSort('lastLogin')} className="cursor-pointer whitespace-nowrap hidden sm:table-cell">
                {t('userManagement.table.lastSeen', 'Last Seen')} <ArrowUpDown className="ml-2 h-4 w-4 inline" />
              </TableHead>
              <TableHead onClick={() => handleSort('createdAt')} className="cursor-pointer whitespace-nowrap hidden lg:table-cell">
                {t('userManagement.table.signupDate', 'Signup Date')} <ArrowUpDown className="ml-2 h-4 w-4 inline" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: filters.limit || 15 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={10} className="p-4 md:hidden">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-3 w-36" />
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <Skeleton className="h-5 w-14" />
                        <Skeleton className="h-5 w-12" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell"><div className="flex items-center gap-2"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-5 w-32" /></div></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-6 w-10 mx-auto" /></TableCell>
                  <TableCell className="hidden xl:table-cell"><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell className="hidden xl:table-cell"><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell className="hidden xl:table-cell"><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell className="hidden xl:table-cell"><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                </TableRow>
              ))
              ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="h-24 text-center text-muted-foreground">
                  {t('userManagement.noUsersFound', 'No users found matching your criteria.')}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const ltvAmount = user.ltv?.amount || 0;
                return (
                <TableRow
                  key={user._id}
                  onClick={() => onUserSelect(user._id)}
                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedUserId === user._id ? 'bg-muted dark:bg-zinc-800' : ''} border-b`}
                >
                  <TableCell colSpan={10} className="p-4 md:hidden">
                      <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3 overflow-hidden">
                              <Avatar className="h-10 w-10 flex-shrink-0">
                                  <AvatarImage src={user.profilePicture?.url || `https://ui-avatars.com/api/?name=${user.firstName}+${user.lastName}&background=random`} />
                                  <AvatarFallback>{user.firstName?.[0]}{user.lastName?.[0]}</AvatarFallback>
                              </Avatar>
                              <div className="flex-grow overflow-hidden">
                                  <div className="font-medium truncate flex items-center gap-1.5">
                                    {user.firstName} {user.lastName}
                                    {user.hasActiveDispute && <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />}
                                    <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger>
                                      {user.isEmailVerified ? <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" /> : <XCircle className="h-3 w-3 text-yellow-500 flex-shrink-0" />}
                                    </TooltipTrigger><TooltipContent>
                                      {user.isEmailVerified ? t('userManagement.emailVerified') : t('userManagement.emailNotVerified')}
                                    </TooltipContent></Tooltip></TooltipProvider>
                                  </div>
                                  <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                              </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            {user.isActive ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 border border-green-200 dark:border-green-700/60">Active</Badge>
                            ) : (
                              <Badge variant="destructive">Suspended</Badge>
                            )}
                            <Badge variant="outline" className="capitalize">{user.role}</Badge>
                          </div>
                      </div>
                  </TableCell>

                  <TableCell className="font-medium hidden md:table-cell">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.profilePicture?.url || `https://ui-avatars.com/api/?name=${user.firstName}+${user.lastName}&background=random`} />
                        <AvatarFallback>{user.firstName?.[0]}{user.lastName?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1.5">{user.firstName} {user.lastName}
                          {user.hasActiveDispute && (
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger>
                                  <AlertTriangle className="h-3 w-3 text-destructive" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t('userManagement.hasActiveDispute', 'User has an active payment dispute.')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger>
                                {user.isEmailVerified ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-yellow-500" />}
                              </TooltipTrigger>
                              <TooltipContent>
                                {user.isEmailVerified ? t('userManagement.emailVerified') : t('userManagement.emailNotVerified')}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </span>
                        <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                      </div>
                    </div>
                  </TableCell>
                   <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      {user.isActive ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 border border-green-200 dark:border-green-700/60">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Suspended</Badge>
                      )}
                      <Badge variant="outline" className="capitalize">{user.role}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {user.billingDetails?.address?.country || t('common:na', 'N/A')}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {user.role === 'coach' ? (
                      user.stripeStatus === 'connected' ? (
                        <Badge variant="success">{t('userManagement.stripeStatus.connected', 'Connected')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('userManagement.stripeStatus.notConnected', 'Not Connected')}</Badge>
                      )
                    ) : (
                      <span className="text-muted-foreground">{t('common:na', 'N/A')}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {new Intl.NumberFormat('de-CH', { 
                      style: 'currency', 
                      currency: user.ltv?.currency || 'CHF',
                      minimumFractionDigits: ltvAmount < 1000 ? 2 : 0,
                      maximumFractionDigits: ltvAmount < 1000 ? 2 : 0,
                    }).format(ltvAmount)}
                  </TableCell>
                 <TableCell className="hidden md:table-cell">
                    <Badge variant={getTrustScoreVariant(user.trustScore ?? 100)}>{user.trustScore ?? 100}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground text-center">
                    {user.warningCount > 0 ? (
                      <Badge variant="warning">{user.warningCount}</Badge>
                    ) : user.warningCount || 0}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-center" onClick={(e) => e.stopPropagation()}>
                    {user.role === 'coach' ? (
                        <Switch
                            checked={!!user.isTopCoach}
                            onCheckedChange={() => handleFeatureToggle(user._id, user.isTopCoach)}
                            disabled={updateCoachMutation.isLoading}
                        />
                    ) : (
                        <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground text-center">
                    {user.role === 'coach' ? (
                      <div className="flex items-center justify-center gap-1">
                        <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                        <span>{(user.averageRating || 0).toFixed(1)}</span>
                      </div>
                    ) : t('common:na', 'N/A')}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground text-center">
                    {user.role === 'coach' ? user.totalSessions ?? 0 : t('common:na', 'N/A')}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground text-center">
                    {user.role === 'coach' ? user.totalEnrollments ?? 0 : t('common:na', 'N/A')}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground text-center">
                    {user.blockedByCount ?? 0}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {user.lastLogin ? formatDistanceToNow(new Date(user.lastLogin), { addSuffix: true }) : t('common:never', 'Never')}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{format(new Date(user.createdAt), 'PP')}</TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between p-4 border-t">
        <div className="text-sm text-muted-foreground">
          Page {data?.currentPage || 1} of {totalPages}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilters(prev => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
            disabled={filters.page === 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilters(prev => ({ ...prev, page: Math.min(prev.page + 1, totalPages) }))}
            disabled={filters.page === totalPages || isLoading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UserMasterTable;