import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLessonComments, usePostComment, useUpdateComment, useDeleteComment } from '../../hooks/usePrograms';
import { useProgramPlayer } from '../../contexts/ProgramPlayerContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.tsx';
import { Button } from '../ui/button.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { Loader2, MoreHorizontal, Edit, Trash2, Info, CornerUpLeft, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { enUS, de, fr, es } from 'date-fns/locale';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog.tsx';
import { cn } from '../../lib/utils';

const CommentForm = ({ lessonId, parentCommentId = null, onCommentPosted }) => {
    const [content, setContent] = useState('');
    const { mutate: postComment, isLoading } = usePostComment(lessonId);
    const { user } = useAuth();
    const { t } = useTranslation(['programs', 'common']);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!content.trim()) return;
        postComment({ content, parentComment: parentCommentId }, {
            onSuccess: () => {
                setContent('');
                if (onCommentPosted) onCommentPosted();
            }
        });
    };

    const profilePictureUrl = user?.role === 'coach' && user?.coachProfilePicture?.url
        ? user.coachProfilePicture.url
        : user?.profilePicture?.url || '';
    
    const fallbackInitials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`;
    
    return (
        <form onSubmit={handleSubmit} className="flex items-start gap-3 sm:gap-4">
            <Avatar className="mt-1 h-9 w-9 flex-shrink-0">
                <AvatarImage src={profilePictureUrl} />
                <AvatarFallback>{fallbackInitials}</AvatarFallback>
            </Avatar>
            <div className="flex w-full flex-col overflow-hidden rounded-lg border bg-card">
                <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={parentCommentId ? t('addReplyPlaceholder', { ns: 'programs' }) : t('addQuestionPlaceholder', { ns: 'programs' })}
                    rows={parentCommentId ? 2 : 3}
                    className="min-h-[60px] resize-y border-0 bg-transparent p-3 text-sm shadow-none outline-none focus-visible:ring-0 md:p-4"
                />
                <div className="flex items-center justify-end gap-2 border-t bg-muted/50 p-2 px-3 dark:bg-muted/30">
                    {onCommentPosted && (
                         <Button type="button" variant="ghost" size="sm" onClick={onCommentPosted}>{t('common:cancel')}</Button>
                    )}
                    <Button type="submit" disabled={isLoading || !content.trim()} size="sm">
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('common:submit')}
                    </Button>
                </div>
            </div>
        </form>
    );
};

const CommentItem = ({ comment, lessonId }) => {
    const [showReplyForm, setShowReplyForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState(comment.content);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] =useState(false);

    const { user } = useAuth();
    const { program } = useProgramPlayer();
    const { t, i18n } = useTranslation(['common', 'programs']);
    
    const { mutate: updateComment, isLoading: isUpdating } = useUpdateComment(lessonId);
    const { mutate: deleteComment, isLoading: isDeleting } = useDeleteComment(lessonId);
    
    const dateFnsLocale = useMemo(() => {
        const locales = { en: enUS, de, fr, es };
        return locales[i18n.language] || enUS;
    }, [i18n.language]);

    const isOwner = user?._id === comment.user._id;
    const isCoach = user?._id === program?.coach?._id;

    const handleUpdate = (e) => {
        e.preventDefault();
        if (editedContent.trim() === comment.content) return;
        updateComment({ commentId: comment._id, content: editedContent }, {
            onSuccess: () => setIsEditing(false)
        });
    };
    
    const handleDelete = () => {
        deleteComment(comment._id, {
            onSuccess: () => setIsDeleteDialogOpen(false)
        });
    };

    const profilePictureUrl = comment.user.role === 'coach' && comment.user.coachProfilePicture?.url
        ? comment.user.coachProfilePicture.url
        : comment.user.profilePicture?.url || '';

    return (
        <div className="flex items-start gap-3 sm:gap-4">
            <Avatar className="h-9 w-9 flex-shrink-0">
                <AvatarImage src={profilePictureUrl} />
                <AvatarFallback>{comment.user.firstName?.[0]}{comment.user.lastName?.[0]}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
                <div className={cn("rounded-xl border p-3 md:p-4", isEditing ? "bg-transparent border-transparent p-0" : "bg-muted/60 dark:bg-muted/30 border-border/70")}>
                    
                    {!isEditing ? (
                        <div className="flex flex-col items-start">
                             <div className="flex flex-wrap items-center gap-x-2">
                                <span className="text-sm font-semibold text-foreground">{comment.user.firstName} {comment.user.lastName}</span>
                                <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: dateFnsLocale })}</span>
                                {comment.createdAt !== comment.updatedAt && <span className="text-xs text-muted-foreground">({t('edited', { ns: 'common' })})</span>}
                            </div>
                            
                            <p className="mt-1 w-full break-words whitespace-pre-wrap text-left text-sm text-foreground">
                                {comment.content}
                            </p>

                            <div className="-mr-2 -mb-2 mt-1 flex items-center self-end">
                                <Button variant="ghost" size="sm" onClick={() => setShowReplyForm(!showReplyForm)}>
                                    <CornerUpLeft className="h-4 w-4 sm:mr-2" />
                                    <span className="hidden sm:inline">{t('reply', {ns: 'programs'})}</span>
                                </Button>
                                {(isOwner || isCoach) && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {isOwner && (
                                                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                                                    <Edit className="mr-2 h-4 w-4" />
                                                    <span>{t('edit', { ns: 'common' })}</span>
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem onClick={() => setIsDeleteDialogOpen(true)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                <span>{t('delete', { ns: 'common' })}</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        </div>
                    ) : (
                         <form onSubmit={handleUpdate} className="w-full">
                            <div className="flex w-full flex-col overflow-hidden rounded-lg border border-input bg-background">
                                <Textarea 
                                    value={editedContent}
                                    onChange={(e) => setEditedContent(e.target.value)}
                                    className="min-h-[80px] resize-y border-0 bg-transparent p-3 text-sm shadow-none outline-none focus-visible:ring-0 md:p-4"
                                    rows={3}
                                />
                                <div className="flex justify-end gap-2 border-t bg-muted/50 p-2 px-3 dark:bg-muted/30">
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)}>{t('cancel', { ns: 'common' })}</Button>
                                    <Button type="submit" disabled={isUpdating || editedContent.trim() === comment.content} size="sm">
                                        {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        {t('save', { ns: 'common' })}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    )}
                </div>
                
                {showReplyForm && (
                    <div className="mt-4">
                        <CommentForm lessonId={lessonId} parentCommentId={comment._id} onCommentPosted={() => setShowReplyForm(false)} />
                    </div>
                )}
                 <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{t('areYouSure', {ns: 'common'})}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {t('deleteCommentConfirmation', {ns: 'programs'})}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t('cancel', { ns: 'common' })}</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                 {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('delete', { ns: 'common' })}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
};

const ReplyThread = ({ replies, lessonId }) => {
    return (
        <div className="flex flex-col gap-6">
            {replies.map(reply => (
                <React.Fragment key={reply._id}>
                    <CommentItem comment={reply} lessonId={lessonId} />
                    {reply.replies && reply.replies.length > 0 && (
                        <div className="mt-6">
                           <ReplyThread replies={reply.replies} lessonId={lessonId} />
                        </div>
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}

const DiscussionTab = ({ lessonId }) => {
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useLessonComments(lessonId);
    const { t } = useTranslation(['programs', 'common']);

    if (isLoading) {
        return <div className="flex h-full w-full items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    }

    if (isError) {
        return <div className="p-6 text-center"><p className="text-sm text-destructive">{t('errorLoadingComments', {ns: 'programs'})}</p></div>;
    }
    
    const allComments = data?.pages.flatMap(page => page.docs) || [];

    return (
        <div className="flex flex-col gap-6 p-4 md:p-6">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4 dark:bg-muted/30">
                <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground"/>
                <p className="text-sm leading-relaxed text-muted-foreground">{t('qa_disclaimer', { ns: 'programs' })}</p>
            </div>
            <div className="border-b pb-6">
                <CommentForm lessonId={lessonId} />
            </div>
            
            <div className="flex flex-col gap-6">
                {allComments.length > 0 ? (
                    allComments.map(comment => (
                        <div key={comment._id}>
                            <CommentItem comment={comment} lessonId={lessonId} />
                            {comment.replies && comment.replies.length > 0 && (
                                <div className="relative mt-6 pl-[48px] sm:pl-[52px]">
                                    <div className="absolute left-[17px] top-0 bottom-0 w-0.5 bg-border" />
                                    <ReplyThread replies={comment.replies} lessonId={lessonId} />
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">{t('noQuestionsYet', { ns: 'programs' })}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t('beTheFirstToAsk', { ns: 'programs' })}</p>
                    </div>
                )}
            </div>

            {hasNextPage && (
                <div className="mt-4 text-center">
                    <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} variant="outline">
                        {isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {t('loadMoreComments', {ns: 'programs'})}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default DiscussionTab;