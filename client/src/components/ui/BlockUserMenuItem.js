import React from 'react';
import { useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import { blockUser, unblockUser } from '../../services/userAPI';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from './button.tsx';
import { useTranslation } from 'react-i18next';

const BlockUserMenuItem = ({ targetUserId, isBlocked, onActionComplete, asButton = false }) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { t } = useTranslation(['common']);

    const handleSuccess = (action, data) => {
        toast.success(t(`user${action}`));
        queryClient.setQueryData('blockedUsers', data.blockedUsers);
        queryClient.invalidateQueries('coaches');
        queryClient.invalidateQueries('users');
        queryClient.invalidateQueries(['user', targetUserId]);
        queryClient.invalidateQueries(['connections', user?._id]);
        if (onActionComplete) onActionComplete();
    };

    const blockMutation = useMutation(() => blockUser(targetUserId), {
        onSuccess: (data) => handleSuccess('Blocked', data),
        onError: (error) => toast.error(error.response?.data?.message || t('failedToBlockUser')),
    });

    const unblockMutation = useMutation(() => unblockUser(targetUserId), {
        onSuccess: (data) => handleSuccess('Unblocked', data),
        onError: (error) => toast.error(error.response?.data?.message || t('failedToUnblockUser')),
    });

    if (!user || user.id === targetUserId) {
        return null;
    }

    const handleClick = (e) => {
        e.stopPropagation();
        if (isBlocked) {
            unblockMutation.mutate();
        } else {
            blockMutation.mutate();
        }
    };

    const isLoading = blockMutation.isLoading || unblockMutation.isLoading;

    if (asButton) {
        return (
            <Button
                variant="outline"
                size="sm"
                onClick={handleClick}
                disabled={isLoading}
                className={isBlocked ? 'text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700' : 'text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive'}
            >
                {isLoading ? t('processing') : (isBlocked ? t('unblock') : t('block'))}
            </Button>
        );
    }

   return (
        <span
            onClick={handleClick}
            className={`${isLoading ? 'cursor-not-allowed opacity-50' : ''}`}
        >
            {isBlocked ? t('unblockUser') : t('blockUser')}
        </span>
    );
};

export default BlockUserMenuItem;