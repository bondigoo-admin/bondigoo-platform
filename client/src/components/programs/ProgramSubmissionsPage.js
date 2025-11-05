import React, { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import { getProgramLandingPage } from '../../services/programAPI';
import { useProgramSubmissions, useAllCoachSubmissions } from '../../hooks/usePrograms';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion.jsx';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.tsx';
import { Button } from '../ui/button.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.tsx';
import { BookOpen, AlertCircle, ArrowLeft, Loader2, FileText, ExternalLink, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale/de';
import { enUS } from 'date-fns/locale/en-US';
import AssignmentFeedbackSheet from './AssignmentFeedbackSheet';
import { cn } from '../../lib/utils';

const SubmissionFile = ({ file }) => (
    <a href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 border rounded-md bg-muted/50 hover:bg-muted transition-colors">
        <FileText className="h-5 w-5 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{((file.size || 0) / 1024).toFixed(2)} KB</p>
        </div>
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
    </a>
);

const ProgramSubmissionsPage = ({ viewMode = 'singleProgram' }) => {
    const { programId } = useParams();
    const { t, i18n } = useTranslation(['programs', 'common']);
    const [feedbackTarget, setFeedbackTarget] = useState(null);

    const dateLocales = { de, en: enUS };

    const getInitials = (user) => `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();

    const { data: hubData, isLoading: isLoadingHub, isError: isHubError, error: hubError } = useAllCoachSubmissions({ enabled: viewMode === 'hub' });

    const { data: program, isLoading: isLoadingProgram } = useQuery(['program', programId], () => getProgramLandingPage(programId), { enabled: viewMode === 'singleProgram' });
    const { data: submissionsData, isLoading: isLoadingSubmissions, isError, error } = useProgramSubmissions(programId, { enabled: viewMode === 'singleProgram' });
    
    const defaultAccordionValue = useMemo(() => {
        if (viewMode === 'singleProgram' && submissionsData?.length > 0) {
            return submissionsData[0]?.lessonId;
        }
        return null;
    }, [submissionsData, viewMode]);

    if (viewMode === 'hub') {
        if (isLoadingHub) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
        if (isHubError) return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>{t('common:error_generic_title')}</AlertTitle><AlertDescription>{hubError?.message}</AlertDescription></Alert>;
        if (!hubData || hubData.length === 0) {
            return (
                <div className="text-center py-12 border-2 border-dashed rounded-lg bg-card">
                    <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h4 className="mt-4 text-lg font-semibold">{t('no_pending_submissions', 'No Pending Submissions')}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{t('all_caught_up_submissions', 'You\'re all caught up! No new assignments need review.')}</p>
                </div>
            );
        }

        return (
            <>
                <Accordion type="multiple" className="w-full space-y-4">
                    {hubData.map(programGroup => (
                        <AccordionItem value={programGroup.programId} key={programGroup.programId} className="border rounded-lg overflow-hidden">
                            <AccordionTrigger className="text-base font-semibold hover:no-underline bg-muted/50 px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <span>{programGroup.programTitle}</span>
                                    <span className="text-sm font-normal bg-background text-muted-foreground rounded-full px-2 py-0.5">{programGroup.items.length} {t('submissions', 'Submissions')}</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="p-4 space-y-4">
                                {programGroup.items.map(sub => (
                                     <div key={sub.enrollmentId + sub.submittedAt} className={cn("p-4 border rounded-lg bg-card transition-colors", sub.isReviewed && "bg-muted/50")}>
                                        <div className="flex items-start md:items-center justify-between gap-2 flex-col md:flex-row mb-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Avatar>
                                                    <AvatarImage src={sub.user.profilePicture?.url} />
                                                    <AvatarFallback>{getInitials(sub.user)}</AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate">{sub.user.firstName} {sub.user.lastName}</p>
                                                    <p className="text-sm text-muted-foreground truncate">{t('in_lesson', 'in {{lessonTitle}}', { lessonTitle: sub.lessonTitle })}</p>
                                                </div>
                                           </div>
                                            <div className="flex items-center gap-4 w-full md:w-auto pl-12 md:pl-0 mt-2 md:mt-0">
                                                <p className="text-sm text-muted-foreground flex-1 whitespace-nowrap">{format(new Date(sub.submittedAt), 'PPp', { locale: dateLocales[i18n.language] || enUS })}</p>
                                                <Button
                                                    variant={sub.isReviewed ? "secondary" : "outline"}
                                                    size="sm"
                                                    onClick={() => setFeedbackTarget({ ...sub })}
                                                >
                                                    <MessageSquare className="mr-2 h-4 w-4" />
                                                    {sub.isReviewed ? t('view_feedback', 'View Feedback') : t('provide_feedback')}
                                                </Button>
                                            </div>
                                        </div>
                                        {(sub.submission.text || sub.submission.files?.length > 0) && (
                                            <div className="space-y-2 pl-12">
                                                {sub.submission.text && (
                                                    <div className="p-3 bg-muted/50 rounded-md">
                                                        <p className="text-sm whitespace-pre-wrap">{sub.submission.text}</p>
                                                    </div>
                                                )}
                                                {sub.submission.files && sub.submission.files.length > 0 && (
                                                    <div className="space-y-2">
                                                        {sub.submission.files.map((file, index) => <SubmissionFile key={file.publicId || index} file={file} />)}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
                <AssignmentFeedbackSheet
                    submission={feedbackTarget}
                    isOpen={!!feedbackTarget}
                    onOpenChange={(isOpen) => !isOpen && setFeedbackTarget(null)}
                />
            </>
        );
    }

    if (isLoadingProgram || isLoadingSubmissions) {
        return (
            <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
                <Skeleton className="h-10 w-1/3" />
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
        );
    }
    
    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
            <div className="space-y-2">
                <Button asChild variant="ghost" className="pl-0 text-sm text-muted-foreground hover:text-foreground">
                    <Link to="/dashboard?tab=programs"><ArrowLeft className="mr-2 h-4 w-4" />{t('back_to_programs')}</Link>
                </Button>
                <h1 className="text-3xl font-bold tracking-tight">{program?.title}</h1>
                <p className="flex items-center text-lg text-muted-foreground"><BookOpen className="mr-2 h-5 w-5" />{t('assignment_submissions', 'Assignment Submissions')}</p>
            </div>

            {isError && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t('common:error_generic_title')}</AlertTitle>
                    <AlertDescription>{error?.message || t('common:error_generic')}</AlertDescription>
                </Alert>
            )}

            {submissionsData && submissionsData.length > 0 ? (
                <Accordion type="single" collapsible className="w-full" defaultValue={defaultAccordionValue}>
                    {submissionsData.map(lessonGroup => (
                        <AccordionItem value={lessonGroup.lessonId} key={lessonGroup.lessonId}>
                            <AccordionTrigger className="text-base font-semibold hover:no-underline">
                                <div className="flex items-center gap-2">
                                    <span>{lessonGroup.lessonTitle}</span>
                                    <span className="text-sm font-normal bg-muted text-muted-foreground rounded-full px-2 py-0.5">{lessonGroup.submissions.length} {t('submissions', 'Submissions')}</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-4 space-y-4">
                                {lessonGroup.submissions.map(sub => (
                                    <div key={sub.enrollmentId + sub.submittedAt} className="p-4 border rounded-lg bg-card">
                                        <div className="flex items-start md:items-center justify-between gap-2 flex-col md:flex-row mb-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Avatar>
                                                    <AvatarImage src={sub.user.profilePicture?.url} />
                                                    <AvatarFallback>{getInitials(sub.user)}</AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate">{sub.user.firstName} {sub.user.lastName}</p>
                                                    <p className="text-sm text-muted-foreground truncate">{sub.user.email}</p>
                                                </div>
                                           </div>
                                            <div className="flex items-center gap-4 w-full md:w-auto pl-12 md:pl-0 mt-2 md:mt-0">
                                                <p className="text-sm text-muted-foreground flex-1 whitespace-nowrap">{format(new Date(sub.submittedAt), 'PPp', { locale: dateLocales[i18n.language] || enUS })}</p>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setFeedbackTarget({ ...sub, lessonId: lessonGroup.lessonId, lessonTitle: lessonGroup.lessonTitle })}
                                                >
                                                    <MessageSquare className="mr-2 h-4 w-4" />
                                                    {t('provide_feedback')}
                                                </Button>
                                            </div>
                                        </div>
                                        {(sub.submission.text || sub.submission.files?.length > 0) && (
                                            <div className="space-y-2 pl-12">
                                                {sub.submission.text && (
                                                    <div className="p-3 bg-muted/50 rounded-md">
                                                        <p className="text-sm whitespace-pre-wrap">{sub.submission.text}</p>
                                                    </div>
                                                )}
                                                {sub.submission.files && sub.submission.files.length > 0 && (
                                                    <div className="space-y-2">
                                                        {sub.submission.files.map((file, index) => <SubmissionFile key={file.publicId || index} file={file} />)}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <div className="text-center py-12 border-2 border-dashed rounded-lg bg-card">
                    <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h4 className="mt-4 text-lg font-semibold">{t('no_submissions_yet', 'No Submissions Yet')}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{t('submissions_will_appear_here', 'When students submit assignments, they will appear here.')}</p>
                </div>
            )}
            <AssignmentFeedbackSheet
                submission={feedbackTarget}
                isOpen={!!feedbackTarget}
                onOpenChange={(isOpen) => !isOpen && setFeedbackTarget(null)}
            />
        </div>
    );
};

export default ProgramSubmissionsPage;