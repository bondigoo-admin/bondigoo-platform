import React, { useState, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.tsx';
import { Button } from '../ui/button.tsx';
import { ScrollArea } from '../ui/scroll-area.jsx';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '../ui/dropdown-menu.tsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog.tsx";
import { updateMemberRole, removeMemberFromGroup } from '../../services/messageAPI';
import { MoreHorizontal, ShieldCheck, User, Trash2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { useDraggableDialog } from '../../hooks/useDraggableDialog';

const getInitials = (firstName = '', lastName = '') => `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.toUpperCase();

const ManageMembersModal = ({ isOpen, onClose, conversation, currentUserId }) => {
    const { t } = useTranslation(['messaging', 'common']);
    const [userToRemove, setUserToRemove] = useState(null);
    const queryClient = useQueryClient();
    const modalRef = useRef(null);
    const { handleMouseDownOnTitle, resetDialogPosition } = useDraggableDialog(modalRef);

    const adminCount = useMemo(() => 
        conversation?.participants.filter(p => p.conversationRole === 'admin').length || 0,
        [conversation]
    );

    const mutationOptions = {
        onSuccess: () => {
            queryClient.invalidateQueries(['conversations']);
          
        },
        onError: (error) => toast.error(error.message || t('common:errorGeneric'))
    };

    const roleMutation = useMutation(updateMemberRole, mutationOptions);
    const removeMutation = useMutation(removeMemberFromGroup, { ...mutationOptions, onSuccess: () => {
        queryClient.invalidateQueries(['conversations']);
       
        setUserToRemove(null);
    }});

    const handleRoleChange = (memberId, newRole) => {
        roleMutation.mutate({ conversationId: conversation._id, memberId, newRole });
    };

    const confirmRemove = () => {
        if (userToRemove) {
            removeMutation.mutate({ conversationId: conversation._id, memberId: userToRemove._id });
        }
    };
    
    const handleClose = () => {
        resetDialogPosition();
        onClose();
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
                <DialogContent ref={modalRef} className="sm:max-w-lg h-[80vh] flex flex-col">
                    <DialogHeader onMouseDown={handleMouseDownOnTitle} className="cursor-move">
                        <DialogTitle>{t('messaging:manageMembers')}</DialogTitle>
                        <DialogDescription>{t('messaging:manageMembersDescription')}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="flex-1 -mx-6 px-6">
                        <div className="space-y-1">
                            {conversation?.participants.map(member => {
                                const isCurrentUser = member._id === currentUserId;
                                const isAdmin = member.conversationRole === 'admin';
                                const canBeDemoted = isAdmin && adminCount > 1;

                                return (
                                    <div key={member._id} className="flex items-center p-2 rounded-md hover:bg-muted">
                                        <Avatar className="w-10 h-10 mr-3">
                                            <AvatarImage src={member.coachProfilePicture?.url || member.profilePicture?.url} />
                                            <AvatarFallback>{getInitials(member.firstName, member.lastName)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{`${member.firstName} ${member.lastName}`}</p>
                                            <p className={`flex items-center text-xs ${isAdmin ? 'text-primary' : 'text-muted-foreground'}`}>
                                                {isAdmin ? <><ShieldCheck className="w-3.5 h-3.5 mr-1" />{t('messaging:admin')}</> : <><User className="w-3.5 h-3.5 mr-1" />{t('messaging:member')}</>}
                                            </p>
                                        </div>
                                        {!isCurrentUser && (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    {!isAdmin && <DropdownMenuItem onClick={() => handleRoleChange(member._id, 'admin')}><ChevronUp className="w-4 h-4 mr-2" />{t('messaging:promoteToAdmin')}</DropdownMenuItem>}
                                                    {canBeDemoted && <DropdownMenuItem onClick={() => handleRoleChange(member._id, 'member')}><ChevronDown className="w-4 h-4 mr-2" />{t('messaging:demoteToMember')}</DropdownMenuItem>}
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setUserToRemove(member)}><Trash2 className="w-4 h-4 mr-2" />{t('messaging:removeFromGroup')}</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button onClick={handleClose}>{t('common:done')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!userToRemove} onOpenChange={() => setUserToRemove(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('messaging:removeMemberConfirmTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('messaging:removeMemberConfirmDesc', { name: `${userToRemove?.firstName} ${userToRemove?.lastName}` })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmRemove} disabled={removeMutation.isLoading}>
                            {removeMutation.isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {t('common:remove')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

ManageMembersModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    conversation: PropTypes.object,
    currentUserId: PropTypes.string,
};

export default ManageMembersModal;