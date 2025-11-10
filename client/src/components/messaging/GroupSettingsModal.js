import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.tsx';
import { Button } from '../ui/button.tsx';
import { Label } from '../ui/label.tsx';
import { Switch } from '../ui/switch.tsx';
import { updateGroupSettings } from '../../services/messageAPI';
import { Loader2 } from 'lucide-react';
import { useDraggableDialog } from '../../hooks/useDraggableDialog';

const GroupSettingsModal = ({ isOpen, onClose, conversation }) => {
    const { t } = useTranslation(['messaging', 'common']);
    const [allowInvites, setAllowInvites] = useState(true);
    const [allowInfoEdit, setAllowInfoEdit] = useState(true);
    const queryClient = useQueryClient();
    const modalRef = useRef(null);
    const { handleMouseDownOnTitle, resetDialogPosition } = useDraggableDialog(modalRef);

    useEffect(() => {
        if (conversation?.settings) {
            setAllowInvites(conversation.settings.allowMemberInvites);
            setAllowInfoEdit(conversation.settings.allowMemberInfoEdit);
        }
    }, [conversation]);

    const mutation = useMutation(updateGroupSettings, {
        onSuccess: () => {
           
            queryClient.invalidateQueries(['conversations']);
            handleClose();
        },
        onError: (error) => toast.error(error.message || t('common:errorGeneric'))
    });

    const handleSave = () => {
        const settingsUpdates = {
            allowMemberInvites: allowInvites,
            allowMemberInfoEdit: allowInfoEdit
        };
        mutation.mutate({ conversationId: conversation._id, settingsUpdates });
    };

    const handleClose = () => {
        resetDialogPosition();
        onClose();
    };
    
     const hasChanges =
      conversation?.settings?.allowMemberInvites !== allowInvites ||
      conversation?.settings?.allowMemberInfoEdit !== allowInfoEdit;

    // The problematic 'if' block that was here has been removed.

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
           <DialogContent ref={modalRef} className="sm:max-w-lg">
                <DialogHeader onMouseDown={handleMouseDownOnTitle} className="cursor-move">
                    <DialogTitle>{t('messaging:groupSettings')}</DialogTitle>
                    <DialogDescription>{t('messaging:groupSettingsDescription')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    <div className="flex items-center justify-between p-4 space-x-2 border rounded-lg">
                        <div className="flex-1 space-y-1">
                            <Label htmlFor="allow-invites" className="font-semibold">{t('messaging:allowMemberInvites')}</Label>
                            <p className="text-sm text-muted-foreground">{t('messaging:allowMemberInvitesDesc')}</p>
                        </div>
                        <Switch id="allow-invites" checked={allowInvites} onCheckedChange={setAllowInvites} />
                    </div>
                    <div className="flex items-center justify-between p-4 space-x-2 border rounded-lg">
                        <div className="flex-1 space-y-1">
                            <Label htmlFor="allow-edit" className="font-semibold">{t('messaging:allowMemberInfoEdit')}</Label>
                            <p className="text-sm text-muted-foreground">{t('messaging:allowMemberInfoEditDesc')}</p>
                        </div>
                        <Switch id="allow-edit" checked={allowInfoEdit} onCheckedChange={setAllowInfoEdit} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={handleClose}>{t('common:cancel')}</Button>
                    <Button onClick={handleSave} disabled={!hasChanges || mutation.isLoading}>
                        {mutation.isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {t('common:save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

GroupSettingsModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    conversation: PropTypes.object,
};

export default GroupSettingsModal;