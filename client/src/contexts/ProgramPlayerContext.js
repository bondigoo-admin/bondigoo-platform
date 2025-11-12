import React, { createContext, useState, useContext, useMemo, useEffect, useCallback } from 'react';
import { useQueryClient } from 'react-query'; // Import useQueryClient
import { toast } from 'react-hot-toast'; // Import toast for error handling
import { updateUserProgress } from '../services/programAPI'; // Import the raw API function
import { logger } from '../utils/logger'; // Assuming you have a logger utility
import { useTranslation } from 'react-i18next';

const ProgramPlayerContext = createContext();

export const ProgramPlayerProvider = ({ children, program: initialProgram, enrollment: initialEnrollment }) => {
  const { t } = useTranslation(['programs', 'common']);
  const queryClient = useQueryClient();
  const [program, setProgram] = useState(initialProgram);
  const [enrollment, setEnrollment] = useState(initialEnrollment);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isUpdatingProgress, setIsUpdatingProgress] = useState(false);
  const [currentSubComponentIndex, setCurrentSubComponentIndex] = useState(0);

  // Sync with props
  useEffect(() => {
    setProgram(initialProgram);
  }, [initialProgram]);

  useEffect(() => {
    //logger.info(`[CONTEXT_TRACE] Enrollment prop updated. New completed count: ${initialEnrollment?.progress?.completedLessons?.length}`);
    setEnrollment(initialEnrollment);
  }, [initialEnrollment]);

  // Logic to find and set the current lesson
  useEffect(() => {
    const findInitialLesson = () => {
      //logger.info(`[CONTEXT_TRACE] Running 'findInitialLesson' logic.`);
      if (!program || !program.modules || program.modules.length === 0) {
        logger.warn(`[CONTEXT_TRACE] 'findInitialLesson' aborted: Program has no modules.`);
        return null;
      }

      const allLessons = program.modules.flatMap(module => module.lessons || []);
      if (allLessons.length === 0) {
        logger.warn(`[CONTEXT_TRACE] 'findInitialLesson' aborted: Program has no lessons.`);
        return null;
      }

      if (enrollment?.isPreview) {
        //logger.info(`[CONTEXT_TRACE] 'findInitialLesson': In preview mode, selecting first lesson.`);
        return allLessons[0];
      }

      const completedLessonIds = new Set(enrollment?.progress?.completedLessons || []);
      //logger.info(`[CONTEXT_TRACE] 'findInitialLesson': User has ${completedLessonIds.size} completed lessons.`);
      const nextIncompleteLesson = allLessons.find(lesson => !completedLessonIds.has(lesson._id));
      
      if (nextIncompleteLesson) {
          //logger.info(`[CONTEXT_TRACE] 'findInitialLesson': Found next incomplete lesson: "${nextIncompleteLesson.title}"`);
          return nextIncompleteLesson;
      } else {
          //logger.info(`[CONTEXT_TRACE] 'findInitialLesson': All lessons complete, selecting the last one.`);
          return allLessons[allLessons.length - 1];
      }
    };
    
    const isCurrentLessonValid = currentLesson && program?.modules?.some(module =>
        module.lessons.some(lesson => lesson._id === currentLesson._id)
    );

    if (!isCurrentLessonValid) {
        //logger.info(`[CONTEXT_TRACE] Current lesson is invalid or not set. Running findInitialLesson.`);
        const lessonToSet = findInitialLesson();
        setCurrentLesson(lessonToSet);
        if (lessonToSet) {
           //logger.info(`[CONTEXT_TRACE] Setting initial lesson to: "${lessonToSet.title}"`);
        }
    } else {
        //logger.info(`[CONTEXT_TRACE] Current lesson "${currentLesson.title}" is still valid. No change.`);
    }

  }, [program, enrollment, currentLesson]); 

  useEffect(() => {
    //logger.info(`[CONTEXT_TRACE] Current lesson changed to "${currentLesson?.title}". Resetting sub-component index to 0.`);
    setCurrentSubComponentIndex(0);
  }, [currentLesson?._id]);

   const isModuleCompleted = useCallback((moduleId) => {
    if (!program || !enrollment || enrollment.isPreview) return false;
    
    const module = program.modules.find(m => m._id === moduleId);
    if (!module || !module.lessons || module.lessons.length === 0) {
        return true; // An empty module is considered complete.
    }

    const completedLessonIds = new Set(enrollment.progress.completedLessons);
    return module.lessons.every(lesson => completedLessonIds.has(lesson._id));

  }, [program, enrollment]);

  const findLessonById = useCallback((lessonId) => {
    if (!program?.modules) return null;
    for (const mod of program.modules) {
      const found = mod.lessons.find(l => l._id === lessonId);
      if (found) return found;
    }
    return null;
  }, [program]);

  const goToNextLesson = useCallback(() => {
    //logger.info(`[CONTEXT_TRACE] Running 'goToNextLesson'. Current: "${currentLesson?.title}"`);
    if (!currentLesson || !program?.modules) return;

    let currentModuleIndex = -1;
    let currentLessonIndex = -1;

    program.modules.forEach((mod, modIndex) => {
      const lessonIndex = mod.lessons.findIndex(l => l._id === currentLesson._id);
      if (lessonIndex !== -1) {
        currentModuleIndex = modIndex;
        currentLessonIndex = lessonIndex;
      }
    });

    if (currentModuleIndex === -1) {
        logger.warn(`[CONTEXT_TRACE] 'goToNextLesson': Could not find current lesson in program structure.`);
        return;
    }

    const currentModule = program.modules[currentModuleIndex];
    if (currentLessonIndex < currentModule.lessons.length - 1) {
      const nextLesson = currentModule.lessons[currentLessonIndex + 1];
      //logger.info(`[CONTEXT_TRACE] 'goToNextLesson': Moving to next lesson in same module: "${nextLesson.title}"`);
      setCurrentLesson(nextLesson);
    } else if (currentModuleIndex < program.modules.length - 1) {
      const nextModule = program.modules[currentModuleIndex + 1];
      if (nextModule?.lessons?.length > 0) {
        const nextLesson = nextModule.lessons[0];
        //logger.info(`[CONTEXT_TRACE] 'goToNextLesson': Moving to first lesson of next module: "${nextLesson.title}"`);
        setCurrentLesson(nextLesson);
      }
    } else {
        //logger.info(`[CONTEXT_TRACE] 'goToNextLesson': Already on the last lesson.`);
    }
  }, [currentLesson, program]);
  
