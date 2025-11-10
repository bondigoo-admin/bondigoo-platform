import React, { useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog.tsx';
import { Button } from '../ui/button.tsx';
import { ScrollArea } from '../ui/scroll-area.jsx';
import { Users, Settings, UserPlus, Edit3, LogOut, ShieldCheck, User } from 'lucide-react';
import { useDraggableDialog } from '../../hooks/useDraggableDialog';

const getInitials = (firstName = '', lastName = '') => `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.toUpperCase();

const GroupInfoModal = ({ isOpen, onClose, conversation, currentUserId, onOpenEdit, onOpenAddMembers, onOpenManageMembers, onOpenSettings, onLeaveGroup }) => {
    const { t } = useTranslation(['messaging', 'common']);
    const modalRef = useRef(null);
    const { handleMouseDownOnTitle, resetDialogPosition } = useDraggableDialog(modalRef);

    const { admins, members } = useMemo(() => {
        const admins = [];
        const members = [];
        (conversation?.participants || []).forEach(p => {
            if (p.conversationRole === 'admin') {
                admins.push(p);
            } else {
                members.push(p);
            }
        });
        return { admins, members };
    }, [conversation?.participants]);

    if (!conversation) return null;

    const currentUserIsAdmin = conversation.participants?.find(p => p._id === currentUserId)?.conversationRole === 'admin';
    const canAddMembers = currentUserIsAdmin || conversation.settings?.allowMemberInvites;
    const canEditInfo = currentUserIsAdmin || conversation.settings?.allowMemberInfoEdit;

    const handleClose = () => {
        resetDialogPosition();
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent ref={modalRef} className="flex flex-col p-0 max-w-md h-[90vh] md:h-[70vh]">
                <DialogHeader onMouseDown={handleMouseDownOnTitle} className="p-6 pb-2 cursor-move space-y-4">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                            <AvatarImage src={conversation.groupAvatar?.url} alt={conversation.name} />
                            <AvatarFallback className="text-4xl">{conversation.name?.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                            <DialogTitle className="text-2xl font-bold tracking-tight">{conversation.name}</DialogTitle>
                            <DialogDescription className="mt-1 text-sm text-muted-foreground">
                                {t('messaging:groupWithParticipants', { count: conversation.participants?.length || 0 })}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex flex-col min-h-0 px-6">
                    {conversation.description && (
                        <div className="p-3 my-2 text-sm text-center border rounded-lg bg-muted/50 dark:bg-muted/30">
                            {conversation.description}
                        </div>
                    )}

                    {/* UPDATED: Removed 'md:grid-cols-4' to force 2 columns on all screen sizes */}
                    <div className="grid grid-cols-2 gap-2 my-4">
                        {canEditInfo && <Button variant="outline" onClick={onOpenEdit}><Edit3 className="w-4 h-4 mr-2" />{t('common:edit')}</Button>}
                        {canAddMembers && <Button variant="outline" onClick={onOpenAddMembers}><UserPlus className="w-4 h-4 mr-2" />{t('messaging:add')}</Button>}
                        {currentUserIsAdmin && <Button variant="outline" onClick={onOpenManageMembers}><Users className="w-4 h-4 mr-2" />{t('messaging:manage')}</Button>}
                        {currentUserIsAdmin && <Button variant="outline" onClick={onOpenSettings}><Settings className="w-4 h-4 mr-2" />{t('messaging:settings')}</Button>}
                    </div>

                    <ScrollArea className="flex-1 -mx-6 px-6">
                        <div className="py-2 space-y-4">
                            <div>
                                <h4 className="mb-2 text-sm font-semibold tracking-wide uppercase text-muted-foreground">{t('messaging:admins', { count: admins.length })}</h4>
                                {admins.map(p => (
                                    <div key={p._id} className="flex items-center p-2 rounded-md hover:bg-muted">
                                        <Avatar className="w-10 h-10 mr-3">
                                            <AvatarImage src={p.coachProfilePicture?.url || p.profilePicture?.url} />
                                            <AvatarFallback>{getInitials(p.firstName, p.lastName)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{`${p.firstName} ${p.lastName}`}</p>
                                            <p className="flex items-center text-xs text-primary"><ShieldCheck className="w-3.5 h-3.5 mr-1" /> {t('messaging:admin')}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <h4 className="mb-2 text-sm font-semibold tracking-wide uppercase text-muted-foreground">{t('messaging:members', { count: members.length })}</h4>
                                {members.map(p => (
                                    <div key={p._id} className="flex items-center p-2 rounded-md hover:bg-muted">
                                        <Avatar className="w-10 h-10 mr-3">
                                            <AvatarImage src={p.coachProfilePicture?.url || p.profilePicture?.url} />
                                            <AvatarFallback>{getInitials(p.firstName, p.lastName)}</AvatarFallback>
                                        </Avatar>
                                        <p className="font-medium truncate">{`${p.firstName} ${p.lastName}`}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </ScrollArea>
                </div>

                <div className="p-6 pt-2 border-t">
                    <Button variant="destructive" className="w-full" onClick={onLeaveGroup}>
                        <LogOut className="w-4 h-4 mr-2" />{t('messaging:leaveGroup')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

GroupInfoModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    conversation: PropTypes.object,
    currentUserId: PropTypes.string,
    onOpenEdit: PropTypes.func.isRequired,
    onOpenAddMembers: PropTypes.func.isRequired,
    onOpenManageMembers: PropTypes.func.isRequired,
    onOpenSettings: PropTypes.func.isRequired,
    onLeaveGroup: PropTypes.func.isRequired,
};

export default GroupInfoModal;