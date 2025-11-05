import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../ui/dialog.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { toast } from 'react-hot-toast';
import { Loader2, ArrowLeft, Maximize2, Minimize2, Video, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import { Badge } from '../ui/badge.tsx';
import FileUploadEditor from './editor/FileUploadEditor';
import TextContentEditor from './editor/TextContentEditor';
import QuizBuilder from './editor/QuizBuilder';
import AssignmentBuilder from './editor/AssignmentBuilder';
import PresentationBuilder from './editor/PresentationBuilder';

const LessonEditor = ({ isOpen, setIsOpen, lessonData, onSave, onBack, startInFullscreen = false, lessonsCount = 0 }) => {
    const { t } = useTranslation(['programs', 'common']);
    const [lesson, setLesson] = useState({});
    const [isFullscreen, setIsFullscreen] = useState(false);

    const [contentDurationStr, setContentDurationStr] = useState('');
    const [completionTimeStr, setCompletionTimeStr] = useState('');
    const formatAmountForInput = (amount) => (amount > 0 ? amount.toString() : '');

    const isNewLesson = !lessonData?._id;

    useEffect(() => {
        if (isOpen) {
            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = originalOverflow;
            };
        }
    }, [isOpen]);

useEffect(() => {
        if (isOpen) {
            setIsFullscreen(startInFullscreen);
            const initialLesson = lessonData || {
                title: '',
                contentType: 'video',
                content: {},
                estimatedCompletionTime: { minutes: 0 }
            };

            if (isNewLesson && !initialLesson.title) {
                initialLesson.title = `${t('lesson', { ns: 'programs' })} ${lessonsCount + 1}`;
            }

            if (!initialLesson.contentDuration) {
                initialLesson.contentDuration = { minutes: 0, source: isNewLesson ? 'auto_video' : 'manual' };
            }
            if (!initialLesson.estimatedCompletionTime) {
                initialLesson.estimatedCompletionTime = { minutes: 0 };
            }

            if (initialLesson.contentType === 'quiz' && !initialLesson.content.quiz) {
                initialLesson.content.quiz = { passingScore: 80, questions: [] };
            }
            if (initialLesson.contentType === 'assignment' && !initialLesson.content.assignment) {
                initialLesson.content.assignment = { instructions: '', submissionType: 'text' };
            }
            if ((initialLesson.contentType === 'video' || initialLesson.contentType === 'document') && !initialLesson.content.files) {
                initialLesson.content.files = [];
            }
            if (initialLesson.contentType === 'presentation' && !initialLesson.content.presentation) {
                initialLesson.content.presentation = { originalFileUrl: '', originalFilePublicId: '', slides: [] };
            }
            setLesson(initialLesson);
        }
    }, [isOpen, lessonData, startInFullscreen, isNewLesson, lessonsCount, t]);

       useEffect(() => {
        if (lesson.contentType === 'video' && lesson.contentDuration?.source !== 'manual') {
            const totalVideoSeconds = lesson.content?.files?.reduce((acc, file) => acc + (file.duration || 0), 0) || 0;
            
            let calculatedMinutes = 0;
            if (totalVideoSeconds > 0) {
                const rawMinutes = totalVideoSeconds / 60;
                calculatedMinutes = Math.round(rawMinutes * 10) / 10;
            }
            
            if (lesson.contentDuration?.minutes !== calculatedMinutes) {
                setLesson(prev => ({
                    ...prev,
                    contentDuration: { ...prev.contentDuration, minutes: calculatedMinutes, source: 'auto_video' }
                }));
            }
        }
    }, [lesson.content?.files, lesson.contentType, lesson.contentDuration?.source]);


    useEffect(() => {
        setContentDurationStr(formatAmountForInput(lesson.contentDuration?.minutes));
    }, [lesson.contentDuration]);

    useEffect(() => {
        setCompletionTimeStr(formatAmountForInput(lesson.estimatedCompletionTime?.minutes));
    }, [lesson.estimatedCompletionTime]);

     useEffect(() => {
        if (isOpen) {
          const mainHeader = document.querySelector('header');
          
          const setHeaderHeightVar = () => {
            if (mainHeader) {
              const headerHeight = mainHeader.offsetHeight;
              document.documentElement.style.setProperty('--app-header-height', `${headerHeight}px`);
            }
          };
          
          setHeaderHeightVar();
          
          window.addEventListener('resize', setHeaderHeightVar);
          
          return () => {
            window.removeEventListener('resize', setHeaderHeightVar);
            document.documentElement.style.removeProperty('--app-header-height');
          };
        }
    }, [isOpen]);

 const handleDurationChange = (type, value) => {
        const minutes = Math.max(0, parseFloat(value) || 0);
        if (type === 'contentDuration') {
            setLesson(prev => ({
                ...prev,
                contentDuration: { minutes: minutes, source: 'manual' }
            }));
        } else {
            setLesson(prev => ({
                ...prev,
                estimatedCompletionTime: { minutes: minutes }
            }));
        }
    };
    
    const toggleFullscreen = () => {
        setIsFullscreen(prev => !prev);
    };

    const handleSaveClick = () => {
        if (!lesson.title.trim()) {
            toast.error(t('programs:error_lesson_title_required'));
            return;
        }
        onSave(lesson);
        //toast.success(t('common:changesSaved'));
    };

    const getTitleForContentType = (type) => {
        switch (type) {
            case 'quiz': return t('programs:content_type_quiz');
            case 'assignment': return t('programs:content_type_assignment');
            case 'video': return t('programs:content_type_video');
            case 'document': return t('programs:content_type_document');
            case 'text': return t('programs:content_type_text');
            case 'presentation': return t('programs:content_type_presentation');
            default: return '';
        }
    };

    const renderContentEditor = () => {
        const props = { lesson, setLesson };
        switch (lesson.contentType) {
            case 'video':
            case 'document':
                return <FileUploadEditor {...props} />;
            case 'text':
                return <TextContentEditor {...props} />;
            case 'quiz':
                return <QuizBuilder {...props} />;
            case 'assignment':
                return <AssignmentBuilder {...props} />;
            case 'presentation':
                return <PresentationBuilder {...props} />;
            default:
                return <p className="text-center text-muted-foreground">{t('select_content_type_prompt')}</p>;
        }
    };

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent 
                    className={`flex flex-col p-0 ${
                        isFullscreen 
                        ? 'fixed !top-[var(--app-header-height,72px)] !left-0 !w-screen !h-[calc(100vh_-_var(--app-header-height,72px))] !max-w-full !rounded-none !border-none !translate-x-0 !translate-y-0' 
                        : `max-h-[90vh] ${lesson.contentType === 'presentation' ? 'sm:max-w-6xl' : 'sm:max-w-3xl'}`
                    }`}
                >
                <DialogTitle className="sr-only">
                    {isNewLesson ? t('programs:create_new_lesson') : t('programs:edit_lesson')}
                </DialogTitle>
              <DialogDescription className="sr-only">
                    {t('programs:lesson_editor_description')}
                </DialogDescription>

                <Button 
                    size="icon" 
                    onClick={toggleFullscreen}
                    variant="ghost"
                    className="absolute top-2 right-12 h-9 w-9 z-10 "
                    title={isFullscreen ? t('common:minimize') : t('common:maximize')}
                >
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>

               <header className="flex-shrink-0 border-b py-3 pl-4 pr-24">
                    <div className="flex items-center gap-3">
                        {isNewLesson && (
                            <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0 -ml-2">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        )}
                        <div className="flex-grow min-w-0">
                            <Input 
                                id="lessonTitle" 
                                value={lesson.title || ''} 
                                onChange={(e) => setLesson(prev => ({...prev, title: e.target.value }))} 
                                placeholder={t('programs:field_title')}
                                className="w-full border-0 bg-transparent p-0 text-xl font-bold tracking-tight shadow-none ring-offset-0 placeholder:font-semibold placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-2xl"
                            />
                        </div>
                       <div className="flex flex-shrink-0 items-center gap-2">
                            <Badge variant="outline" className="hidden sm:inline-block">
                                {getTitleForContentType(lesson.contentType)}
                            </Badge>
                        </div>
                    </div>
                </header>
                
                <div className="flex-grow overflow-y-auto min-h-0">
                    <div className="p-6">
                        {renderContentEditor()}

                        <div className="mt-6 pt-6 border-t border-border/80">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                            {/* Content Length Input */}
                            <div className="space-y-2">
                                <Label htmlFor="contentDuration" className="flex items-center">
                                    {t('label_content_length', { ns: 'programs' })}
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button type="button" className="ml-1.5 cursor-default">
                                                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs">{t('tooltip_content_length', { ns: 'programs' })}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="contentDuration"
                                        type="number"
                                        step="0.1"
                                        value={contentDurationStr}
                                        onChange={(e) => {
                                            setContentDurationStr(e.target.value);
                                            handleDurationChange('contentDuration', e.target.value);
                                        }}
                                        onFocus={() => {
                                            setLesson(prev => ({ ...prev, contentDuration: { ...prev.contentDuration, source: 'manual' } }));
                                        }}
                                        placeholder="0"
                                        className="pr-12"
                                    />
                                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-muted-foreground">
                                        min
                                    </span>
                                </div>
                                {lesson.contentDuration?.source === 'auto_video' && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                        <Video className="h-3 w-3" />
                                        {t('auto_detected_label', { ns: 'programs' })}
                                    </p>
                                )}
                            </div>
                            
                            {/* Time to Complete Input */}
                            <div className="space-y-2">
                                <Label htmlFor="estimatedCompletionTime" className="flex items-center">
                                    {t('label_time_to_complete', { ns: 'programs' })}
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button type="button" className="ml-1.5 cursor-default">
                                                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs">{t('tooltip_time_to_complete', { ns: 'programs' })}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="estimatedCompletionTime"
                                        type="number"
                                        step="0.1"
                                        value={completionTimeStr}
                                        onChange={(e) => {
                                            setCompletionTimeStr(e.target.value);
                                            handleDurationChange('estimatedCompletionTime', e.target.value);
                                        }}
                                        placeholder="0"
                                        className="pr-12"
                                    />
                                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-muted-foreground">
                                        min
                                    </span>
                                </div>
                            </div>
                          </div>
                        </div>
                    </div>
                </div>
                <DialogFooter className="flex-shrink-0 border-t bg-muted/30 px-6 py-4">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>{t('common:cancel')}</Button>
                    <Button variant="save" type="submit" onClick={handleSaveClick}>
                        {t('common:save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default LessonEditor;