const completeCurrentLesson = useCallback(() => {
    logger.info(`[CONTEXT_TRACE] 1. ENTERING 'completeCurrentLesson' (Optimistic)`);
    if (!currentLesson || !enrollment || enrollment.isPreview) {
      logger.warn(`[CONTEXT_TRACE] 2. ABORTED: Missing data or in preview mode.`);
      return;
    }

    const originalEnrollment = enrollment;
    const optimisticEnrollment = {
      ...enrollment,
      progress: {
        ...enrollment.progress,
        completedLessons: [...new Set([...enrollment.progress.completedLessons, currentLesson._id])],
        lastViewedLesson: currentLesson._id,
      },
    };

    logger.info(`[CONTEXT_TRACE] 3. Optimistically updating UI. New completed count: ${optimisticEnrollment.progress.completedLessons.length}`);
    setEnrollment(optimisticEnrollment);
    setIsUpdatingProgress(true);

    updateUserProgress(enrollment._id, { lessonId: currentLesson._id, fileId: null })
      .then(serverEnrollment => {
        logger.info(`[CONTEXT_TRACE] 4a. SUCCESS: Server confirmed progress. Syncing state.`);
        setEnrollment(serverEnrollment);
        queryClient.setQueryData(['enrollments', enrollment.user], (oldData) =>
          (oldData || []).map(e => e._id === serverEnrollment._id ? serverEnrollment : e)
        );
      })
      .catch(error => {
        logger.error(`[CONTEXT_TRACE] 4b. FAILED: Server returned error. Rolling back UI.`, { error: error.message });
        setEnrollment(originalEnrollment);
        const userMessage = error.response?.data?.message || t('common:something_went_wrong');
        toast.error(userMessage);
      })
      .finally(() => {
        setIsUpdatingProgress(false);
      });

  }, [currentLesson, enrollment, queryClient, t]);

