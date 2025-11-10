import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { debounce } from 'lodash';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { ScrollArea } from '../ui/scroll-area.jsx';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.tsx';
import { addMembersToGroup, searchMessageRecipients } from '../../services/messageAPI';
import { X, UserPlus, Loader2, Search, AlertCircle } from 'lucide-react';
import { useDraggableDialog } from '../../hooks/useDraggableDialog';

const getInitials = (firstName = '', lastName = '') => `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.toUpperCase();

const AddMembersModal = ({ isOpen, onClose, conversation }) => {
    const { t } = useTranslation(['messaging', 'common']);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [selectedUsers, setSelectedUsers] = useState([]);
    
    const queryClient = useQueryClient();
    const modalRef = useRef(null);
    const { handleMouseDownOnTitle, resetDialogPosition } = useDraggableDialog(modalRef);

    const existingMemberIds = useMemo(() => conversation?.participants.map(p => p._id) || [], [conversation]);

    // Debounce search term to prevent excessive API calls
    const debouncedSetSearch = useCallback(
        debounce((value) => {
            setDebouncedSearchTerm(value);
        }, 500),
        []
    );

    useEffect(() => {
        debouncedSetSearch(searchTerm);
        return () => debouncedSetSearch.cancel();
    }, [searchTerm, debouncedSetSearch]);

    // Fetch search results using react-query, enabled only when search term is long enough
    const { data: searchResults = [], isFetching, error } = useQuery(
        ['addMemberSearch', debouncedSearchTerm],
        () => searchMessageRecipients(debouncedSearchTerm),
        {
            enabled: debouncedSearchTerm.length >= 2,
            keepPreviousData: true,
            staleTime: 5 * 60 * 1000, // 5 minutes
            onError: () => toast.error(t('common:errorSearch')),
        }
    );

    // Memoize filtered results to exclude existing group members and already selected users
    const filteredResults = useMemo(() => {
        return searchResults.filter(user => !existingMemberIds.includes(user._id));
    }, [searchResults, existingMemberIds]);

    const addMemberMutation = useMutation(addMembersToGroup, {
        onSuccess: () => {
            queryClient.invalidateQueries(['conversations']);
            queryClient.invalidateQueries(['conversation', conversation?._id]);
            toast.success(t('messaging:membersAddedSuccess'));
            handleClose();
        },
        onError: (err) => toast.error(err.message || t('common:errorGeneric'))
    });

    const handleSelectUser = (user) => {
        if (!selectedUsers.some(su => su._id === user._id)) {
            setSelectedUsers([...selectedUsers, user]);
        }
    };
    
    const handleDeselectUser = (userId) => {
        setSelectedUsers(selectedUsers.filter(su => su._id !== userId));
    };

    const handleAddMembers = () => {
        const memberIds = selectedUsers.map(u => u._id);
        addMemberMutation.mutate({ conversationId: conversation._id, memberIds });
    };

    const handleClose = () => {
        setSearchTerm('');
        setDebouncedSearchTerm('');
        setSelectedUsers([]);
        resetDialogPosition();
        onClose();
    };

    const renderSearchResults = () => {
        if (isFetching) {
            return (
                <div className="flex justify-center items-center h-full pt-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            );
        }

        if (error) {
            return (
                <div className="flex items-center justify-center h-full gap-2 p-4 pt-8 text-sm font-medium text-destructive">
                    <AlertCircle size={18} /> {t('common:errorSearch')}
                </div>
            );
        }
        
        if (debouncedSearchTerm.length < 2) {
             return (
                <p className="py-8 text-sm text-center text-muted-foreground">
                    {t('common:searchHint', 'Type at least 2 characters to search.')}
                </p>
            );
        }

        if (filteredResults.length === 0) {
            return <p className="py-8 text-sm text-center text-muted-foreground">{t('common:noResultsFound')}</p>;
        }

        return (
             <div className="py-2">
                {filteredResults.map(user => (
                    <div key={user._id} className="flex items-center p-2 rounded-md hover:bg-muted">
                        <Avatar className="w-10 h-10 mr-3"><AvatarImage src={user.profilePicture?.url} /><AvatarFallback>{getInitials(user.firstName, user.lastName)}</AvatarFallback></Avatar>
                        <span className="flex-1 font-medium">{`${user.firstName} ${user.lastName}`}</span>
                        <Button size="sm" variant="outline" onClick={() => handleSelectUser(user)} disabled={selectedUsers.some(su => su._id === user._id)}>
                            {selectedUsers.some(su => su._id === user._id) ? t('messaging:added', 'Added') : t('messaging:add', 'Add')}
                        </Button>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent ref={modalRef} className="sm:max-w-lg h-[80vh] flex flex-col">
                <DialogHeader onMouseDown={handleMouseDownOnTitle} className="cursor-move">
                    <DialogTitle>{t('messaging:addMembers')}</DialogTitle>
                    <DialogDescription>{t('messaging:addMembersDescription')}</DialogDescription>
                </DialogHeader>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder={t('common:searchUsers')} 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        className="pl-9" 
                    />
                </div>

                {selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-muted/50">
                        {selectedUsers.map(user => (
                            <div key={user._id} className="flex items-center gap-2 px-2 py-1 text-sm rounded-full bg-background">
                                <Avatar className="w-5 h-5"><AvatarImage src={user.profilePicture?.url} /><AvatarFallback className="text-xs">{getInitials(user.firstName, user.lastName)}</AvatarFallback></Avatar>
                                <span>{`${user.firstName} ${user.lastName}`}</span>
                                <button onClick={() => handleDeselectUser(user._id)} className="p-0.5 rounded-full hover:bg-destructive hover:text-destructive-foreground"><X size={12} /></button>
                            </div>
                        ))}
                    </div>
                )}

                <ScrollArea className="flex-1 -mx-6 px-6 border-t border-b">
                    {renderSearchResults()}
                </ScrollArea>
                
                <DialogFooter>
                    <Button variant="ghost" onClick={handleClose}>{t('common:cancel')}</Button>
                    <Button onClick={handleAddMembers} disabled={selectedUsers.length === 0 || addMemberMutation.isLoading}>
                        {addMemberMutation.isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {!addMemberMutation.isLoading && <UserPlus className="w-4 h-4 mr-2" />}
                        {t('messaging:addXMembers', { count: selectedUsers.length })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

AddMembersModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    conversation: PropTypes.object,
};

export default AddMembersModal;