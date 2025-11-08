import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePrograms } from '../hooks/usePrograms';
import ProgramCard from './programs/ProgramCard';
import { Loader2, ServerCrash, Frown } from 'lucide-react';
import { Button } from './ui/button.tsx';
import { Link } from 'react-router-dom';

const FeaturedPrograms = () => {
  const { t } = useTranslation(['home', 'programs', 'common']);
  const { data, status, error } = usePrograms({ sortBy: 'sales_desc', limit: 4 });

  const programs = data?.pages.flatMap(page => page.docs) || [];
  const isLoading = status === 'loading';

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 p-12 text-center min-h-[30vh]">
          <ServerCrash className="h-16 w-16 text-destructive" />
          <h2 className="mt-4 text-xl font-semibold text-destructive">{t('programs:programs_fetch_error_title')}</h2>
          <p className="mt-1 text-muted-foreground">{error.message}</p>
        </div>
      );
    }

    if (!programs || programs.length === 0) {
      return null;
    }

    return (
      <div className="relative -mx-4 px-4 lg:mx-0 lg:px-0">
        <div className="flex gap-6 overflow-x-auto pb-4 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {programs.map(program => (
            <div key={program._id} className="w-[80vw] max-w-[340px] flex-shrink-0 lg:w-full lg:max-w-none">
              <ProgramCard program={program} />
            </div>
          ))}
        </div>
        <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent pointer-events-none lg:hidden" />
      </div>
    );
  };
  
  const content = renderContent();

  if (!content) {
    return null;
  }

  return (
    <section className="py-16 sm:py-20 lg:py-24 bg-gradient-to-b from-background to-muted/20 dark:to-black/20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('featured_programs_title', 'Featured Programs')}
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">
            {t('featured_programs_subtitle', 'Discover our most popular programs and start your learning journey.')}
          </p>
        </div>
        
        {content}

        <div className="mt-12 text-center">
            <Button asChild size="lg">
              <Link to="/programs">{t('view_all_programs', 'View All Programs')}</Link>
            </Button>
        </div>
      </div>
    </section>
  );
};

export default FeaturedPrograms;