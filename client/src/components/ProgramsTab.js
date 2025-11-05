import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrograms } from '../hooks/usePrograms';
import ProgramCard from './programs/ProgramCard';
import { Loader2, ServerCrash, BookOpen } from 'lucide-react';
import { Button } from './ui/button.tsx';

const ProgramsTab = ({ coachId }) => {
  const { t } = useTranslation(['programs', 'coachprofile']);
  
  const {
    data,
    error,
    isLoading,
    isError,
  } = usePrograms({ author: coachId, status: 'published' });

  const programs = useMemo(() => data?.pages.flatMap(page => page.docs) || [], [data]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-20">
        <ServerCrash className="h-16 w-16 mx-auto text-red-500" />
        <h2 className="mt-4 text-xl font-semibold">{t('programs_fetch_error_title')}</h2>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="py-8">
      {!programs || programs.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed rounded-lg">
          <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">{t('no_programs_title')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('no_programs_desc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.map((program) => (
            <ProgramCard key={program._id} program={program} view="client" />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProgramsTab;