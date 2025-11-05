import React, { useState, useRef, useEffect, useMemo } from 'react';
import CustomVideoPlayer from './CustomVideoPlayer';
import { useAuth } from '../../contexts/AuthContext';
import { useProgramReviews, programKeys } from '../../hooks/usePrograms';
import { useQueryClient } from 'react-query';
import { Loader2, AlertCircle, MessageSquare, Star, ChevronRight, Check, X, FileText } from 'lucide-react';
import { useProgramPlayer } from '../../contexts/ProgramPlayerContext';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '../ui/scroll-area.jsx';
import { Button } from '../ui/button.tsx';
import DiscussionTab from './DiscussionTab';
import ReviewModal from '../ReviewModal';
import { cn } from '../../lib/utils';
import QuizPlayer from './QuizPlayer';
import AssignmentPlayer from './AssignmentPlayer';
import PresentationPlayer from './PresentationPlayer';
import { logger } from '../../utils/logger.js';
import { submitLesson } from '../../services/programAPI.js';
import { toast } from 'react-hot-toast';

const usePrevious = (value) => {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

const LessonContent = () => {
const { 
    program,
    enrollment, 
    currentLesson, 
    setEnrollment,
    completeCurrentLesson, 
    completeCurrentSubItem,
    isUpdatingProgress,
    goToNextLesson,
    isLastLesson,
    currentSubComponentIndex,
    setCurrentSubComponentIndex,
  } = useProgramPlayer();
  const { t } = useTranslation(['programs', 'common']);
  const { user } = useAuth();
  const { data: reviews } = useProgramReviews(program?._id, { enabled: !!program?._id });
  const queryClient = useQueryClient();

  const prevCompletedCount = usePrevious(enrollment?.progress.completedLessons.length);

  useEffect(() => {
    if (enrollment && program && !enrollment.isPreview) {
        const currentCompletedCount = enrollment.progress.completedLessons.length;
        const totalLessons = program.totalLessons;
        const isProgramNowCompleted = currentCompletedCount === totalLessons && totalLessons > 0;
        
        logger.info(`[LESSON_CONTENT_TRACE] Completion check effect fired.`, {
            isProgramNowCompleted,
            isLastLesson,
            currentCompletedCount,
            prevCompletedCount,
            totalLessons
        });
        
        if (isLastLesson && isProgramNowCompleted && prevCompletedCount < totalLessons) {
            logger.info(`[LESSON_CONTENT_TRACE] Program completion detected. Opening review modal.`);
            setIsReviewModalOpen(true);
        }
    }
  }, [enrollment, program, isLastLesson, prevCompletedCount]);

  const userReview = useMemo(() => {
    if (!reviews || !user) return null;
    return reviews.find(review => review.raterId._id === user._id);
  }, [reviews, user]);

  const onReviewSubmitSuccess = (data) => {
    if (data.enrollment) {
        setEnrollment(data.enrollment);
    }
    setIsReviewModalOpen(false);
    
    queryClient.invalidateQueries(['programReviews', program._id]);
    queryClient.invalidateQueries(['program', program._id]);
    queryClient.invalidateQueries(programKeys.all);
    toast.success(t('review_submitted_successfully', 'Thank you for your feedback!'));
  };

  useEffect(() => {
    logger.info('[LessonContent] Current lesson has changed:', currentLesson);
  }, [currentLesson]);

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isDiscussionOpen, setIsDiscussionOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const discussionModalRef = useRef(null);
  const [position, setPosition] = useState({ x: window.innerWidth - 520 - 48, y: 120 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStartOffset.x,
        y: e.clientY - dragStartOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStartOffset]);

  const handleMouseDownOnHeader = (e) => {
      if (e.button !== 0 || !discussionModalRef.current) return;
      
      const modalRect = discussionModalRef.current.getBoundingClientRect();
      setIsDragging(true);
      setDragStartOffset({
        x: e.clientX - modalRect.left,
        y: e.clientY - modalRect.top,
      });
      e.preventDefault();
  };

  if (!currentLesson || !enrollment || !program) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-background p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">{t('loadingLesson')}</p>
      </div>
    );
  }

  const isPreview = enrollment.isPreview;
  const isCompleted = !isPreview && enrollment.progress.completedLessons.includes(currentLesson._id);
  const isProgramCompleted = !isPreview && enrollment.progress.completedLessons.length === program.totalLessons && program.totalLessons > 0;
  const hasReviewed = enrollment.hasReviewed;
  
  const isMultiPartLesson = (currentLesson.contentType === 'video' || currentLesson.contentType === 'document') && (currentLesson.content?.files || []).length > 1;
  const isLastPartInLesson = isMultiPartLesson && currentSubComponentIndex === (currentLesson.content.files.length - 1);

