import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { getProgramQandA, getProgramLandingPage } from '../../services/programAPI';
import { useAuth } from '../../contexts/AuthContext';
import { usePostComment, useUpdateComment, useDeleteComment, useAllCoachQA } from '../../hooks/usePrograms';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion.jsx';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.tsx';
import { Button } from '../ui/button.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog.tsx';
import { MessageSquare, AlertCircle, ArrowLeft, Loader2, MoreHorizontal, Edit, Trash2, CornerUpLeft, Save } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, de, fr, es } from 'date-fns/locale';
import { cn } from '../../lib/utils';

const CommentForm = ({ lessonId, programId, parentCommentId = null, onCommentPosted }) => {
    const [content, setContent] = useState('');
    const { mutate: postComment, isLoading } = usePostComment(lessonId);
    const { user } = useAuth();
    const { t } = useTranslation(['programs', 'common']);
    const queryClient = useQueryClient();

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!content.trim()) return;
        postComment({ content, parentComment: parentCommentId }, {
            onSuccess: () => {
                setContent('');
                queryClient.invalidateQueries(['programQandA', programId]);
                if (onCommentPosted) onCommentPosted();
            }
        });
    };

    const profilePictureUrl = user?.role === 'coach' && user?.coachProfilePicture?.url
        ? user.coachProfilePicture.url
        : user?.profilePicture?.url || '';
    
    return (
        <form onSubmit={handleSubmit} className="flex items-start gap-3 sm:gap-4">
            <Avatar className="mt-1 h-9 w-9 flex-shrink-0">
                <AvatarImage src={profilePictureUrl} />
                <AvatarFallback>{`${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase()}</AvatarFallback>
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

const CommentItem = ({ comment, lessonId, programId, program, getInitials }) => {
    const [showReplyForm, setShowReplyForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState(comment.content);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const { user } = useAuth();
    const { t, i18n } = useTranslation(['common', 'programs']);
    const queryClient = useQueryClient();
    
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
        if (editedContent.trim() === comment.content || !editedContent.trim()) return;
        updateComment({ commentId: comment._id, content: editedContent }, {
            onSuccess: () => {
                setIsEditing(false);
                queryClient.invalidateQueries(['programQandA', programId]);
            }
        });
    };
    
    const handleDelete = () => {
        deleteComment(comment._id, {
            onSuccess: () => {
                setIsDeleteDialogOpen(false);
                queryClient.invalidateQueries(['programQandA', programId]);
            }
        });
    };

   const profilePictureUrl = comment.user.role === 'coach' && comment.user.coachProfilePicture?.url
        ? comment.user.coachProfilePicture.url
        : comment.user.profilePicture?.url || '';

    return (
        <div className="flex items-start gap-3 sm:gap-4">
            <Avatar className="h-9 w-9 flex-shrink-0">
                <AvatarImage src={profilePictureUrl} />
                <AvatarFallback>{getInitials(comment.user)}</AvatarFallback>
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
                            <p className="mt-1 w-full break-words whitespace-pre-wrap text-left text-sm text-foreground">{comment.content}</p>
                            <div className="-mr-2 -mb-2 mt-1 flex items-center self-end">
                                <Button variant="ghost" size="sm" onClick={() => setShowReplyForm(!showReplyForm)}>
                                    <CornerUpLeft className="h-4 w-4 sm:mr-2" />
                                    <span className="hidden sm:inline">{t('reply', {ns: 'programs'})}</span>
                                </Button>
                                {(isOwner || isCoach) && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {isOwner && (<DropdownMenuItem onClick={() => setIsEditing(true)}><Edit className="mr-2 h-4 w-4" /><span>{t('edit', { ns: 'common' })}</span></DropdownMenuItem>)}
                                            <DropdownMenuItem onClick={() => setIsDeleteDialogOpen(true)} className="text-destructive focus:text-destructive focus:bg-destructive/10"><Trash2 className="mr-2 h-4 w-4" /><span>{t('delete', { ns: 'common' })}</span></DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        </div>
                    ) : (
                         <form onSubmit={handleUpdate} className="w-full">
                            <div className="flex w-full flex-col overflow-hidden rounded-lg border border-input bg-background">
                                <Textarea value={editedContent} onChange={(e) => setEditedContent(e.target.value)} className="min-h-[80px] resize-y border-0 bg-transparent p-3 text-sm shadow-none outline-none focus-visible:ring-0 md:p-4" rows={3}/>
                                <div className="flex justify-end gap-2 border-t bg-muted/50 p-2 px-3 dark:bg-muted/30">
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)}>{t('cancel', { ns: 'common' })}</Button>
                                    <Button type="submit" disabled={isUpdating || editedContent.trim() === comment.content} size="sm">{isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} {t('save', { ns: 'common' })}</Button>
                                </div>
                            </div>
                        </form>
                    )}
                </div>
                {showReplyForm && (
                    <div className="mt-4"><CommentForm lessonId={lessonId} programId={programId} parentCommentId={comment._id} onCommentPosted={() => setShowReplyForm(false)} /></div>
                )}
                 <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>{t('areYouSure', {ns: 'common'})}</AlertDialogTitle><AlertDialogDescription>{t('deleteCommentConfirmation', {ns: 'programs'})}</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>{t('cancel', { ns: 'common' })}</AlertDialogCancel><AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t('delete', { ns: 'common' })}</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
};

const ReplyThread = ({ replies, lessonId, programId, program, getInitials }) => {
    return (
        <div className="flex flex-col gap-6">
            {replies.map(reply => (
                <div key={reply._id}>
                    <CommentItem comment={reply} lessonId={lessonId} programId={programId} program={program} getInitials={getInitials} />
                    {reply.replies && reply.replies.length > 0 && (
                        <div className="relative mt-6 pl-[48px] sm:pl-[52px]">
                           <div className="absolute left-[17px] top-0 bottom-0 w-0.5 bg-border" />
                           <ReplyThread replies={reply.replies} lessonId={lessonId} programId={programId} program={program} getInitials={getInitials}/>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

const ProgramQAPage = ({ viewMode = 'singleProgram' }) => {
    const { programId } = useParams();
    const { t } = useTranslation(['programs', 'common']);
    
    const getInitials = (user) => `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();

    const { data: hubData, isLoading: isLoadingHub, isError: isHubError, error: hubError } = useAllCoachQA({ enabled: viewMode === 'hub' });

    const { data: program, isLoading: isLoadingProgram } = useQuery(['program', programId], () => getProgramLandingPage(programId), { enabled: viewMode === 'singleProgram' });
    const { data: qaData, isLoading: isLoadingQA, isError, error } = useQuery(['programQandA', programId], () => getProgramQandA(programId), { enabled: viewMode === 'singleProgram' });

    const processedQaData = useMemo(() => {
        if (!qaData) return [];
        return qaData.map(lessonQA => ({
            ...lessonQA,
            commentCount: lessonQA.comments?.length || 0,
            topLevelComments: lessonQA.comments || []
        }));
    }, [qaData]);

    if (viewMode === 'hub') {
        if (isLoadingHub) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
        if (isHubError) return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>{t('common:error_generic_title')}</AlertTitle><AlertDescription>{hubError?.message}</AlertDescription></Alert>;
        if (!hubData || hubData.length === 0) {
            return (
                <div className="text-center py-12 border-2 border-dashed rounded-lg bg-card">
                    <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h4 className="mt-4 text-lg font-semibold">{t('no_pending_qa', 'No Pending Q&A')}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{t('all_caught_up_qa', 'You\'re all caught up! No new questions need your attention.')}</p>
                </div>
            );
        }

        return (
            <Accordion type="multiple" className="w-full space-y-4">
                {hubData.map(programGroup => (
                    <AccordionItem value={programGroup.programId} key={programGroup.programId} className="border rounded-lg overflow-hidden">
                        <AccordionTrigger className="text-base font-semibold hover:no-underline bg-muted/50 px-4 py-3">
                            <div className="flex items-center gap-2">
                                <span>{programGroup.programTitle}</span>
                                <span className="text-sm font-normal bg-background text-muted-foreground rounded-full px-2 py-0.5">{programGroup.items.length} {t('new_questions', 'new questions')}</span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-4 space-y-4">
                            {programGroup.items.map(comment => (
                                <div key={comment._id} className="flex items-start gap-3 border-b pb-4 last:border-b-0 last:pb-0">
                                    <Avatar className="h-9 w-9 flex-shrink-0">
                                        <AvatarImage src={comment.user.profilePicture?.url} />
                                        <AvatarFallback>{getInitials(comment.user)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <p className="text-sm text-muted-foreground">
                                            <span className="font-semibold text-foreground">{comment.user.firstName} {comment.user.lastName}</span> asked in <span className="font-medium">{comment.lessonTitle}</span>
                                        </p>
                                        <p className="mt-1 text-sm p-2 bg-muted/50 rounded-md">{comment.content}</p>
                                        <div className="mt-2">
                                            <Button asChild variant="link" size="sm" className="p-0 h-auto">
                                                <Link to={`/programs/${programGroup.programId}/qa`}>{t('view_discussion', 'View Full Discussion')}</Link>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        );
    }
  
    const renderSkeleton = () => (
        <div className="space-y-4">
            <Skeleton className="h-10 w-1/3" />
            {[...Array(3)].map((_, i) => (
                <div key={i} className="border rounded-lg p-4 space-y-3">
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-16 w-full" />
                </div>
            ))}
        </div>
    );

    if (isLoadingProgram || isLoadingQA) {
        return <div className="max-w-4xl mx-auto p-4 md:p-6">{renderSkeleton()}</div>;
    }

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
            <div className="space-y-2">
                <Button asChild variant="ghost" className="pl-0 text-sm text-muted-foreground hover:text-foreground">
                    <Link to="/dashboard?tab=programs"><ArrowLeft className="mr-2 h-4 w-4" />{t('back_to_programs', 'Back to Programs')}</Link>
                </Button>
                <h1 className="text-3xl font-bold tracking-tight">{program?.title}</h1>
                <p className="flex items-center text-lg text-muted-foreground"><MessageSquare className="mr-2 h-5 w-5" />{t('manage_qa_title', 'Manage Q&A')}</p>
            </div>

            {isError && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t('common:error_generic_title')}</AlertTitle>
                    <AlertDescription>{error?.message || t('common:error_generic')}</AlertDescription>
                </Alert>
            )}

            {processedQaData && processedQaData.length > 0 ? (
                <Accordion type="single" collapsible className="w-full" defaultValue={processedQaData[0]?.lessonId}>
                    {processedQaData.map(lessonQA => (
                        <AccordionItem value={lessonQA.lessonId} key={lessonQA.lessonId}>
                            <AccordionTrigger className="text-base font-semibold hover:no-underline">
                                <div className="flex items-center gap-2">
                                    <span>{lessonQA.lessonTitle}</span>
                                    <span className="text-sm font-normal bg-muted text-muted-foreground rounded-full px-2 py-0.5">{lessonQA.commentCount} {t('threads', 'threads')}</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-4 space-y-6">
                                <div className="flex flex-col gap-6">
                                    {lessonQA.topLevelComments.length > 0 ? (
                                        lessonQA.topLevelComments.map(comment => (
                                            <div key={comment._id}>
                                                <CommentItem 
                                                    comment={comment} 
                                                    lessonId={lessonQA.lessonId} 
                                                    programId={programId} 
                                                    program={program} 
                                                    getInitials={getInitials}
                                                />
                                                {comment.replies && comment.replies.length > 0 && (
                                                    <div className="relative mt-6 pl-[48px] sm:pl-[52px]">
                                                        <div className="absolute left-[17px] top-0 bottom-0 w-0.5 bg-border" />
                                                        <ReplyThread 
                                                            replies={comment.replies} 
                                                            lessonId={lessonQA.lessonId} 
                                                            programId={programId} 
                                                            program={program}
                                                            getInitials={getInitials}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-8 text-center">
                                            <p className="text-sm text-muted-foreground">{t('noQuestionsYet', { ns: 'programs' })}</p>
                                        </div>
                                    )}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <div className="text-center py-12 border-2 border-dashed rounded-lg bg-card">
                    <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h4 className="mt-4 text-lg font-semibold">{t('no_questions_yet', 'No Questions Yet')}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{t('questions_will_appear_here', 'When students ask questions in this program, they will appear here.')}</p>
                </div>
            )}
        </div>
    );
};

export default ProgramQAPage;