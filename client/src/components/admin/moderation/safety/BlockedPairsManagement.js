import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminBlockedPairs, useForceUnblockUser } from '../../../../hooks/useAdmin';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../../ui/table.tsx';
import { Button } from '../../../ui/button.tsx';
import { Skeleton } from '../../../ui/skeleton.jsx';
import { Textarea } from '../../../ui/textarea.tsx';
import { toast } from 'react-hot-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../ui/alert-dialog.tsx';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';

const BlockedPairsManagement = () => {
    const { t } = useTranslation(['admin', 'common']);
    const [filters, setFilters] = useState({ page: 1, limit: 15 });
    const { data, isLoading } = useAdminBlockedPairs(filters);
    const forceUnblockMutation = useForceUnblockUser();

    const [unblockModal, setUnblockModal] = useState({ isOpen: false, blocker: null, blocked: null, reason: '' });

    const handleForceUnblock = () => {
        const { blocker, blocked, reason } = unblockModal;
        if (!reason.trim()) {
            toast.error(t('moderation.safety.unblockReasonRequired'));
            return;
        }
        forceUnblockMutation.mutate({ blockerId: blocker._id, blockedId: blocked._id, reason }, {
            onSuccess: () => {
                toast.success(t('moderation.safety.unblockSuccess'));
                setUnblockModal({ isOpen: false, blocker: null, blocked: null, reason: '' });
            },
            onError: (err) => toast.error(err.response?.data?.message || t('common:error.generic'))
        });
    };
    
    const UserLink = ({ user }) => (
        <Button variant="link" asChild className="p-0 h-auto font-normal text-sm">
            <Link to={`/admin/users/detail/${user._id}`} target="_blank">{user.firstName} {user.lastName}</Link>
        </Button>
    );

    return (
        <div className="space-y-4">
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('moderation.safety.blocker')}</TableHead>
                            <TableHead>{t('moderation.safety.blockedUser')}</TableHead>
                            <TableHead>{t('moderation.safety.dateBlocked')}</TableHead>
                            <TableHead className="text-right">{t('common:actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 10 }).map((_, i) => (
                                <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                            ))
                        ) : data?.blockedPairs?.length > 0 ? (
                            data.blockedPairs.map((pair, index) => (
                                <TableRow key={`${pair.blocker._id}-${pair.blocked._id}-${index}`}>
                                    <TableCell><UserLink user={pair.blocker} /></TableCell>
                                    <TableCell><UserLink user={pair.blocked} /></TableCell>
                                    <TableCell>{formatDistanceToNow(new Date(pair.createdAt), { addSuffix: true })}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => setUnblockModal({ isOpen: true, blocker: pair.blocker, blocked: pair.blocked, reason: '' })}
                                        >
                                            {t('moderation.safety.forceUnblock')}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                             <TableRow><TableCell colSpan={4} className="h-24 text-center">{t('moderation.safety.noBlocks')}</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog open={unblockModal.isOpen} onOpenChange={(isOpen) => setUnblockModal(prev => ({ ...prev, isOpen }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('moderation.safety.confirmUnblockTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                           {t('moderation.safety.confirmUnblockDesc', 'You are about to force unblock {{blockedName}} from {{blockerName}}. This action is logged. Please provide a mandatory reason.', { blockedName: `${unblockModal.blocked?.firstName} ${unblockModal.blocked?.lastName}`, blockerName: `${unblockModal.blocker?.firstName} ${unblockModal.blocker?.lastName}` })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                     <div className="py-4">
                        <Textarea
                            placeholder={t('moderation.safety.unblockReasonPlaceholder')}
                            value={unblockModal.reason}
                            onChange={(e) => setUnblockModal(prev => ({ ...prev, reason: e.target.value }))}
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleForceUnblock} disabled={!unblockModal.reason.trim() || forceUnblockMutation.isLoading}>
                            {t('moderation.safety.forceUnblock')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default BlockedPairsManagement;