const handleActionClick = async () => {
    logger.info(`[LESSON_CONTENT_TRACE] 1. 'handleActionClick' triggered.`);
    logger.info(`   - Lesson: "${currentLesson.title}", Type: ${currentLesson.contentType}`);

    if (isMultiPartLesson && !isLastPartInLesson) {
        logger.info(`[LESSON_CONTENT_TRACE] 2a. Action: Completing current part and navigating to next sub-item.`);
        const currentFile = currentLesson.content.files[currentSubComponentIndex];
        if (currentFile && !isPreview) {
            completeCurrentSubItem(currentFile.publicId);
        }
        setCurrentSubComponentIndex(prev => prev + 1);
        return;
    }

    logger.info(`[LESSON_CONTENT_TRACE] 2b. Action: Completing lesson/final part and proceeding to next lesson.`);
    
    if (!isPreview) {
        if (['presentation', 'quiz', 'assignment'].includes(currentLesson.contentType)) {
            logger.info(`[LESSON_CONTENT_TRACE] 3a. Submitting complex lesson type.`);
            setIsSubmitting(true);
            try {
                const responseData = await submitLesson({
                    enrollmentId: enrollment._id,
                    lessonId: currentLesson._id,
                    submissionData: { status: 'completed' },
                });
                if (responseData.enrollment) {
                    setEnrollment(responseData.enrollment);
                }
            } catch (error) {
                logger.error('[LESSON_CONTENT_TRACE] 4a. FAILED to submit lesson.', { error });
                toast.error(t('common:something_went_wrong'));
            } finally {
                setIsSubmitting(false);
            }
        } else {
            logger.info(`[LESSON_CONTENT_TRACE] 3b. Completing standard lesson type.`);
            if (isMultiPartLesson && isLastPartInLesson) {
                const lastFile = currentLesson.content.files[currentSubComponentIndex];
                if (lastFile) {
                    completeCurrentSubItem(lastFile.publicId);
                }
            } else {
                completeCurrentLesson();
            }
        }
    }

    if (!isLastLesson) {
        logger.info(`[LESSON_CONTENT_TRACE] 6. Action: Navigating to the next lesson.`);
        goToNextLesson();
    } else {
        logger.info(`[LESSON_CONTENT_TRACE] 6. Action: On last lesson. Completion effect will handle review modal.`);
    }
  };

  const getButtonText = () => {
    if (isMultiPartLesson && !isLastPartInLesson) {
        return currentLesson.contentType === 'video' ? t('nextVideo', { ns: 'programs' }) : t('nextDocument', { ns: 'programs' });
    }
    if (isLastLesson) {
        return t('finish_program', { ns: 'programs' });
    }
    const lessonDetail = enrollment.progress.lessonDetails?.find(ld => ld.lesson === currentLesson._id);
    const lastFile = isMultiPartLesson ? currentLesson.content.files[currentSubComponentIndex] : null;
    const isLastSubItemDone = lastFile && lessonDetail?.completedFileIds?.includes(lastFile.publicId);

    if ((isMultiPartLesson && isLastSubItemDone) || (!isMultiPartLesson && isCompleted) || isPreview) {
        return t('nextLesson');
    }
    return t('completeAndContinue');
  };

