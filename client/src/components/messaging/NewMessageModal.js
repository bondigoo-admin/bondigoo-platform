
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.tsx';
import { Input } from '../ui/input.tsx';
import { Button } from '../ui/button.tsx';
import { Loader2, X, UserPlus, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import { searchMessageRecipients, createGroupConversation } from '../../services/messageAPI';
import { debounce } from 'lodash';
import { logger } from '../../utils/logger';
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar.tsx";

import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../ui/badge.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { Label } from '../ui/label.tsx';

const SEARCH_DELAY = 300;
const MIN_SEARCH_LENGTH = 0; // Allow queries of any length

const NewMessageModal = ({ isOpen, onClose, onRecipientSelect }) => {
  const { t } = useTranslation(['messaging', 'common']);
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [isBroadcast, setIsBroadcast] = useState(false);

  const queryClient = useQueryClient();
const createGroupMutation = useMutation(createGroupConversation, {
    onSuccess: (newConversation) => {
        queryClient.invalidateQueries('conversations');
        onRecipientSelect(newConversation);
        toast.success(t('messaging:groupCreatedSuccess', 'Group created successfully!'));
        resetState();
        onClose();
    },
    onError: (error) => {
        logger.error('[NewMessageModal] Failed to create group', { error: error.message });
        toast.error(error.message || t('messaging:groupCreatedError', 'Failed to create group.'));
    },
});

  // Debounce the search term update
  const debouncedSetSearch = useCallback(debounce((value) => {
    setDebouncedSearchTerm(value);
    logger.debug('[NewMessageModal] Debounced search term updated', {
      searchTerm: value,
      timestamp: new Date().toISOString(),
    });
  }, SEARCH_DELAY), []);

  useEffect(() => {
    debouncedSetSearch(searchTerm);
    return () => debouncedSetSearch.cancel();
  }, [searchTerm, debouncedSetSearch]);

  // React Query for fetching search results
  const { data: searchResults = [], isLoading, error, isFetching } = useQuery(
    ['messageRecipientSearch', debouncedSearchTerm],
    () => {
      logger.info('[NewMessageModal] Executing search query', {
        query: debouncedSearchTerm || 'INITIAL_LIST',
        timestamp: new Date().toISOString(),
      });
      return searchMessageRecipients(debouncedSearchTerm);
    },
    {
      enabled: isInputFocused, // Run query when input is focused
      staleTime: 5 * 60 * 1000,
      keepPreviousData: true,
      onSuccess: (data) => {
        logger.debug('[NewMessageModal] Search results received', {
          query: debouncedSearchTerm || 'INITIAL_LIST',
          resultCount: data.length,
          results: data.map(user => ({
            _id: user._id,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            profilePicture: user.profilePicture,
            hasProfilePicture: !!user.profilePicture?.url,
            hasCoachProfilePicture: !!user.coachProfilePicture?.url,
          })),
          timestamp: new Date().toISOString(),
        });
      },
      onError: (err) => {
        logger.error('[NewMessageModal] Search query failed', {
          query: debouncedSearchTerm || 'INITIAL_LIST',
          error: err.message,
          timestamp: new Date().toISOString(),
        });
      },
    }
  );

  const getInitials = (firstName = '', lastName = '') => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

const handleSelect = (recipient) => {
    if (!selectedRecipients.some(r => r._id === recipient._id)) {
      logger.info('[NewMessageModal] Recipient added to selection', {
        recipientId: recipient._id,
        timestamp: new Date().toISOString(),
      });
      setSelectedRecipients(prev => [...prev, recipient]);
    }
    setSearchTerm('');
    setDebouncedSearchTerm('');
};

const handleRemoveRecipient = (recipientId) => {
    setSelectedRecipients(prev => prev.filter(r => r._id !== recipientId));
};

const resetState = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setSelectedRecipients([]);
    setGroupName('');
    setIsBroadcast(false);
};

const handleCreate = () => {
    if (createGroupMutation.isLoading) return;

    if (selectedRecipients.length > 1) {
        createGroupMutation.mutate({
            memberIds: selectedRecipients.map(r => r._id),
            name: groupName,
            type: isBroadcast ? 'broadcast' : 'group',
        });
    } else if (selectedRecipients.length === 1) {
        onRecipientSelect(selectedRecipients[0]);
        resetState();
        onClose();
    }
};

const handleClose = () => {
    resetState();
    onClose();
};

  const handleFocus = () => {
    setIsInputFocused(true);
    logger.debug('[NewMessageModal] Search input focused', {
      timestamp: new Date().toISOString(),
    });
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsInputFocused(false);
      logger.debug('[NewMessageModal] Search input blurred', {
        timestamp: new Date().toISOString(),
      });
    }, 150);
  };

  useEffect(() => {
    if (isInputFocused && searchResults.length > 0) {
      logger.debug('[NewMessageModal] Rendering search results', {
        query: debouncedSearchTerm || 'INITIAL_LIST',
        resultCount: searchResults.length,
        timestamp: new Date().toISOString(),
      });
    }
  }, [isInputFocused, searchResults, debouncedSearchTerm]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('messaging:newMessageTitle')}</DialogTitle>
          <DialogDescription>{t('messaging:newMessageDescription')}</DialogDescription>
        </DialogHeader>

