import React, { useEffect } from 'react';
import { useProgramPlayer } from '../../contexts/ProgramPlayerContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible.jsx';
import { Progress } from '../ui/progress.jsx';
import { Button } from '../ui/button.tsx';
import { CheckCircle, ChevronDown, PlayCircle, FileText, Lock, ChevronLeft, BookOpen, BrainCircuit, Eye, Presentation, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '../ui/scroll-area.jsx';
import { logger } from '../../utils/logger.js';

const getIcon = (contentType) => {
  const props = { className: "h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" };
  switch (contentType) {
    case 'video': return <PlayCircle {...props} />;
    case 'text': return <FileText {...props} />;
    case 'document': return <FileText {...props} />;
    case 'quiz': return <BrainCircuit {...props} />;
    case 'assignment': return <BookOpen {...props} />;
    case 'presentation': return <Presentation {...props} />;
    default: return <FileText {...props} />;
  }
};

const CurriculumSidebar = () => {
  const {
    program,
    enrollment,
    currentLesson,
    setCurrentLesson,
    isSidebarOpen,
    toggleSidebar,
    currentSubComponentIndex,
    setCurrentSubComponentIndex,
    isModuleCompleted,
  } = useProgramPlayer();
  const { t } = useTranslation(['programs', 'common']);

  useEffect(() => {
    logger.info(`[SIDEBAR_TRACE] Sidebar re-rendered or enrollment/lesson changed.`);
    if (enrollment && program) {
      logger.info(`   - Total Lessons: ${program.totalLessons}`);
      logger.info(`   - Completed Count: ${enrollment.progress.completedLessons.length}`);
    }
  }, [enrollment, program, currentLesson]);


  if (!program || !enrollment) {
    return null;
  }

  const isPreview = enrollment.isPreview;
  const completedLessonsCount = isPreview ? 0 : enrollment.progress.completedLessons.length;
  const totalLessonsCount = program.totalLessons;
  const progressPercentage = totalLessonsCount > 0 ? (completedLessonsCount / totalLessonsCount) * 100 : 0;

  if (!isSidebarOpen) {
    return (
    <aside className="h-full bg-card border-r border-border p-2">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label={t('open_sidebar', { ns: 'common' })}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </aside>
    );
  }

    return (
   <aside className="h-full w-80 bg-card border-r border-border flex flex-col">
      {isPreview && (
        <div className="flex items-center justify-center py-2 px-4 bg-primary text-primary-foreground text-sm font-medium">
          <Eye className="h-4 w-4 mr-2" /> {t('preview_mode')}
        </div>
      )}
    <div className="flex h-16 items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <h2 className="text-lg font-semibold truncate">{program.title}</h2>
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="text-muted-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>
      <div className="p-4 border-b border-border/80">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-sm font-medium text-foreground">{t('progress')}</span>
          <span className="text-sm font-semibold text-muted-foreground">{Math.round(progressPercentage)}%</span>
        </div>
        <Progress value={progressPercentage} className="w-full h-2" />
        <p className="text-xs text-muted-foreground mt-1.5">{t('lessonsCompleted', { completed: completedLessonsCount, total: totalLessonsCount })}</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {program.modules.map((module, moduleIndex) => {
            const isPreviousModuleCompleted = moduleIndex === 0 ? true : isModuleCompleted(program.modules[moduleIndex - 1]._id);
            const isModuleLocked = module.isGated && !isPreviousModuleCompleted && !isPreview;

            return (
            <Collapsible key={module._id} defaultOpen={true} className="w-full">
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md p-3 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" disabled={isModuleLocked}>
                <div className="flex items-center flex-1 min-w-0">
                  {isModuleLocked && <Lock className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />}
                  <span className="font-semibold text-sm truncate">
                    {module.title}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 transition-transform duration-200 shrink-0 ml-2 [&[data-state=open]]:rotate-180" />
              </CollapsibleTrigger>
                <CollapsibleContent>
                <ul className="py-1 space-y-1">
                  {module.lessons.map(lesson => {
                    const isCompleted = !isPreview && enrollment.progress.completedLessons.includes(lesson._id);
                    const isCurrent = currentLesson?._id === lesson._id;
                    const isLessonLocked = isModuleLocked;
                    const isMultiPart = (lesson.contentType === 'document' || lesson.contentType === 'video') && lesson.content?.files?.length > 1;
                    const lessonDetail = enrollment.progress?.lessonDetails?.find(ld => ld.lesson === lesson._id);

                    return (
                      <li key={lesson._id}>
                        <button
                          onClick={() => !isLessonLocked && setCurrentLesson(lesson)}
                          disabled={isLessonLocked}
                          className={cn(
                            'flex w-full items-center rounded-md py-2.5 px-3 pl-8 text-sm text-left transition-colors hover:bg-muted disabled:cursor-not-allowed',
                            isCurrent && 'bg-primary/10 text-primary font-semibold',
                            isLessonLocked && 'text-muted-foreground opacity-60'
                          )}
                        >
                          {isLessonLocked ? <Lock className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" /> : getIcon(lesson.contentType)}
                          <span className="flex-1 truncate">{lesson.title}</span>
                          {isCompleted && !isLessonLocked && <CheckCircle className="h-4 w-4 text-green-500 ml-2 flex-shrink-0" />}
                        </button>
                         {isCurrent && isMultiPart && (
                          <ul className="my-1 ml-7 space-y-1 border-l-2 pl-4">
                            {lesson.content.files.map((file, idx) => {
                              const isSubComponentActive = currentSubComponentIndex === idx;
                              const isSubComponentCompleted = !isPreview && lessonDetail?.completedFileIds?.includes(file.publicId);
                              const Icon = lesson.contentType === 'video' ? PlayCircle : FileText;

                              return (
                                <li key={file.publicId || idx}>
                                  <button
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-md p-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                                      isSubComponentActive && 'bg-muted text-primary font-semibold'
                                    )}
                                    onClick={() => setCurrentSubComponentIndex(idx)}
                                  >
                                    <Icon className={cn('h-4 w-4 shrink-0', isSubComponentActive ? 'text-primary' : 'text-muted-foreground')} />
                                    <span className="flex-1 truncate">{file.name || `${t(`content_type_${lesson.contentType}`)} ${idx + 1}`}</span>
                                    {isSubComponentCompleted && <CheckCircle className="h-4 w-4 text-green-500 ml-2 flex-shrink-0" />}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )})}
        </div>
      </ScrollArea>
    </aside>
  );
};

export default CurriculumSidebar;