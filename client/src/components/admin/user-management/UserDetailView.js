// src/components/admin/user-management/UserDetailView.js

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.tsx';
import { Badge } from '../../ui/badge.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import MasterActionPanel from './MasterActionPanel';
import { Sparkles, History, Edit, Trash2, PlusCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip.tsx';
import { Button } from '../../ui/button.tsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../ui/alert-dialog.tsx';
import FeeOverrideModal from './FeeOverrideModal';
import { useUpdateFeeOverride } from '../../../hooks/useAdmin';
import { toast } from 'react-hot-toast';

// FeeOverrideBadge component remains unchanged...
const FeeOverrideBadge = ({ override, t }) => {
  if (!override) return null;
  const isExpired = override.effectiveUntil && new Date(override.effectiveUntil) < new Date();
  const formatAppliesTo = (scopes = []) => {
    if (scopes.includes('ALL')) return t('userManagement.feeOverride.scopes.all');
    return scopes.map(scope => t(`userManagement.feeOverride.scopes.${scope.toLowerCase()}`)).join(', ');
  };

  if (isExpired) {
    return (
      <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
        <Badge variant="outline" className="cursor-help border-dashed text-muted-foreground dark:border-zinc-700">
          <History className="mr-1.5 h-3 w-3" />{t('userManagement.feeOverride.status.expired')}
        </Badge>
      </TooltipTrigger><TooltipContent className="max-w-xs text-sm">
        <p className="font-semibold">{t('userManagement.feeOverride.status.expiredOverride')}</p>
        <p className="text-muted-foreground">{t('userManagement.feeOverride.expiredOn', { date: format(new Date(override.effectiveUntil), 'PP') })}</p>
      </TooltipContent></Tooltip></TooltipProvider>
    );
  }

  const badgeText = override.type === 'ZERO_FEE' ? t('userManagement.feeOverride.status.zeroFee') : t('userManagement.feeOverride.status.discount', { percentage: override.discountPercentage });

  return (
    <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
      <Badge variant="secondary" className="cursor-help border border-purple-200 bg-purple-100 text-purple-800 dark:border-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
        <Sparkles className="mr-1.5 h-3 w-3" />{badgeText}
      </Badge>
    </TooltipTrigger><TooltipContent className="max-w-xs p-0">
      <div className="space-y-3 p-3">
        <p className="font-semibold">{t('userManagement.feeOverride.activeOverrideTitle')}</p>
        <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t('userManagement.feeOverride.type')}:</span><span>{override.type === 'ZERO_FEE' ? t('userManagement.feeOverride.types.zero') : t('userManagement.feeOverride.types.discount')}</span>
          <span className="font-medium text-foreground">{t('userManagement.feeOverride.appliesTo')}:</span><span>{formatAppliesTo(override.appliesTo)}</span>
          <span className="font-medium text-foreground">{t('userManagement.feeOverride.expires')}:</span><span>{override.effectiveUntil ? format(new Date(override.effectiveUntil), 'PP') : t('userManagement.feeOverride.noExpiry')}</span>
        </div>
        {override.adminNotes && (<div className="pt-2">
          <p className="text-sm font-semibold text-foreground">{t('userManagement.feeOverride.notes')}</p>
          <blockquote className="mt-1 border-l-2 pl-3 text-sm italic text-muted-foreground">{override.adminNotes}</blockquote>
        </div>)}
      </div>
    </TooltipContent></Tooltip></TooltipProvider>
  );
};