const completeCurrentSubItem = useCallback((fileId) => {
    logger.info(`[CONTEXT_TRACE] 1. ENTERING 'completeCurrentSubItem' (Optimistic) for file: ${fileId}`);
    if (!currentLesson || !enrollment || !fileId || enrollment.isPreview) {
      logger.warn(`[CONTEXT_TRACE] 2. ABORTED: Missing data or in preview mode.`);
      return;
    }
    
    const originalEnrollment = enrollment;
    
    const lessonDetailIndex = enrollment.progress.lessonDetails.findIndex(ld => ld.lesson === currentLesson._id);
    const newLessonDetails = JSON.parse(JSON.stringify(enrollment.progress.lessonDetails));
    let isLessonNowComplete = false;

    if (lessonDetailIndex === -1) {
      newLessonDetails.push({ lesson: currentLesson._id, status: 'in_progress', completedFileIds: [fileId] });
    } else {
      const completedFiles = new Set(newLessonDetails[lessonDetailIndex].completedFileIds || []);
      completedFiles.add(fileId);
      newLessonDetails[lessonDetailIndex].completedFileIds = Array.from(completedFiles);
      
      const lessonFromServer = program.modules.flatMap(m => m.lessons).find(l => l._id === currentLesson._id);
      const totalFiles = lessonFromServer?.content?.files?.length || 0;
      if (totalFiles > 0 && newLessonDetails[lessonDetailIndex].completedFileIds.length >= totalFiles) {
        isLessonNowComplete = true;
        newLessonDetails[lessonDetailIndex].status = 'completed';
      }
    }

    const newCompletedLessons = isLessonNowComplete
      ? [...new Set([...enrollment.progress.completedLessons, currentLesson._id])]
      : enrollment.progress.completedLessons;

    const optimisticEnrollment = {
      ...enrollment,
      progress: {
        ...enrollment.progress,
        completedLessons: newCompletedLessons,
        lessonDetails: newLessonDetails,
        lastViewedLesson: currentLesson._id
      }
    };
    
    logger.info(`[CONTEXT_TRACE] 3. Optimistically updating UI. New lesson completion status: ${isLessonNowComplete}`);
    setEnrollment(optimisticEnrollment);
    setIsUpdatingProgress(true);

    updateUserProgress(enrollment._id, { lessonId: currentLesson._id, fileId })
      .then(serverEnrollment => {
        logger.info(`[CONTEXT_TRACE] 4a. SUCCESS: Server confirmed sub-item progress. Syncing state.`);
        setEnrollment(serverEnrollment);
        queryClient.setQueryData(['enrollments', enrollment.user], (oldData) =>
          (oldData || []).map(e => e._id === serverEnrollment._id ? serverEnrollment : e)
        );
      })
      .catch(error => {
        logger.error(`[CONTEXT_TRACE] 4b. FAILED: Server returned error on sub-item. Rolling back UI.`, { error: error.message });
        setEnrollment(originalEnrollment);
        const userMessage = error.response?.data?.message || t('common:something_went_wrong');
        toast.error(userMessage);
      })
      .finally(() => {
        setIsUpdatingProgress(false);
      });
  }, [currentLesson, enrollment, queryClient, program, t]);

    const isLastLesson = useMemo(() => {
    if (!program?.modules || !currentLesson) return false;
    const allLessons = program.modules.flatMap(module => module.lessons || []);
    if (allLessons.length === 0) return false;
    return allLessons[allLessons.length - 1]?._id === currentLesson._id;
  }, [program, currentLesson]);

  const value = useMemo(() => ({
    program,
    enrollment,
    setEnrollment,
    currentLesson,
    setCurrentLesson,
    isSidebarOpen,
    toggleSidebar: () => setIsSidebarOpen(prev => !prev),
    findLessonById,
    goToNextLesson,
    completeCurrentLesson,
    completeCurrentSubItem,
    isUpdatingProgress,
    currentSubComponentIndex,
    setCurrentSubComponentIndex,
    isLastLesson,
    isModuleCompleted,
  }), [
      program, 
      enrollment, 
      setEnrollment,
      currentLesson, 
      setCurrentLesson,
      isSidebarOpen, 
      findLessonById, 
      goToNextLesson, 
      completeCurrentLesson,
      completeCurrentSubItem, 
      isUpdatingProgress, 
      currentSubComponentIndex,
      isLastLesson,
      isModuleCompleted
  ]);

  return (
    <ProgramPlayerContext.Provider value={value}>
      {children}
    </ProgramPlayerContext.Provider>
  );
};

export const useProgramPlayer = () => {
  const context = useContext(ProgramPlayerContext);
  if (context === undefined) {
    throw new Error('useProgramPlayer must be used within a ProgramPlayerProvider');
  }
  return context;
};