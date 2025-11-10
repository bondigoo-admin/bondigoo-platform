import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from 'react-query';
import { programKeys } from '../../hooks/usePrograms';
import { useParams, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useUserEnrollments, useProgramContent, useProgramLandingPage } from '../../hooks/usePrograms';
import { ProgramPlayerProvider } from '../../contexts/ProgramPlayerContext';
import CurriculumSidebar from '../player/CurriculumSidebar';
import LessonContent from '../player/LessonContent';
import { Loader2 } from 'lucide-react';


const ProgramPlayer = () => {
  const { programId } = useParams();
  const { t } = useTranslation(['pageTitles']);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    return () => {
      if (user?._id) {
        queryClient.invalidateQueries(programKeys.enrollments(user._id));
      }
    };
  }, [user, queryClient]);

  const { data: enrollments, isLoading: isLoadingEnrollments } = useUserEnrollments(user?._id);
  const { data: publicProgramData, isLoading: isLoadingPublicProgram } = useProgramLandingPage(programId);

  const isOwner = React.useMemo(() => 
    user?._id && publicProgramData?.coach?._id && user._id === publicProgramData.coach._id, 
    [user, publicProgramData]
  );

  const enrollment = React.useMemo(() =>
    enrollments?.find(e => e.program._id === programId),
    [enrollments, programId]
  );
  
  const canFetchContent = !!enrollment || isOwner;

  const {
    data: program,
    isLoading: isLoadingContent,
    isError: isContentError
  } = useProgramContent(programId, canFetchContent);

  // MOVED THIS LINE UP
  // It now has the data it needs (program, publicProgramData)
  const programForProvider = program || publicProgramData;

  // This useEffect can now safely access programForProvider
  useEffect(() => {
    if (programForProvider?.name) {
        document.title = t('pageTitles:programPlayer', '{{programName}} - Bondigoo', { programName: programForProvider.name });
    }
  }, [programForProvider, t]);

  const isLoading = isLoadingEnrollments || isLoadingPublicProgram || (canFetchContent && isLoadingContent);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  const shouldCreatePreviewEnrollment = isOwner && !enrollment;

  const playerEnrollment = shouldCreatePreviewEnrollment
    ? {
        _id: 'preview_enrollment',
        program: { _id: programId },
        progress: { completedLessons: [], lastViewedLesson: null, totalLessons: program?.totalLessons || publicProgramData?.totalLessons || 0 },
        isPreview: true,
      }
    : enrollment;

  if (!playerEnrollment) {
    return <Navigate to={`/programs/${programId}`} replace />;
  }

  // The variable is already defined, so we can remove the declaration from here.
  // const programForProvider = program || publicProgramData;

  if (isContentError || !programForProvider) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p className="text-red-500">Error loading program content. Please try again later.</p>
      </div>
    );
  }

  return (
   <ProgramPlayerProvider program={programForProvider} enrollment={playerEnrollment}>
      <div className="flex h-full w-full bg-background">
        <CurriculumSidebar />
       <main className="relative flex-1 flex flex-col overflow-hidden">
          <LessonContent />
        </main>
      </div>
    </ProgramPlayerProvider>
  );
};

export default ProgramPlayer;