import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
// useNavigate is no longer needed
import { getUserConnections, respondToConnection, cancelConnectionRequest, removeConnection } from '../services/connectionAPI';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationSocket } from '../contexts/SocketContext';
import { toast } from 'react-hot-toast';
import { Check, X, Loader2, MoreHorizontal, Trash2, UserPlus, Users, Hourglass, ShieldX } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar.tsx';
import { logger } from '../utils/logger';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardFooter } from './ui/card.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog.tsx';
import BlockUserMenuItem from './ui/BlockUserMenuItem';

const getInitials = (firstName = '', lastName = '') => {
  return `${(firstName?.charAt(0) || '')}${(lastName?.charAt(0) || '')}`.toUpperCase();
};

const getUserId = (user) => {
  if (!user) return null;
  return user._id ? user._id.toString() : user.id ? user.id.toString() : null;
};

export default function ConnectionsTab({ isCondensed = false }) {
  const { user: loggedInUser } = useAuth();
  const { socket, isConnected } = useNotificationSocket();
  const queryClient = useQueryClient();
  const { t } = useTranslation(['connections', 'common']);
  const userId = getUserId(loggedInUser);
  const [connectionToRemove, setConnectionToRemove] = useState(null);
  // Remove the useNavigate hook

  const { data: connectionsData, isLoading, error } = useQuery(
    ['connections', userId],
    () => getUserConnections(userId),
    { enabled: !!userId }
  );

  const mutationOptions = {
    onSuccess: () => queryClient.invalidateQueries(['connections', userId]),
    onError: (err, variables, context, mutation) => {
      const mutationName = mutation.mutationKey;
      logger.error(`[ConnectionsTab] Error in mutation ${mutationName}:`, err.response?.data || err.message);
      toast.error(t('common:errors.actionFailed', { action: 'update connection' }));
    },
  };

  const respondMutation = useMutation(respondToConnection, {
    ...mutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries(['connections', userId]);
      toast.success(t('successConnectionUpdate', 'Connection request updated successfully'));
    },
  });

  const cancelMutation = useMutation(cancelConnectionRequest, {
    ...mutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries(['connections', userId]);
      toast.success(t('cancelRequest', 'Request cancelled successfully'));
    },
  });

  const removeMutation = useMutation(removeConnection, {
    ...mutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries(['connections', userId]);
      toast.success(t('connectionRemoved', 'Connection removed successfully'));
      setConnectionToRemove(null);
    },
    onError: (err) => {
      logger.error('[ConnectionsTab] Error removing connection:', err.response?.data || err.message);
      toast.error(t('common:errors.actionFailed', { action: t('removeConnection', 'remove connection') }));
      setConnectionToRemove(null);
    },
  });

  const isActionInProgress = respondMutation.isLoading || cancelMutation.isLoading;

  const handleRespond = (connectionId, status) => respondMutation.mutate({ connectionId, status });
  const handleCancel = (connectionId) => cancelMutation.mutate(connectionId);
  const handleRemove = (connectionId) => removeMutation.mutate(connectionId);

   const handleProfileNavigation = (clickedUser) => {
    if (!clickedUser?._id) return;
    const clickedUserIdString = getUserId(clickedUser);
    const currentLoggedInUserIdString = getUserId(loggedInUser);
    let targetUrl;
    if (currentLoggedInUserIdString && clickedUserIdString === currentLoggedInUserIdString) {
      targetUrl = '/profile';
    } else if (clickedUser.role === 'coach') {
      targetUrl = `/coach/${clickedUser._id}`;
    } else {
      targetUrl = `/profile/${clickedUser._id}`;
    }
    // Revert to using window.open to open in a new tab
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  React.useEffect(() => {
    if (!userId || !socket || !isConnected) return;
    const invalidate = () => queryClient.invalidateQueries(['connections', userId]);
    socket.on('connection_request', invalidate);
    socket.on('connection_response', invalidate);
    socket.on('connection_removed', invalidate);
    socket.on('connectionRequestCancelled', invalidate);
    return () => {
      socket.off('connection_request', invalidate);
      socket.off('connection_response', invalidate);
      socket.off('connection_removed', invalidate);
      socket.off('connectionRequestCancelled', invalidate);
    };
  }, [userId, socket, isConnected, queryClient]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 h-64" role="status">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">{t('loadingConnections', 'Loading connections...')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center bg-destructive/10 text-destructive rounded-lg" role="alert">
        <p className='font-semibold'>{t('errorLoadingConnections', 'Error loading connections')}</p>
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }

   let connections = [];
  let blockedUserIds = [];

  if (connectionsData) {
    // Check if the API returned the new object structure or the old array structure
    if (Array.isArray(connectionsData)) {
      // This handles the old API response (an array of connections), fixing the blank page.
      connections = connectionsData;
    } else if (connectionsData.connections) {
      // This handles the new API response (an object with a 'connections' property)
      connections = connectionsData.connections;
      blockedUserIds = connectionsData.blockedUserIds || [];
    }
  }

  const validConnections = Array.isArray(connections)
    ? connections.filter(
        conn =>
          conn?.status &&
          conn.otherUser?._id &&
          !blockedUserIds.includes(conn.otherUser._id.toString())
      )
    : [];
  const pendingReceived = validConnections.filter(c => c.status === 'pending' && !c.initiatedByMe);
  const pendingSent = validConnections.filter(c => c.status === 'pending' && c.initiatedByMe);
  const accepted = validConnections.filter(c => c.status === 'accepted');

  const PendingRequestItem = ({ connection, type }) => {
    const otherUser = connection.otherUser;
    const profileFullName = `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim();

    let profilePictureUrl = '';
    if (otherUser.role === 'coach') {
        profilePictureUrl = otherUser.coachProfilePicture?.url || otherUser.profilePicture?.url || '';
    } else {
        profilePictureUrl = otherUser.profilePicture?.url || '';
    }

    const isBlocked = blockedUserIds.includes(otherUser._id.toString());

    return (
      <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border rounded-lg bg-card text-card-foreground">
        <div 
          className="flex items-center gap-4 cursor-pointer flex-grow min-w-0 group"
          onClick={() => handleProfileNavigation(otherUser)}
          role="link" tabIndex={0}
        >
          <Avatar className="h-11 w-11">
            <AvatarImage src={profilePictureUrl} alt={profileFullName} />
            <AvatarFallback>{getInitials(otherUser.firstName, otherUser.lastName)}</AvatarFallback>
          </Avatar>
          <div className='min-w-0'>
            <p className="font-semibold truncate group-hover:underline">{profileFullName}</p>
            <p className="text-sm text-muted-foreground">{t('wantsToConnect', 'wants to connect with you')}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 justify-end items-center">
          {type === 'received' && (
            <>
              <Button size="sm" onClick={(e) => { e.stopPropagation(); handleRespond(connection._id, 'accepted'); }} disabled={isActionInProgress}>
                <Check className="h-4 w-4 md:mr-2" /> <span className='hidden md:inline'>{t('common:accept', 'Accept')}</span>
              </Button>
              <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); handleRespond(connection._id, 'declined'); }} disabled={isActionInProgress}>
                 <X className="h-4 w-4 md:mr-2" /> <span className='hidden md:inline'>{t('common:decline', 'Decline')}</span>
              </Button>
            </>
          )}
          {type === 'sent' && (
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleCancel(connection._id); }} disabled={cancelMutation.isLoading && cancelMutation.variables === connection._id}>
              {cancelMutation.isLoading && cancelMutation.variables === connection._id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('cancelRequest', 'Cancel Request')}
            </Button>
          )}
          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={e => e.stopPropagation()}>
                      <MoreHorizontal className="h-5 w-5" />
                  </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                  <DropdownMenuItem onSelect={e => e.preventDefault()} className="flex items-center p-2 cursor-pointer">
                     <ShieldX className="mr-2 h-4 w-4" />
                     <BlockUserMenuItem 
                        targetUserId={otherUser._id} 
                        isBlocked={isBlocked} 
                        onActionComplete={() => handleCancel(connection._id)} 
                     />
                  </DropdownMenuItem>
              </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </li>
    );
  };
  
  const ConnectionCard = ({ connection, isBlocked }) => {
    const otherUser = connection.otherUser;
    const profileFullName = `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim();
    
    let profilePictureUrl = '';
    if (otherUser.role === 'coach') {
        profilePictureUrl = otherUser.coachProfilePicture?.url || otherUser.profilePicture?.url || '';
    } else {
        profilePictureUrl = otherUser.profilePicture?.url || '';
    }

    return (
      <Card className="flex flex-col text-center overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 dark:hover:border-primary/50">
        <CardContent 
            className="flex flex-col items-center gap-4 p-6 flex-grow cursor-pointer group"
            onClick={() => handleProfileNavigation(otherUser)}
        >
            <Avatar className="h-20 w-20 border-2 border-transparent group-hover:border-primary transition-colors">
                <AvatarImage src={profilePictureUrl} alt={profileFullName} />
                <AvatarFallback className="text-2xl">{getInitials(otherUser.firstName, otherUser.lastName)}</AvatarFallback>
            </Avatar>
            <div>
                <p className="font-bold text-lg truncate group-hover:text-primary transition-colors">{profileFullName}</p>
                <p className="text-sm text-muted-foreground">
                    {t('connectionDate', 'Connected since')} {new Date(connection.updatedAt).toLocaleDateString()}
                </p>
            </div>
        </CardContent>
       <CardFooter className="p-2 bg-muted/30 dark:bg-muted/20 border-t">
            <div className='w-full flex justify-end'>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={e => e.stopPropagation()}>
                            <MoreHorizontal className="h-5 w-5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                        <DropdownMenuItem onSelect={e => e.preventDefault()} className="flex items-center p-2 cursor-pointer">
                           <ShieldX className="mr-2 h-4 w-4" />
                           <BlockUserMenuItem 
                                targetUserId={otherUser._id} 
                                isBlocked={isBlocked} 
                                onActionComplete={() => queryClient.invalidateQueries(['connections', userId])} 
                           />
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setConnectionToRemove(connection)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>{t('removeConnection', 'Remove Connection')}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </CardFooter>
      </Card>
    );
  };

  return (
    <>
      <div className={`space-y-10 ${isCondensed ? 'p-0 space-y-6' : 'p-4 md:p-6'}`}>
        {!isCondensed && <h1 className="text-3xl font-bold tracking-tight">{t('yourNetwork', 'Your Network')}</h1>}

       {(pendingReceived.length > 0 || pendingSent.length > 0) && (
          <section className="space-y-4 max-w-4xl">
            <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
              <Hourglass className="h-6 w-6 text-primary" />
              {t('pendingRequests', 'Pending Requests')}
            </h2>
            {pendingReceived.length > 0 && (
                <ul className="space-y-3">
                  {pendingReceived.map(conn => <PendingRequestItem key={conn._id} connection={conn} type="received" />)}
                </ul>
            )}
            {pendingSent.length > 0 && (
                <ul className="space-y-3 pt-2">
                  {pendingSent.map(conn => <PendingRequestItem key={conn._id} connection={conn} type="sent" />)}
                </ul>
            )}
          </section>
        )}

        <section className="space-y-4">
          <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
            <Users className="h-6 w-6 text-primary" />
            {t('activeConnections', 'Active Connections')}
          </h2>
          {accepted.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed rounded-xl">
              <UserPlus className="h-16 w-16 text-muted-foreground/50" />
              <p className="mt-4 text-xl font-semibold">{t('noActiveConnections', 'No active connections yet')}</p>
              <p className="mt-1 text-muted-foreground">{t('noActiveConnectionsHint', 'Find and connect with coaches to build your network.')}</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {accepted.map(conn => {
                const isBlocked = blockedUserIds.includes(conn.otherUser?._id.toString());
                return <ConnectionCard key={conn._id} connection={conn} isBlocked={isBlocked} />;
              })}
            </ul>
          )}
        </section>
      </div>

      <AlertDialog open={!!connectionToRemove} onOpenChange={(open) => !open && setConnectionToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmRemovalTitle', 'Are you sure?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmRemovalDescription', 'This will permanently remove your connection with ')}
              <strong className='font-semibold'>{`${connectionToRemove?.otherUser?.firstName || ''} ${connectionToRemove?.otherUser?.lastName || ''}`}</strong>.
              {t('confirmRemovalConsequence', ' This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isLoading}>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleRemove(connectionToRemove._id)}
              disabled={removeMutation.isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('removeConnection', 'Remove Connection')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}