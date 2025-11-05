import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import { flagEntity } from '../../services/userAPI';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.tsx';
import { Button } from '../ui/button.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group.jsx';
import { Label } from '../ui/label.tsx';
import { Loader2 } from 'lucide-react';

const ReportModal = ({ isOpen, onClose, entityId, entityType, onReportSuccess }) => {
    const { t } = useTranslation(['common', 'admin']);
    const [reason, setReason] = useState('');
    const [details, setDetails] = useState('');

    const flagMutation = useMutation(flagEntity, {
        onSuccess: () => {
            onReportSuccess();
            onClose();
        },
        onError: (error) => {
            toast.error(error.response?.data?.message || t('error.generic'));
        },
    });

    const handleSubmit = () => {
        if (!reason) {
            toast.error(t('admin:moderation.reasonRequired'));
            return;
        }
        flagMutation.mutate({ entityId, entityType, reason, details });
    };

    const getReasonsForEntityType = () => {
        const allReasons = [
            { id: 'spam', labelKey: 'admin:flagReasons.spam' },
            { id: 'harassment', labelKey: 'admin:flagReasons.harassment' },
            { id: 'hate_speech', labelKey: 'admin:flagReasons.hate_speech' },
            { id: 'misinformation', labelKey: 'admin:flagReasons.misinformation' },
            { id: 'inappropriate_content', labelKey: 'admin:flagReasons.inappropriate_content' },
            { id: 'violence', labelKey: 'admin:flagReasons.violence' },
            { id: 'intellectual_property', labelKey: 'admin:flagReasons.intellectual_property' },
        ];
        
        if (entityType === 'user' || entityType === 'program') {
            allReasons.push({ id: 'impersonation', labelKey: 'admin:flagReasons.impersonation' });
        }
        
        if (entityType === 'user') {
            allReasons.push({ id: 'inappropriate_profile', labelKey: 'admin:flagReasons.inappropriate_profile' });
        }
        
        allReasons.push({ id: 'other', labelKey: 'admin:flagReasons.other' });
        
        return allReasons;
    };
    
    const reasons = getReasonsForEntityType();

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t(`report_${entityType}_title`, `Report ${entityType}`)}</DialogTitle>
                    <DialogDescription>{t(`report_${entityType}_desc`, `Help us understand the problem. Why are you reporting this ${entityType}?`)}</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <RadioGroup value={reason} onValueChange={setReason}>
                        {reasons.map((r) => (
                             <div key={r.id} className="flex items-center space-x-2">
                                <RadioGroupItem value={r.id} id={`report-${entityType}-${r.id}`} />
                                <Label htmlFor={`report-${entityType}-${r.id}`}>{t(r.labelKey, r.id)}</Label>
                            </div>
                        ))}
                    </RadioGroup>
                    <Textarea
                        placeholder={t('reportDetailsPlaceholder', 'Provide additional details (optional)...')}
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        disabled={flagMutation.isLoading}
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={flagMutation.isLoading}>{t('cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={flagMutation.isLoading || !reason}>
                        {flagMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('submitReport', 'Submit Report')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ReportModal;