const UserDetailView = ({ user, isLoading, onUserUpdate }) => {
  const { t } = useTranslation(['admin', 'common']);
  const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
  const updateFeeMutation = useUpdateFeeOverride();

  const handleRemoveOverride = async () => {
    await toast.promise(
      // --- FIX IS HERE: Send an empty object instead of null ---
      updateFeeMutation.mutateAsync({ userId: user._id, overrideData: {} }),
      {
        loading: t('common:removing'),
        success: () => {
          onUserUpdate(); // Refetch user data
          return t('userManagement.actions.feeOverrideRemoveSuccess');
        },
        error: (err) => err.response?.data?.message || t('common:error.generic'),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex flex-row items-center space-x-4"><Skeleton className="h-16 w-16 rounded-full" /><div className="space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-64" /></div></div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!user) {
    return (<div className="flex h-full items-center justify-center p-8"><p className="text-muted-foreground">{t('userManagement.loadingUser', 'Loading user details...')}</p></div>);
  }

  const userStatusBadge = user.isActive ? (<Badge variant="secondary" className="border-green-200 dark:border-green-700/60 bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">Active</Badge>) : (<Badge variant="destructive">Suspended</Badge>);
  const displayName = `${user.firstName} ${user.lastName}`;
  const displayRole = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  const feeOverride = user.coachProfile?.settings?.platformFeeOverride;
  const isOverrideExpired = feeOverride?.effectiveUntil && new Date(feeOverride.effectiveUntil) < new Date();

  return (
    <>
      <div className="flex h-full flex-col">
        {/* HEADER */}
        <CardHeader className="flex flex-row items-start gap-4 border-b p-6">
          <Avatar className="h-16 w-16"><AvatarImage src={user.profilePicture?.url || `https://ui-avatars.com/api/?name=${displayName}&background=random`} /><AvatarFallback className="text-xl">{displayName.split(' ').map(n => n[0]).join('')}</AvatarFallback></Avatar>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <CardTitle className="text-2xl font-bold">{displayName}</CardTitle>
              <div className="flex flex-wrap items-center gap-2">{<Badge variant="outline" className="capitalize">{displayRole}</Badge>}{userStatusBadge}{user.role === 'coach' && <FeeOverrideBadge override={feeOverride} t={t} />}</div>
            </div>
            <CardDescription className="break-all text-muted-foreground">{user.email}</CardDescription>
            <p className="pt-1 text-xs text-muted-foreground">{t('userManagement.signupDate', 'Member since:')} {format(new Date(user.createdAt), 'PP')}{user.lastLogin && ` • ${t('userManagement.lastLogin', 'Last login:')} ${format(new Date(user.lastLogin), 'PPp')}`}</p>
          </div>
        </CardHeader>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-6">
            <MasterActionPanel user={user} onUserUpdate={onUserUpdate} onSetFeeOverrideClick={() => setIsFeeModalOpen(true)} />
            <Tabs defaultValue="overview">
              <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-4"><TabsTrigger value="overview">{t('userManagement.tabs.overview', 'Overview')}</TabsTrigger>{user.role === 'coach' && (<TabsTrigger value="coachProfile">{t('userManagement.tabs.coachProfile', 'Coach Profile')}</TabsTrigger>)}<TabsTrigger value="bookings">{t('userManagement.tabs.bookings', 'Bookings')}</TabsTrigger><TabsTrigger value="financials">{t('userManagement.tabs.financials', 'Financials')}</TabsTrigger></TabsList>
              <div className="mt-4">
                <TabsContent value="overview" className="space-y-6">
                  <Card><CardHeader><CardTitle className="text-lg">{t('userManagement.overview.basicInfo', 'Basic Information')}</CardTitle></CardHeader><CardContent><div className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm md:grid-cols-2">
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.firstName', 'First Name:')}</span> {user.firstName}</div>
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.lastName', 'Last Name:')}</span> {user.lastName}</div>
                    <div className="md:col-span-2"><span className="font-medium text-muted-foreground">{t('userManagement.overview.email', 'Email:')}</span> {user.email}</div>
                    <div className="md:col-span-2"><span className="font-medium text-muted-foreground">{t('userManagement.overview.id', 'ID:')}</span> <code className="text-xs">{user._id}</code></div>
                    {user.phone && <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.phone', 'Phone:')}</span> {user.phone}</div>}
                    {user.location && <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.location', 'Location:')}</span> {user.location}</div>}
                    {user.suspensionReason && (<div className="rounded-md bg-destructive/10 p-3 text-red-700 dark:text-red-400 md:col-span-2"><span className="font-semibold">{t('userManagement.overview.suspensionReason', 'Suspension Reason:')}</span> {user.suspensionReason}</div>)}
                  </div></CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-lg">{t('userManagement.overview.systemData', 'System Data')}</CardTitle></CardHeader><CardContent><div className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm md:grid-cols-2">
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.trustScore', 'Trust Score:')}</span> {user.trustScore ?? 'N/A'}</div>
                    <div><span className="font-medium text-muted-foreground">{t('moderation.support.warnings', 'Warnings:')}</span> {user.warningCount ?? user.moderation?.warningsCount ?? 0}</div>
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.blockedBy', 'Blocked By Others:')}</span> {user.blockedByCount ?? 0}</div>
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.avgRating', 'Avg. Rating:')}</span> {user.role === 'coach' ? (user.averageRating?.toFixed(1) ?? 'N/A') : 'N/A'}</div>
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.profileCompleteness', 'Profile Completeness:')}</span> {user.role === 'coach' ? `${user.profileCompleteness ?? 0}%` : 'N/A'}</div>
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.totalSessions', 'Total Sessions:')}</span> {user.role === 'coach' ? user.totalSessions ?? 0 : 'N/A'}</div>
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.totalEnrollments', 'Total Enrollments:')}</span> {user.role === 'coach' ? user.totalEnrollments ?? 0 : 'N/A'}</div>
                  </div></CardContent></Card>
                  {user.role === 'coach' && (
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div className="space-y-1"><CardTitle className="text-lg">{t('userManagement.feeOverride.panelTitle', 'Platform Fee Status')}</CardTitle><CardDescription>{t('userManagement.feeOverride.panelDescription', 'Manage special fee conditions for this coach.')}</CardDescription></div>
                        {feeOverride && !isOverrideExpired && (<div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setIsFeeModalOpen(true)}><Edit className="mr-2 h-4 w-4" />{t('common:edit')}</Button>
                            <AlertDialog><AlertDialogTrigger asChild><Button variant="delete-outline" size="sm"><Trash2 className="mr-2 h-4 w-4" />{t('common:remove')}</Button></AlertDialogTrigger>
                              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('userManagement.feeOverride.removeConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('userManagement.feeOverride.removeConfirmDesc')}</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel><AlertDialogAction onClick={handleRemoveOverride}>{t('userManagement.feeOverride.removeOverride')}</AlertDialogAction></AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                        </div>)}
                      </CardHeader>
                      <CardContent>
                        {feeOverride && !isOverrideExpired ? (
                          <div className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                            <div><div className="font-medium text-muted-foreground">{t('userManagement.feeOverride.type')}</div><div>{t(`userManagement.feeOverride.types.${feeOverride.type === 'ZERO_FEE' ? 'zero' : 'discount'}`)}</div></div>
                            {feeOverride.type === 'PERCENTAGE_DISCOUNT' && (<div><div className="font-medium text-muted-foreground">{t('userManagement.feeOverride.discount')}</div><div>{feeOverride.discountPercentage}%</div></div>)}
                            <div><div className="font-medium text-muted-foreground">{t('userManagement.feeOverride.appliesTo')}</div><div>{feeOverride.appliesTo?.map(s => t(`userManagement.feeOverride.scopes.${s.toLowerCase()}`)).join(', ')}</div></div>
                            <div><div className="font-medium text-muted-foreground">{t('userManagement.feeOverride.expires')}</div><div>{feeOverride.effectiveUntil ? format(new Date(feeOverride.effectiveUntil), 'PP') : t('userManagement.feeOverride.noExpiry')}</div></div>
                            {feeOverride.adminNotes && (<div className="sm:col-span-2"><div className="font-medium text-muted-foreground">{t('userManagement.feeOverride.notes')}</div><p className="mt-1 rounded-md border bg-muted/50 p-3 italic">{feeOverride.adminNotes}</p></div>)}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center space-y-3 rounded-lg border-2 border-dashed p-8 text-center">
                            <p className="text-muted-foreground">{isOverrideExpired ? t('userManagement.feeOverride.expiredInfo') : t('userManagement.feeOverride.noActiveOverride')}</p>
                            <Button onClick={() => setIsFeeModalOpen(true)}><PlusCircle className="mr-2 h-4 w-4" />{t('userManagement.feeOverride.addOverride')}</Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
                {user.role === 'coach' && (<TabsContent value="coachProfile"><p className="rounded-lg border p-4 text-muted-foreground">{t('common:comingSoon', 'Coming soon: Coach profile details and editing.')}</p></TabsContent>)}
                <TabsContent value="bookings"><p className="rounded-lg border p-4 text-muted-foreground">{t('common:comingSoon', 'Coming soon: User booking history.')}</p></TabsContent>
                <TabsContent value="financials"><p className="rounded-lg border p-4 text-muted-foreground">{t('common:comingSoon', 'Coming soon: User financial ledger.')}</p></TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </div>
      {user.role === 'coach' && <FeeOverrideModal isOpen={isFeeModalOpen} onClose={() => setIsFeeModalOpen(false)} user={user} />}
    </>
  );
};

export default UserDetailView;