<div className="flex flex-col gap-4">
    <div className="relative">
        {selectedRecipients.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 border-b">
                {selectedRecipients.map(recipient => (
                    <Badge key={recipient._id} variant="secondary" className="flex items-center gap-1.5">
                        {recipient.firstName} {recipient.lastName}
                        <button onClick={() => handleRemoveRecipient(recipient._id)} className="rounded-full hover:bg-muted-foreground/20 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </Badge>
                ))}
            </div>
        )}
        <Input
            type="text"
            placeholder={t('messaging:searchPlaceholder', 'Search or select a recipient...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            aria-label={t('messaging:searchRecipients')}
            className="pt-2 border-t-0 rounded-t-none"
        />
        {(isLoading || isFetching) && <Loader2 className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />}
    </div>

    {selectedRecipients.length > 1 && (
        <div className="flex flex-col gap-4">
            <Input
                type="text"
                placeholder={t('messaging:groupNamePlaceholder', 'Group Name')}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                aria-label={t('messaging:groupName')}
            />
            {user.role === 'coach' && (
                <div className="flex items-center space-x-2">
                    <Checkbox id="broadcast-channel" checked={isBroadcast} onCheckedChange={setIsBroadcast} />
                    <Label htmlFor="broadcast-channel" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {t('messaging:broadcastChannelLabel', 'Broadcast Channel (only you can post)')}
                    </Label>
                </div>
            )}
        </div>
    )}

    <div className="min-h-[16rem] max-h-[16rem] overflow-y-auto border rounded-md">
        {/* The existing search results rendering logic remains here */}
        {isInputFocused && error && (
          <div className="flex items-center justify-center h-full gap-2 p-4 text-sm font-medium text-destructive">
            <AlertCircle size={18} /> {t('common:errors.searchFailed')}
          </div>
        )}
        {isInputFocused && !error && !isFetching && searchResults.length === 0 && (
          <div className="flex items-center justify-center h-full p-4 text-sm text-center text-muted-foreground">
            {debouncedSearchTerm.length > 0
              ? t('common:noResultsFound')
              : t('messaging:noRecipientsSuggestion', 'No connections found')}
          </div>
        )}
        {isInputFocused && !error && searchResults.length > 0 && (
          <ul className="p-1 space-y-1">
            {searchResults.filter(user => !selectedRecipients.some(r => r._id === user._id)).map((user) => (
              <li key={user._id}>
                <button
                  className="flex items-center w-full gap-3 p-2 text-left transition-colors rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => handleSelect(user)}
                  aria-label={`Select ${user.firstName} ${user.lastName}`}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Avatar className="w-10 h-10">
                    <AvatarImage
                      src={
                        user.role === 'coach' && user.coachProfilePicture?.url
                          ? user.coachProfilePicture.url
                          : user.profilePicture?.url || ''
                      }
                      alt={`${user.firstName} ${user.lastName}`}
                    />
                    <AvatarFallback>{getInitials(user.firstName, user.lastName)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">
                    {user.firstName} {user.lastName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
</div>

<DialogFooter className="mt-4">
    <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto">{t('common:cancel')}</Button>
    <Button
        onClick={handleCreate}
        disabled={createGroupMutation.isLoading || selectedRecipients.length === 0 || (selectedRecipients.length > 1 && !groupName.trim())}
        className="w-full sm:w-auto"
    >
        {createGroupMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {selectedRecipients.length > 1 ? t('messaging:createGroupButton', 'Create Group') : t('messaging:startChatButton', 'Start Chat')}
    </Button>
</DialogFooter>

      </DialogContent>
    </Dialog>
  );
};

NewMessageModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onRecipientSelect: PropTypes.func.isRequired,
};

export default NewMessageModal;