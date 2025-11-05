import React, { useState } from 'react';
import { useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../ui/dialog.tsx';
import { Button } from '../../ui/button.tsx';
import { Badge } from '../../ui/badge.tsx';
import { Avatar, AvatarFallback } from '../../ui/avatar.tsx';
import { Textarea } from '../../ui/textarea.tsx';
import { toast } from 'react-hot-toast';
import { useResolveReviewFlag, useResolveUserFlag } from '../../../hooks/useAdmin';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';

const UserCard = ({ user, title }) => {
    const { t } = useTranslation(['admin']);
    const getTrustScoreVariant = (score) => {
        if (score < 30) return 'destructive';
        if (score < 60) return 'warning';
        return 'success';
    };

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center space-x-4">
                    <Avatar>
                        <AvatarFallback>{user?.firstName?.[0]}{user?.lastName?.[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="text-sm font-semibold">{user?.firstName} {user?.lastName}</p>
                        <p className="text-xs text-muted-foreground">{user?.email}</p>
                        <Badge variant={getTrustScoreVariant(user?.trustScore)} className="mt-1">
                            {t('moderation.trustScore', 'Trust Score: {{score}}', { score: user?.trustScore ?? 'N/A' })}
                        </Badge>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

const ManageFlagModal = ({ item, flag, isOpen, onClose }) => {
    const { t } = useTranslation(['admin', 'common']);
    const [reason, setReason] = useState('');
    const resolveReviewFlagMutation = useResolveReviewFlag();
    const resolveUserFlagMutation = useResolveUserFlag();

    if (!item || !flag) return null;

    const isReview = !!item.comment;
    const author = isReview ? item.raterId : item;
    const mutation = isReview ? resolveReviewFlagMutation : resolveUserFlagMutation;

const handleSubmit = (action) => {
        if (!reason.trim()) {
            toast.error(t('moderation.reasonRequired'));
            return;
        }

        const payload = {
            flagId: flag._id,
            action,
            reason
        };

        if (isReview) {
            payload.reviewId = item._id;
        } else {
            payload.userId = item._id;
        }

        mutation.mutate(payload, {
            onSuccess: () => {
                toast.success(t('moderation.flagResolved'));
                onClose();
            },
            onError: (error) => {
                toast.error(error.response?.data?.message || t('common:error.generic'));
            },
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{t('moderation.manageFlagTitle')}</DialogTitle>
                    <DialogDescription>{t('moderation.manageFlagDesc')}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 md:grid-cols-2">
                    <UserCard user={author} title={isReview ? t('moderation.reviewAuthor') : t('moderation.userReported')} />
                    <UserCard user={flag.flaggedBy} title={t('moderation.flaggedBy')} />
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">{t('moderation.flagDetails')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <p className="text-sm"><strong className="font-semibold">{t('moderation.reason')}:</strong> {t(`moderation.flagReasons.${flag.reason}`, flag.reason)}</p>
                        {isReview && <blockquote className="mt-2 border-l-2 pl-4 italic text-sm">{`"${item.comment}"`}</blockquote>}
                    </CardContent>
                </Card>
                 <div className="space-y-2">
                    <label htmlFor="auditReason" className="text-sm font-medium">{t('moderation.auditReasonLabel')}</label>
                    <Textarea
                        id="auditReason"
                        placeholder={t('moderation.auditReasonPlaceholder')}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="min-h-[80px]"
                    />
                </div>
                <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>{t('common:cancel')}</Button>
                    {isReview ? (
                         <>
                            <Button variant="action-pay" onClick={() => handleSubmit('dismiss')} disabled={mutation.isLoading}>
                                {mutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('moderation.actions.dismiss')}
                            </Button>
                            <Button variant="action-decline" onClick={() => handleSubmit('hide')} disabled={mutation.isLoading}>
                                 {mutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('moderation.actions.hideReview')}
                            </Button>
                        </>
                    ) : (
                        <>
                           <Button variant="action-pay" onClick={() => handleSubmit('dismiss')} disabled={mutation.isLoading}>
                                {mutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('moderation.actions.dismiss')}
                            </Button>
                             <Button variant="action-star" onClick={() => handleSubmit('warn')} disabled={mutation.isLoading}>
                                {mutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('moderation.actions.warnUser')}
                            </Button>
                            <Button variant="action-decline" onClick={() => handleSubmit('suspend')} disabled={mutation.isLoading}>
                                 {mutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('moderation.actions.suspendUser')}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ManageFlagModal;