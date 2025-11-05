import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet.jsx';
import { useMessages } from '../../hooks/useMessages.js';
import { createOrGetConversation } from '../../services/messageAPI';
import { useAuth } from '../../contexts/AuthContext.js';
import MessageList from '../messaging/MessageList';
import EnhancedMessageInput from '../messaging/EnhancedMessageInput';
import { Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale/de';
import { enUS } from 'date-fns/locale/en-US';
import { logger } from '../../utils/logger';

const AssignmentFeedbackSheet = ({ submission, isOpen, onOpenChange }) => {
    const { t, i18n } = useTranslation(['programs', 'messaging']);
    const { user: coach } = useAuth();
    const queryClient = useQueryClient();
    const [conversationId, setConversationId] = useState(null);

    const dateLocales = {
        de,
        en: enUS,
    };

    const getConversationMutation = useMutation(createOrGetConversation, {
        onSuccess: (response) => {
            const newConversationId = response?._id;
            if (newConversationId) {
                logger.info('[AssignmentFeedbackSheet] Conversation created/retrieved successfully.', { conversationId: newConversationId });
                setConversationId(newConversationId);
            } else {
                throw new Error("Received success response but no conversation ID was found in the payload.");
            }
        },
        onError: (error) => {
            logger.error('[AssignmentFeedbackSheet] Failed to get or create conversation.', { error: error.message });
            toast.error(t('messaging:errorCreatingConversation'));
            onOpenChange(false);
        }
    });

    useEffect(() => {
        if (isOpen && submission && !conversationId && getConversationMutation.isIdle) {
            logger.debug('[AssignmentFeedbackSheet] Effect triggered to fetch conversation.', { submission });
            getConversationMutation.mutate({
                recipientId: submission.user._id,
                contextType: 'program_assignment_submission',
                contextId: { enrollmentId: submission.enrollmentId, lessonId: submission.lessonId },
            });
        }
    }, [isOpen, submission, conversationId, getConversationMutation]);

    const handleSheetOpenChange = (open) => {
        onOpenChange(open);
        if (!open) {
            logger.debug('[AssignmentFeedbackSheet] Sheet closing, resetting state.');
            setConversationId(null);
            getConversationMutation.reset();
            if (conversationId) {
                queryClient.removeQueries(['messages', 'infiniteList', conversationId]);
            }
        }
    };

    const { messages, isLoading: messagesLoading, fetchNextPage, hasNextPage, isFetchingMore } = useMessages(conversationId, !!conversationId);

    const activeConversation = useMemo(() => {
        if (!submission || !coach || !conversationId) return null;
        return {
            _id: conversationId,
            type: 'one-on-one',
            participants: [{ _id: submission.user._id, ...submission.user }, { _id: coach._id, ...coach }],
        };
    }, [submission, coach, conversationId]);
    
    const handleMessageDelete = () => {
        toast.error(t('messaging:deleteNotSupportedHere', 'Deleting messages is not supported in this view.'));
    };

    return (
        <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
            <SheetContent className="w-full sm:max-w-xl md:max-w-2xl flex flex-col p-0">
               {submission && (
                    <SheetHeader className="p-6 border-b">
                        <SheetTitle className="text-xl">{t('feedback_for')} {submission.user.firstName}</SheetTitle>
                        <SheetDescription>
                            {t('on_lesson', { lessonTitle: submission.lessonTitle })} - {t('submitted_on')} {format(new Date(submission.submittedAt), 'PP', { locale: dateLocales[i18n.language] || enUS })}
                        </SheetDescription>
                    </SheetHeader>
                )}

                <div className="flex-1 flex flex-col min-h-0">
                    {getConversationMutation.isLoading && (
                        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                    )}
                    {getConversationMutation.isError && (
                         <div className="flex-1 flex flex-col items-center justify-center text-destructive p-4 text-center">
                            <AlertCircle className="h-8 w-8 mb-2" /><p>{t('messaging:errorCreatingConversation')}</p>
                        </div>
                    )}
                    
                    {conversationId && (
                        <>
                            <div className="flex-1 overflow-y-auto p-4">
                                <MessageList
                                    messages={messages}
                                    isLoading={messagesLoading}
                                    fetchNextPage={fetchNextPage}
                                    hasNextPage={hasNextPage || false}
                                    isFetchingMore={isFetchingMore || false}
                                    activeConversationId={conversationId}
                                    currentUserId={coach._id}
                                    activeConversation={activeConversation}
                                    onDeleteMessage={handleMessageDelete}
                                />
                            </div>
                            <div className="p-4 border-t bg-background">
                                <EnhancedMessageInput
                                    recipientId={submission.user._id}
                                    conversationId={conversationId}
                                    contextType="program_assignment_submission"
                                    contextId={{ enrollmentId: submission.enrollmentId, lessonId: submission.lessonId }}
                                    onMessageSent={() => {/*empty*/}}
                                />
                            </div>
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};

export default AssignmentFeedbackSheet;