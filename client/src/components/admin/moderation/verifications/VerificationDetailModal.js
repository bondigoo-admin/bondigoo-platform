import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../../ui/dialog.tsx';
import { Button } from '../../../ui/button.tsx';
import { RadioGroup, RadioGroupItem } from '../../../ui/radio-group.jsx';
import { Label } from '../../../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/select.tsx';
import { Textarea } from '../../../ui/textarea.tsx';
import { Calendar } from '../../../ui/calendar.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/popover.jsx';
import { CalendarIcon, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '../../../../lib/utils.js';
import { format } from 'date-fns';
import { useVerificationDocumentUrl, useResolveVerification } from '../../../../hooks/useAdmin';
import { toast } from 'react-hot-toast';
import { Badge } from '../../../ui/badge.tsx';

const REJECTION_REASONS = [
    { key: 'doc_illegible' },
    { key: 'name_mismatch' },
    { key: 'doc_expired' },
    { key: 'wrong_doc_type' },
    { key: 'other' },
];

const VerificationDetailModal = ({ request, isOpen, onClose }) => {
    const { t } = useTranslation(['admin', 'common']);
    const [action, setAction] = useState('approve');
    const [expiryDate, setExpiryDate] = useState();
    const [rejectionReasonKey, setRejectionReasonKey] = useState('');
    const [adminNotes, setAdminNotes] = useState('');

    const { data: doc, isLoading: isLoadingUrl } = useVerificationDocumentUrl(
        request?.coach._id,
        request?.registry.name,
        isOpen
    );

    const resolveMutation = useResolveVerification();

    const handleSubmit = () => {
        const payload = {
            coachUserId: request.coach._id,
            registryName: request.registry.name,
            action,
        };

        if (action === 'approve') {
            if (!expiryDate) {
                toast.error(t('moderation.verifications.expiryDateRequired'));
                return;
            }
            payload.expiryDate = expiryDate.toISOString();
        } else {
            if (!rejectionReasonKey) {
                toast.error(t('moderation.verifications.rejectionReasonRequired'));
                return;
            }
            payload.rejectionReasonKey = rejectionReasonKey;
            payload.adminNotes = adminNotes;
        }

        resolveMutation.mutate(payload, {
            onSuccess: () => {
                toast.success(t('moderation.verifications.actionSuccess'));
                onClose();
            },
            onError: (error) => toast.error(error.message || t('common:error.generic')),
        });
    };

    if (!request) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-4xl grid-rows-[auto_1fr_auto] max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle>{t('moderation.verifications.modalTitle')}</DialogTitle>
                    <DialogDescription>
                        {t('moderation.verifications.modalDescription', { name: `${request.coach.firstName} ${request.coach.lastName}` })}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid md:grid-cols-2 gap-6 py-4 overflow-y-auto">
                    <div className="space-y-4">
                        <div className="p-4 border rounded-lg">
                             <h3 className="font-semibold mb-2">{t('moderation.verifications.coachDetails')}</h3>
                             <div><strong>{t('common:name')}:</strong> {request.coach.firstName} {request.coach.lastName} <a href={`/admin/users?userIds[]=${request.coach._id}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="inline h-4 w-4 ml-1" /></a></div>
                              <div className="flex items-center">
                                  <strong className="mr-2">{t('moderation.support.trustScore')}:</strong> <Badge>{request.coach.trustScore}</Badge>
                              </div>
                             <h3 className="font-semibold mt-4 mb-2">{t('moderation.verifications.submissionDetails')}</h3>
                             <p><strong>{t('moderation.verifications.registry')}:</strong> {request.registry.name}</p>
                             <p><strong>{t('moderation.verifications.therapistId')}:</strong> {request.registry.therapistId || 'N/A'}</p>
                             <p><strong>{t('moderation.verifications.filename')}:</strong> {request.registry.verificationDocument.filename}</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                            <h3 className="font-semibold mb-2">{t('common:actions')}</h3>
                            <RadioGroup value={action} onValueChange={setAction} className="mb-4">
                                <div className="flex items-center space-x-2"><RadioGroupItem value="approve" id="approve" /><Label htmlFor="approve">{t('common:approve')}</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="reject" id="reject" /><Label htmlFor="reject">{t('common:reject')}</Label></div>
                            </RadioGroup>

                            {action === 'approve' && (
                                <div className="space-y-2">
                                    <Label>{t('moderation.verifications.validUntil')}</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !expiryDate && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {expiryDate ? format(expiryDate, "PPP") : <span>{t('common:pickDate')}</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={expiryDate} onSelect={setExpiryDate} initialFocus /></PopoverContent>
                                    </Popover>
                                </div>
                            )}

                            {action === 'reject' && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>{t('moderation.verifications.rejectionReason')}</Label>
                                        <Select onValueChange={setRejectionReasonKey} value={rejectionReasonKey}>
                                            <SelectTrigger><SelectValue placeholder={t('moderation.verifications.selectReason')} /></SelectTrigger>
                                            <SelectContent>{REJECTION_REASONS.map(r => <SelectItem key={r.key} value={r.key}>{t(`moderation.verifications.reasons.${r.key}`)}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{t('moderation.verifications.internalNotes')}</Label>
                                        <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder={t('moderation.verifications.internalNotesPlaceholder')} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="border rounded-lg bg-muted/20 flex items-center justify-center overflow-hidden min-h-[500px]">
                       {isLoadingUrl && <Loader2 className="h-8 w-8 animate-spin" />}
                      {doc?.secureUrl && (
                           <div className="w-full h-full relative group">
                              <iframe
                                   src={`${doc.secureUrl}#view=Fit&toolbar=0&navpanes=0`}
                                   className="w-full h-full border-0"
                                   title="Verification Document Preview"
                               />
                               <a
                                   href={doc.secureUrl}
                                   target="_blank"
                                   rel="noopener noreferrer"
                                   className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                                   aria-label={t('moderation.verifications.openInNewTab', 'Open document in new tab')}
                               >
                                   <ExternalLink className="pointer-events-auto h-12 w-12 cursor-pointer text-slate-700 drop-shadow-lg" />
                               </a>
                           </div>
                       )}
                       {!isLoadingUrl && !doc?.secureUrl && <p className="text-destructive">{t('moderation.verifications.docLoadError')}</p>}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t('common:cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={resolveMutation.isLoading}>
                        {resolveMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('common:submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default VerificationDetailModal;