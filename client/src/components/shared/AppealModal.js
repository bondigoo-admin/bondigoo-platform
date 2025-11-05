import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModerationActionDetails, useSubmitAppeal } from '../../hooks/useAdmin';
import { toast } from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.tsx';
import { Button } from '../ui/button.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Badge } from '../ui/badge.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { Loader2, AlertCircle } from 'lucide-react';
import { useUserSettings } from '../../hooks/useUserSettings';
import { formatUserDateTime } from '../../utils/dateUtils';

const DetailRow = ({ label, value, isBlockquote = false }) => {
    if (!value) return null;
    return (
        <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {isBlockquote ? (
                <blockquote className="border-l-2 pl-3 italic text-sm text-foreground">{value}</blockquote>
            ) : (
                <div className="text-sm text-foreground">{value}</div>
            )}
        </div>
    );
};

const AppealModal = ({ isOpen, onClose, auditId }) => {
    const { t } = useTranslation(['common', 'admin']);
    const [appealText, setAppealText] = useState('');
    const { settings, isLoading: isSettingsLoading } = useUserSettings();
    const { data, isLoading, isError } = useModerationActionDetails(auditId);
    const submitAppealMutation = useSubmitAppeal();

    const handleSubmit = () => {
        if (!appealText.trim()) {
            toast.error(t('admin:appeal.reasonRequired'));
            return;
        }

        submitAppealMutation.mutate({
            subject: t('admin:appeal.ticketSubject', { auditId }),
            initialMessage: appealText,
            ticketType: 'appeal',
            relatedAuditLog: auditId,
        }, {
            onSuccess: (response) => {
                toast.success(t('admin:appeal.submitSuccess', { ticketId: response.ticket._id }));
                onClose();
            },
            onError: (error) => {
                toast.error(error.response?.data?.message || t('error.generic'));
            }
        });
    };
    
    const getActionBadge = (action) => {
        switch (action) {
            case 'flag_upheld_review_hidden': return <Badge variant="destructive">{t('admin:actions.reviewHidden')}</Badge>;
            case 'user_flag_upheld_warning': return <Badge variant="warning">{t('admin:actions.accountWarned')}</Badge>;
            case 'user_flag_upheld_suspension': return <Badge variant="destructive">{t('admin:actions.accountSuspended')}</Badge>;
            default: return <Badge variant="secondary">{action}</Badge>;
        }
    };


    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t('admin:appeal.title')}</DialogTitle>
                    <DialogDescription>{t('admin:appeal.description')}</DialogDescription>
                </DialogHeader>
                <div className="flex-1 grid md:grid-cols-2 gap-6 overflow-y-auto p-1 pr-4">
                    <Card className="self-start">
                        <CardHeader>
                            <CardTitle>{t('admin:appeal.decisionDetails')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {isLoading ? (
                                <>
                                    <Skeleton className="h-8 w-1/2" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-16 w-full" />
                                </>
                            ) : isError ? (
                                <div className="flex items-center space-x-2 text-destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <p>{t('error.generic')}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-center gap-4">
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">{t('admin:appeal.actionTaken')}</p>
                                            {getActionBadge(data.action)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">{t('admin:appeal.date')}</p>
                                            {isSettingsLoading ? (
                                                <Skeleton className="h-5 w-32 mt-1" />
                                            ) : (
                                                <p className="text-sm font-semibold">{formatUserDateTime(data.createdAt, settings)}</p>
                                            )}
                                        </div>
                                    </div>
                                    <DetailRow label={t('admin:appeal.violatedGuideline')} value={<Badge variant="outline">{t(`admin:flagReasons.${data.violatedGuideline}`, data.violatedGuideline)}</Badge>} />
                                    <DetailRow label={t('admin:appeal.originalContent')} value={data.originalContent} isBlockquote />
                                    <DetailRow label={t('admin:appeal.moderatorNotes')} value={data.reason} isBlockquote />
                                </>
                            )}
                        </CardContent>
                    </Card>

                    <div className="space-y-4 self-start">
                        <h3 className="font-semibold text-lg">{t('admin:appeal.yourTurn')}</h3>
                        <p className="text-sm text-muted-foreground">{t('admin:appeal.formDescription')}</p>
                        <Textarea
                            placeholder={t('admin:appeal.formPlaceholder')}
                            value={appealText}
                            onChange={(e) => setAppealText(e.target.value)}
                            className="min-h-[150px] md:min-h-[200px]"
                            disabled={submitAppealMutation.isLoading}
                        />
                    </div>
                </div>
                <DialogFooter className="pt-4 border-t">
                    <Button variant="outline" onClick={onClose} disabled={submitAppealMutation.isLoading}>{t('cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={submitAppealMutation.isLoading || isLoading || isError}>
                        {submitAppealMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('admin:appeal.submitButton')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default AppealModal;