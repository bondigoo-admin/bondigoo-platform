import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import {
  User,
  Notebook,
  Lock,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Banknote,
  CircleDot,
  Signal,
  UserCog,
  ShieldCheck,
  CalendarDays,
  Clock,
  History,
  CheckCircle2,
  File as FileIcon,
  Bug
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../../ui/alert-dialog.tsx';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '../../../ui/dialog.tsx';
import { Button } from '../../../ui/button.tsx';
import { Card, CardContent, CardHeader, CardFooter, CardTitle } from '../../../ui/card.tsx';
import { Separator } from '../../../ui/separator.jsx';
import { Avatar, AvatarFallback, AvatarImage } from '../../../ui/avatar.tsx';
import { Textarea } from '../../../ui/textarea.tsx';
import { Badge } from '../../../ui/badge.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../ui/tabs.tsx';
import { useAdminTicketDetails, useAddSupportMessage, useUpdateSupportTicket } from '../../../../hooks/useAdmin.js';
import { useAuth } from '../../../../contexts/AuthContext.js';
import ContextualMessageInput from '../../../messaging/ContextualMessageInput';
import MessageList from '../../../messaging/MessageList';
import { useMessages } from '../../../../hooks/useMessages.js';

const getInitials = (firstName = '', lastName = '') => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
};