const renderContent = () => {
  switch (currentLesson.contentType) {
      case 'video': {
        const allFiles = currentLesson.content?.files || [];
        const videos = allFiles.filter(f => f.resourceType === 'video' || f.mimeType?.startsWith('video/'));
        if (!videos || videos.length === 0) {
            return <div className="flex h-full w-full flex-col items-center justify-center rounded-lg bg-destructive/10 p-8 text-center text-destructive"><AlertCircle className="h-6 w-6 mr-2"/>{t('videoNotAvailable')}</div>;
        }

        const currentVideoFile = videos[currentSubComponentIndex];
        if (!currentVideoFile?.url) {
            return <div className="flex h-full w-full flex-col items-center justify-center rounded-lg bg-destructive/10 p-8 text-center text-destructive"><AlertCircle className="h-8 w-8 mr-2 mb-2"/>{t('videoLoadError')}<p className="text-sm text-muted-foreground mt-1">{t('videoUrlMissing', 'This video could not be loaded.')}</p></div>;
        }
        
        const handleVideoCompletion = () => {
          if (isPreview || isUpdatingProgress) return;
          const isLessonMarkedComplete = enrollment.progress.completedLessons.includes(currentLesson._id);
          if (isMultiPartLesson) {
              const lessonDetail = enrollment.progress.lessonDetails?.find(ld => ld.lesson === currentLesson._id);
              const isSubItemCompleted = lessonDetail?.completedFileIds?.includes(currentVideoFile.publicId);
              if (!isSubItemCompleted) completeCurrentSubItem(currentVideoFile.publicId);
          } else if (!isLessonMarkedComplete) {
              completeCurrentLesson();
          }
        };

        return (
          <div className="w-full h-full bg-black flex items-center justify-center">
              <CustomVideoPlayer
                  key={currentVideoFile.publicId || currentVideoFile.url}
                  videoFile={currentVideoFile}
                  onLessonComplete={handleVideoCompletion}
              />
          </div>
        );
      }
      case 'text':
        return (
            <ScrollArea className="h-full w-full bg-muted/20">
                <div className="flex w-full justify-center p-4 sm:p-6 lg:p-8">
                    <div className="w-full max-w-4xl rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8 lg:p-10">
                        <div
                            className="prose prose-slate dark:prose-invert max-w-none" 
                            dangerouslySetInnerHTML={{ __html: currentLesson.content?.text || '' }}
                        />
                    </div>
                </div>
            </ScrollArea>
        );
     case 'document':
        const documents = currentLesson.content?.files;
        if (!documents || documents.length === 0) {
            return <div className="flex h-full w-full items-center justify-center text-muted-foreground"><AlertCircle className="h-6 w-6 mr-2"/>{t('documentNotAvailable')}</div>;
        }
        const docFile = documents[currentSubComponentIndex];
        
        if (!docFile || !docFile.url) {
            return <div className="flex h-full w-full items-center justify-center text-muted-foreground"><AlertCircle className="h-6 w-6 mr-2"/>{t('documentNotAvailable')}</div>;
        }

        return (
          <div className="w-full">
            <iframe
              src={`${docFile.url}#view=Fit`}
              title={docFile.name || currentLesson.title}
              className="h-screen w-full border-0"
            />
          </div>
        );
      case 'quiz':
        return <QuizPlayer />;
      case 'assignment':
        return <AssignmentPlayer />;
      case 'presentation':
        return <PresentationPlayer />;
      default:
        return <div className="flex h-full w-full items-center justify-center text-destructive"><AlertCircle className="h-6 w-6 mr-2"/>{t('unsupportedContent')}</div>;
    }
  };

  return (
    <>
       <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-card px-4 py-3 sm:px-6">
               <h1 className="truncate text-xl font-bold md:text-2xl">{currentLesson.title}</h1>
               <div className="flex items-center gap-2">
                {program.isDiscussionEnabled && (
                    <Button
                        variant="outline"
                        onClick={() => setIsDiscussionOpen(true)}
                        className={cn('shrink-0', isDiscussionOpen && 'bg-accent border-primary/50 text-primary')}
                    >
                        <MessageSquare className="h-4 w-4" />
                        <span className="ml-2 hidden sm:inline">{t('discussion', { ns: 'programs' })}</span>
                    </Button>
                )}
                
                {isLastLesson && isProgramCompleted && !isPreview ? (
                     <Button onClick={() => setIsReviewModalOpen(true)} className="bg-amber-400 text-amber-900 hover:bg-amber-400/90 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-500/90">
                        <Star className="h-4 w-4 mr-2" />
                        {hasReviewed ? t('edit_review_button', 'Edit Review') : t('leaveReview')}
                    </Button>
                ) : (
                      <Button
                        onClick={handleActionClick}
                        disabled={isUpdatingProgress || isSubmitting}
                    >
                        {(isUpdatingProgress || isSubmitting) ? <Loader2 className="h-4 w-4 animate-spin" /> : (isCompleted || isPreview) && !isMultiPartLesson && <Check className="h-4 w-4 mr-2" />}
                        <span>{getButtonText()}</span>
                        {(!isLastLesson || (isMultiPartLesson && !isLastPartInLesson)) && <ChevronRight className="h-4 w-4 ml-2" />}
                    </Button>
                )}
            </div>
          </header>
      <div className="relative flex-1 bg-muted/20 min-h-0">
             {renderContent()}
           </div>
      
      {isDiscussionOpen && program.isDiscussionEnabled && (
        <div
            ref={discussionModalRef}
            style={{ 
                position: 'fixed',
                top: `${position.y}px`, 
                left: `${position.x}px`,
                width: '520px',
                maxWidth: '90vw',
                height: '600px',
                maxHeight: '75vh',
                zIndex: 50,
             }}
            className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl"
        >
            <div 
                onMouseDown={handleMouseDownOnHeader}
                className="flex shrink-0 cursor-move items-center justify-between border-b bg-muted/50 px-4 py-3"
            >
                <h3 className="font-semibold">{t('discussion', { ns: 'programs' })}</h3>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsDiscussionOpen(false)}>
                    <X size={18} />
                </Button>
            </div>
            <div className="flex-grow overflow-y-auto">
                <DiscussionTab lessonId={currentLesson._id} />
            </div>
        </div>
      )}

    {isReviewModalOpen && (
        <ReviewModal
            reviewType="program"
            entityId={program._id}
            entityTitle={program.title}
            onClose={() => setIsReviewModalOpen(false)}
            onSubmitSuccess={onReviewSubmitSuccess}
            existingReview={userReview}
            isSavingProgress={isUpdatingProgress}
        />
    )}
    </>
  );
};

export default LessonContent;