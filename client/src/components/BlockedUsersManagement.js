
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { getBlockedUsers, unblockUser } from '../services/userAPI';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { Loader2, UserX, ShieldCheck } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar.tsx';
import { Button } from './ui/button.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog.tsx';
import { useTranslation } from 'react-i18next';
import { logger } from '../utils/logger';

const getInitials = (firstName = '', lastName = '') => {
  return `${(firstName?.charAt(0) || '')}${(lastName?.charAt(0) || '')}`.toUpperCase();
};

const BlockedUsersManagement = () => {
    const { user } = useAuth();
    const { t } = useTranslation(['connections', 'common']);
    const queryClient = useQueryClient();
    const [userToUnblock, setUserToUnblock] = useState(null);

    const { data: blockedUsers, isLoading, isError } = useQuery('blockedUsers', getBlockedUsers, {
        enabled: !!user,
    });

    const unblockMutation = useMutation((userId) => unblockUser(userId), {
        onSuccess: (data) => {
            toast.success(t('unblockSuccess'));
            queryClient.setQueryData('blockedUsers', data.blockedUsers);
            queryClient.invalidateQueries(['connections', user?._id]);
            setUserToUnblock(null);
        },
        onError: (error) => {
            logger.error('[BlockedUsersManagement] Unblock failed', { error });
            toast.error(error.response?.data?.message || t('common:errors.generic'));
            setUserToUnblock(null);
        },
    });

    if (isLoading) {
        return <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (isError) {
        return <div className="p-4 text-center bg-destructive/10 text-destructive rounded-lg">{t('errorLoadingBlocked')}</div>;
    }
    
    return (
        <div className="max-w-4xl mx-auto">
            <header className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight">{t('blockedUsersTitle')}</h2>
                <p className="mt-1 text-muted-foreground">{t('blockedUsersSubtitle')}</p>
            </header>
            
            {blockedUsers && blockedUsers.length > 0 ? (
                <ul className="space-y-3">
                    {blockedUsers.map(({ user: blockedUser }) => (
                       <li key={blockedUser._id} className="flex items-center justify-between gap-4 p-4 border rounded-lg bg-card text-card-foreground">
                            <div className="flex items-center gap-4 min-w-0">
                                <Avatar className="h-11 w-11">
                                    <AvatarImage src={blockedUser.profilePicture?.url || blockedUser.coachProfilePicture?.url} />
                                    <AvatarFallback>{getInitials(blockedUser.firstName, blockedUser.lastName)}</AvatarFallback>
                                </Avatar>
                                <div className='min-w-0'>
                                    <p className="font-semibold truncate">{blockedUser.firstName} {blockedUser.lastName}</p>
                                    <p className="text-sm text-muted-foreground capitalize">{blockedUser.role}</p>
                                </div>
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setUserToUnblock(blockedUser)}
                                disabled={unblockMutation.isLoading}
                            >
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                {t('unblock')}
                            </Button>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed rounded-xl">
                    <UserX className="h-16 w-16 text-muted-foreground/50" />
                    <p className="mt-4 text-xl font-semibold">{t('noBlockedUsers')}</p>
                    <p className="mt-1 text-muted-foreground">{t('noBlockedUsersHint')}</p>
                </div>
            )}
            
            <AlertDialog open={!!userToUnblock} onOpenChange={(open) => !open && setUserToUnblock(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('confirmUnblockTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('confirmUnblockDescription', { name: `${userToUnblock?.firstName || ''} ${userToUnblock?.lastName || ''}` })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={unblockMutation.isLoading}>{t('common:cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => unblockMutation.mutate(userToUnblock._id)}
                            disabled={unblockMutation.isLoading}
                        >
                            {unblockMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('unblock')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default BlockedUsersManagement;