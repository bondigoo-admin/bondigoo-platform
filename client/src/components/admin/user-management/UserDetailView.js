import React from 'react';
import { CardDescription, CardHeader, CardTitle } from '../../ui/card.tsx';
import { Badge } from '../../ui/badge.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import MasterActionPanel from './MasterActionPanel';

const UserDetailView = ({ user, isLoading, onUserUpdate }) => {
  const { t } = useTranslation(['admin']);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex flex-row items-center space-x-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!user) {
    // This state is briefly visible while a newly selected user is being fetched.
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">{t('userManagement.loadingUser', 'Loading user details...')}</p>
      </div>
    );
  }

  const userStatusBadge = user.isActive ? (
    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Active</Badge>
  ) : (
    <Badge variant="destructive">Suspended</Badge>
  );

  const displayName = `${user.firstName} ${user.lastName}`;
  const displayRole = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  return (
    <div className="flex flex-col h-full">
      {/* HEADER - Stays at the top */}
      <CardHeader className="flex flex-row items-start gap-4 p-6 border-b">
        <Avatar className="h-16 w-16">
          <AvatarImage src={user.profilePicture?.url || `https://ui-avatars.com/api/?name=${displayName}&background=random`} />
          <AvatarFallback className="text-xl">{displayName.split(' ').map(n => n[0]).join('')}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <CardTitle className="text-2xl font-bold">{displayName}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">{displayRole}</Badge>
              {userStatusBadge}
            </div>
          </div>
          <CardDescription className="text-muted-foreground break-all">{user.email}</CardDescription>
          <p className="text-xs text-muted-foreground pt-1">
            {t('userManagement.signupDate', 'Member since:')} {format(new Date(user.createdAt), 'PP')}
            {user.lastLogin && ` • ${t('userManagement.lastLogin', 'Last login:')} ${format(new Date(user.lastLogin), 'PPp')}`}
          </p>
        </div>
      </CardHeader>

      {/* CONTENT - This part will scroll */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-6">
          <MasterActionPanel user={user} onUserUpdate={onUserUpdate} />
          
          <Tabs defaultValue="overview">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto">
              <TabsTrigger value="overview">{t('userManagement.tabs.overview', 'Overview')}</TabsTrigger>
              {user.role === 'coach' && (
                <TabsTrigger value="coachProfile">{t('userManagement.tabs.coachProfile', 'Coach Profile')}</TabsTrigger>
              )}
              <TabsTrigger value="bookings">{t('userManagement.tabs.bookings', 'Bookings')}</TabsTrigger>
              <TabsTrigger value="financials">{t('userManagement.tabs.financials', 'Financials')}</TabsTrigger>
            </TabsList>
            <div className="mt-4">
              <TabsContent value="overview" className="space-y-6">
                <div className="space-y-2">
                  <h4 className="font-semibold text-lg">{t('userManagement.overview.basicInfo', 'Basic Information')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm p-4 border rounded-lg bg-background/50">
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.firstName', 'First Name:')}</span> {user.firstName}</div>
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.lastName', 'Last Name:')}</span> {user.lastName}</div>
                    <div className="md:col-span-2"><span className="font-medium text-muted-foreground">{t('userManagement.overview.email', 'Email:')}</span> {user.email}</div>
                    <div className="md:col-span-2"><span className="font-medium text-muted-foreground">{t('userManagement.overview.id', 'ID:')}</span> <code className="text-xs">{user._id}</code></div>
                    {user.phone && <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.phone', 'Phone:')}</span> {user.phone}</div>}
                    {user.location && <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.location', 'Location:')}</span> {user.location}</div>}
                    {user.suspensionReason && (
                      <div className="md:col-span-2 p-3 rounded-md bg-destructive/10 text-red-700 dark:text-red-400">
                        <span className="font-semibold">{t('userManagement.overview.suspensionReason', 'Suspension Reason:')}</span> {user.suspensionReason}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-lg">{t('userManagement.overview.systemData', 'System Data')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm p-4 border rounded-lg bg-background/50">
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.trustScore', 'Trust Score:')}</span> {user.trustScore ?? 'N/A'}</div>
                    <div><span className="font-medium text-muted-foreground">{t('moderation.support.warnings', 'Warnungen:')}</span> {user.warningCount ?? user.moderation?.warningsCount ?? 0}</div>
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.blockedBy', 'Blocked By Others:')}</span> {user.blockedByCount ?? 0}</div>
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.avgRating', 'Avg. Rating:')}</span> {user.role === 'coach' ? (user.averageRating?.toFixed(1) ?? 'N/A') : 'N/A'}</div>
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.profileCompleteness', 'Profile Completeness:')}</span> {user.role === 'coach' ? `${user.profileCompleteness ?? 0}%` : 'N/A'}</div>
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.totalSessions', 'Total Sessions:')}</span> {user.role === 'coach' ? user.totalSessions ?? 0 : 'N/A'}</div>
                    <div><span className="font-medium text-muted-foreground">{t('userManagement.overview.totalEnrollments', 'Total Enrollments:')}</span> {user.role === 'coach' ? user.totalEnrollments ?? 0 : 'N/A'}</div>
                  </div>
                </div>
              </TabsContent>
              {user.role === 'coach' && (
                <TabsContent value="coachProfile">
                  <p className="text-muted-foreground p-4 border rounded-lg">{t('common:comingSoon', 'Coming soon: Coach profile details and editing.')}</p>
                </TabsContent>
              )}
              <TabsContent value="bookings">
                <p className="text-muted-foreground p-4 border rounded-lg">{t('common:comingSoon', 'Coming soon: User booking history.')}</p>
              </TabsContent>
              <TabsContent value="financials">
                <p className="text-muted-foreground p-4 border rounded-lg">{t('common:comingSoon', 'Coming soon: User financial ledger.')}</p>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default UserDetailView;