const TicketDetailView = ({ ticketId }) => {
    const { t } = useTranslation(['admin', 'common', 'messaging']);
    const [internalNote, setInternalNote] = useState('');
    const [showRemoveWarningModal, setShowRemoveWarningModal] = useState(false);
    const [removalReason, setRemovalReason] = useState('');
    const [isRemovingWarning, setIsRemovingWarning] = useState(false);
    const { user: loggedInUser } = useAuth();

    const { data, isLoading, isError, refetch: refetchTicketDetails } = useAdminTicketDetails(ticketId);
    const addSupportMessageMutation = useAddSupportMessage();
    const updateTicketMutation = useUpdateSupportTicket();

    const ticket = data?.ticket;
    const internalNotes = data?.internalNotes || [];
    const user = ticket?.user;
    
    const conversationId = ticket?.conversationId;
    const { 
        messages: publicMessages, 
        isLoading: messagesLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingMore
    } = useMessages(conversationId);
    
    const isTicketResolved = ticket?.status === 'resolved' || ticket?.status === 'closed';

    const mockConversation = useMemo(() => {
        if (!ticket || !user || !loggedInUser) return null;
        return {
            _id: conversationId,
            type: 'one-on-one',
            participants: [
                { _id: user._id, ...user },
                { _id: loggedInUser._id, ...loggedInUser },
            ],
        };
    }, [ticket, user, loggedInUser, conversationId]);
    
    const handlePublicMessageSent = () => {
        if (!conversationId) {
            toast.success(t('messaging:messageSentSuccess'));
            refetchTicketDetails();
        }
    };

 const handleAddNote = () => {
        if (!internalNote.trim() || addSupportMessageMutation.isLoading) return;
        addSupportMessageMutation.mutate({ ticketId, content: internalNote }, {
            onSuccess: () => { toast.success(t('moderation.support.noteAddedSuccess')); setInternalNote(''); },
            onError: (error) => toast.error(t('moderation.support.noteAddedError', { error: error.message }))
        });
    };
    
    const handleResolveTicket = () => {
        updateTicketMutation.mutate({ ticketId, updateData: { status: 'resolved' } }, {
            onSuccess: () => { toast.success(t('moderation.support.ticketResolvedSuccess', 'Ticket marked as resolved.')); },
            onError: (error) => toast.error(t('moderation.support.ticketResolveError', { error: error.message, defaultValue: `Failed to resolve ticket: ${error.message}` }))
        });
    };

    const handleProfileNavigation = (e, targetUser) => {
        e.preventDefault();
        if (!targetUser?._id) return;
        let targetUrl = (loggedInUser?._id === targetUser._id) ? '/profile' : (targetUser.role === 'coach') ? `/coach/${targetUser._id}` : `/profile/${targetUser._id}`;
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
    };

    const getTrustScoreVariant = (score) => {
        if (score < 30) return 'destructive';
        if (score < 60) return 'warning';
        return 'success';
    };

    const handleRemoveWarning = async () => {
        if (!removalReason.trim()) {
            toast.error(t('moderation.support.removalReasonRequired'));
            return;
        }
        setIsRemovingWarning(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/users/${user._id}/remove-warning`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ reason: removalReason })
            });
    
            const responseData = await response.json();
    
            if (!response.ok) {
                throw new Error(responseData.message || 'Failed to remove warning.');
            }
    
            toast.success(t('moderation.support.warningRemovedSuccess'));
            refetchTicketDetails();
            setShowRemoveWarningModal(false);
            setRemovalReason('');
        } catch (error) {
            toast.error(error.message || t('common:error.generic'));
        } finally {
            setIsRemovingWarning(false);
        }
    };

    const formatCurrency = (amount, currency) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: currency || 'CHF' }).format(amount || 0);
    
    if (isLoading) return <div className="flex h-full items-center justify-center p-6 bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    if (isError) return <div className="flex h-full flex-col items-center justify-center bg-background text-destructive p-6"><AlertTriangle className="mb-2 h-8 w-8" /><p className="text-lg">{t('common:error.generic')}</p><p className="text-sm text-muted-foreground">{t('moderation.support.errorLoadingTicket')}</p></div>;
    if (!ticket) return <div className="flex h-full items-center justify-center p-6 bg-background"><p className="text-lg text-muted-foreground">{!ticketId ? t('moderation.support.noTicketSelected') : t('moderation.support.ticketNotFound')}</p></div>;

    return (
        <div className="flex h-full flex-col bg-background p-4 md:p-6">
            <div className='flex-shrink-0 space-y-6'>
                <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <Avatar className="h-12 w-12"><AvatarImage src={user.profilePicture?.url} /><AvatarFallback>{getInitials(user.firstName, user.lastName)}</AvatarFallback></Avatar>
                            <div className="min-w-0"><p className="text-base font-semibold truncate">{user.firstName} {user.lastName}</p><p className="text-xs text-muted-foreground truncate">{user.email}</p></div>
                        </div>
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"><a href={`/admin/users?search=${user.email}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-5 text-sm pt-4">
                        <div className="flex items-start gap-2"><CircleDot className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><dt className="text-muted-foreground">{t('common:status.title')}</dt><dd className="font-semibold">{t(`common:status.${ticket.status.toLowerCase()}`, ticket.status)}</dd></div></div>
                        <div className="flex items-start gap-2"><Signal className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><dt className="text-muted-foreground">{t('common:priority')}</dt><dd className="font-semibold">{t(`common:priority.${ticket.priority.toLowerCase()}`, ticket.priority)}</dd></div></div>
                        <div className="flex items-start gap-2"><UserCog className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><dt className="text-muted-foreground">{t('moderation.support.assignee')}</dt><dd className="font-semibold">{ticket.assignee ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}` : t('common:unassigned')}</dd></div></div>
                        <div className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><dt className="text-muted-foreground">{t('moderation.support.trustScore')}</dt><dd><Badge variant={getTrustScoreVariant(user.trustScore)}>{user.trustScore}</Badge></dd></div></div>
                        <div className="flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><dt className="text-muted-foreground">{t('moderation.support.warnings')}</dt><dd className="font-semibold">{user.warningCount ?? user.moderation?.warningsCount ?? 0}</dd></div></div>
                        <div className="flex items-start gap-2"><Banknote className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><dt className="text-muted-foreground">{t('moderation.support.ltv')}</dt><dd className="font-semibold">{formatCurrency(user.ltv?.amount, user.ltv?.currency)}</dd></div></div>
                        <div className="flex items-start gap-2"><CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><dt className="text-muted-foreground">{t('moderation.support.memberSince')}</dt><dd className="font-semibold">{format(new Date(user.createdAt), 'd MMM yyyy')}</dd></div></div>
                        <div className="flex items-start gap-2"><Clock className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><dt className="text-muted-foreground">{t('common:created')}</dt><dd className="font-semibold">{format(new Date(ticket.createdAt), 'd MMM yyyy, HH:mm')}</dd></div></div>
                        <div className="flex items-start gap-2"><History className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><dt className="text-muted-foreground">{t('common:lastActivity')}</dt><dd className="font-semibold">{format(new Date(ticket.updatedAt), 'd MMM yyyy, HH:mm')}</dd></div></div>
                    </CardContent>
                    <CardFooter className="border-t pt-4 mt-4"><div className="grid grid-cols-2 gap-2 w-full"><Button variant="outline" size="sm" onClick={(e) => handleProfileNavigation(e, user)}><User className="mr-2 h-3 w-3" /> {t('common:profile')}</Button><Button asChild variant="outline" size="sm"><a href={`/admin/financials?search=${user.email}`} target="_blank" rel="noopener noreferrer"><Banknote className="mr-2 h-3 w-3" /> {t('common:ledger')}</a></Button>
                    {(user.warningCount > 0 || user.moderation?.warningsCount > 0) && !isTicketResolved && (
                                <Button variant="outline" size="sm" onClick={() => setShowRemoveWarningModal(true)}>
                                    <AlertTriangle className="mr-2 h-3 w-3" /> {t('moderation.support.removeWarning')}
                                </Button>
                            )}
                            {!isTicketResolved && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button size="sm" className="col-start-2">
                                            <CheckCircle2 className="mr-2 h-3 w-3" /> {t('moderation.support.resolveTicket', 'Resolve Ticket')}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>{t('moderation.support.confirmResolveTitle', 'Are you sure?')}</AlertDialogTitle>
                                            <AlertDialogDescription>{t('moderation.support.confirmResolveDesc', 'This will mark the ticket as resolved. You can send a final message to the user before resolving if needed. This action cannot be undone.')}</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleResolveTicket} disabled={updateTicketMutation.isLoading}>
                                                {updateTicketMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                {t('moderation.support.confirmAndResolve', 'Yes, Resolve Ticket')}
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                    </CardFooter>
                </Card>
            </div>
            
                       <div className="flex-1 flex flex-col min-h-0 pt-6">
                <header className="mb-4 flex-shrink-0">
                    <div className="flex items-center gap-4"><h1 className="text-2xl font-bold tracking-tight truncate">{ticket.subject}</h1><Badge variant={ticket.status === 'open' ? 'success' : (isTicketResolved ? 'secondary' : 'default')}>{t(`common:status.${ticket.status.toLowerCase()}`, ticket.status)}</Badge></div>
                    <p className="text-sm text-muted-foreground">{t('moderation.support.ticketId')}: {ticket._id}</p>
                </header>
                <Tabs defaultValue="conversation" className="flex-1 grid grid-rows-[auto_1fr] gap-4 min-h-0">
                    <TabsList className="grid w-full grid-cols-2 flex-shrink-0"><TabsTrigger value="conversation"><User className="mr-2 h-4 w-4" /> {t('moderation.support.conversation')}</TabsTrigger><TabsTrigger value="internal-notes"><Notebook className="mr-2 h-4 w-4" /> {t('moderation.support.internalNotes')}</TabsTrigger></TabsList>
                    
                    <TabsContent value="conversation" className="grid grid-rows-[1fr_auto] min-h-0">
                        {conversationId ? (
                             <>
                                <div className="flex-1 overflow-y-auto p-4 message-list">
                                     <MessageList
                                        messages={publicMessages}
                                        isLoading={messagesLoading}
                                        fetchNextPage={fetchNextPage}
                                        hasNextPage={hasNextPage || false}
                                        isFetchingMore={isFetchingMore || false}
                                        activeConversationId={conversationId}
                                        currentUserId={loggedInUser._id}
                                        onDeleteMessage={() => toast.error(t('moderation.support.deleteNotSupported', "Deleting messages from tickets is not supported."))}
                                        activeConversation={mockConversation}
                                    />
                                </div>
                                <div className="flex-shrink-0 border-t border-border p-4">
                                    <ContextualMessageInput
                                    recipientId={user._id}
                                    contextType="support_ticket"
                                    contextId={ticketId}
                                    conversationId={conversationId}
                                    placeholderText={t('moderation.support.typeDirectMessagePlaceholder', { name: user.firstName, defaultValue: `Send a direct message to ${user.firstName}...` })}
                                    onMessageSent={handlePublicMessageSent}
                                    disabled={isTicketResolved}
                                />
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center p-4">
                               <p className="font-semibold mb-2">{t('moderation.support.noPublicConversation', 'No Public Conversation')}</p>
                               <p className="text-sm text-muted-foreground mb-4">{t('moderation.support.startConversationPrompt', 'Send a message to start a private conversation with the user.')}</p>
                                  <ContextualMessageInput
                                    recipientId={user._id}
                                    contextType="support_ticket"
                                    contextId={ticketId}
                                    conversationId={conversationId}
                                    placeholderText={t('moderation.support.typeFirstMessagePlaceholder', { name: user.firstName, defaultValue: `Send first message to ${user.firstName}...` })}
                                    onMessageSent={handlePublicMessageSent}
                                    disabled={isTicketResolved}
                                />
                            </div>
                        )}
                    </TabsContent>

                   <TabsContent value="internal-notes" className="flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto p-4 bg-amber-50/50 dark:bg-amber-900/10 rounded-lg">
                            <div className="space-y-4">
                                {internalNotes.length > 0 ? internalNotes.map(note => (
                                    <div key={note._id} className="flex gap-3">
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={note.author.profilePicture?.url} alt={note.author.firstName}/>
                                            <AvatarFallback>{getInitials(note.author.firstName, note.author.lastName)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-sm">{note.author.firstName} {note.author.lastName}</p>
                                                <p className="text-xs text-muted-foreground">{format(new Date(note.createdAt), 'd MMM yyyy, HH:mm')}</p>
                                            </div>
                                            <p className="text-sm text-foreground/90 whitespace-pre-wrap">{note.content}</p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center text-sm text-muted-foreground py-8">{t('moderation.support.noInternalNotes', 'No internal notes yet.')}</div>
                                )}
                            </div>
                        </div>
                        <div className="flex-shrink-0 border-t border-border p-4">
                            <Textarea 
                                value={internalNote} 
                                onChange={(e) => setInternalNote(e.target.value)} 
                                placeholder={t('moderation.support.addInternalNotePlaceholder')} 
                                className="mb-2" 
                                disabled={addSupportMessageMutation.isLoading || isTicketResolved} 
                            />
                            <Button onClick={handleAddNote} className="w-full md:w-auto" disabled={!internalNote.trim() || addSupportMessageMutation.isLoading || isTicketResolved}>
                                {addSupportMessageMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                                {t('moderation.support.addNote')}
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
      <Dialog open={showRemoveWarningModal} onOpenChange={setShowRemoveWarningModal}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('moderation.support.confirmWarningRemoval')}</DialogTitle>
                        <DialogDescription>
                            {t('moderation.support.confirmWarningRemovalDesc', { name: `${user.firstName} ${user.lastName}` })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <label htmlFor="removalReason" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {t('moderation.support.reasonForRemoval')}
                        </label>
                        <Textarea
                            id="removalReason"
                            placeholder={t('moderation.support.removalReasonPlaceholder')}
                            value={removalReason}
                            onChange={(e) => setRemovalReason(e.target.value)}
                            className="min-h-[100px]"
                            disabled={isRemovingWarning}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowRemoveWarningModal(false)} disabled={isRemovingWarning}>
                            {t('common:cancel')}
                        </Button>
                        <Button onClick={handleRemoveWarning} disabled={isRemovingWarning || !removalReason.trim()}>
                            {isRemovingWarning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('moderation.support.confirmAndRemove')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {ticket.ticketType === 'feedback_report' && (
          <Card className="mt-6">
              <CardHeader>
                  <CardTitle className="flex items-center">
                      <Bug className="mr-2 h-5 w-5" />
                      {t('admin:feedback.technicalDetails')}
                  </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                  {ticket.contextSnapshot && (
                      <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2">
                          <div>
                              <p className="font-semibold text-muted-foreground">URL</p>
                              <a href={ticket.contextSnapshot.url} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">{ticket.contextSnapshot.url}</a>
                          </div>
                          <div>
                              <p className="font-semibold text-muted-foreground">Viewport</p>
                              <p>{ticket.contextSnapshot.viewport}</p>
                          </div>
                          <div>
                              <p className="font-semibold text-muted-foreground">Screen Resolution</p>
                              <p>{ticket.contextSnapshot.screenResolution}</p>
                          </div>
                          <div className="md:col-span-2">
                              <p className="font-semibold text-muted-foreground">Browser</p>
                              <p className="text-xs">{ticket.contextSnapshot.browser}</p>
                          </div>
                      </div>
                  )}
                  {ticket.attachments && ticket.attachments.length > 0 && (
                      <>
                          <Separator />
                          <div>
                              <p className="font-semibold text-muted-foreground mb-2">{t('common:attachments')}</p>
                              <div className="flex flex-wrap gap-4">
                                  {ticket.attachments.map(att => (
                                      <a key={att.public_id} href={att.url} target="_blank" rel="noopener noreferrer" className="relative h-24 w-24 rounded-md border p-1 bg-background hover:ring-2 hover:ring-primary">
                                          {att.resource_type === 'image' ? (
                                              <img src={att.url} alt={att.filename} className="h-full w-full object-contain" />
                                          ) : (
                                              <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
                                                  <FileIcon className="h-8 w-8" />
                                                  <p className="mt-1 max-w-full truncate text-center text-xs">{att.filename}</p>
                                              </div>
                                            )}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        )}
    </div>
    );
};

export default TicketDetailView;