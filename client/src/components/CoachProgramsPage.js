import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useCoachPrograms, useDeleteProgram, useCreateProgram  } from '../hooks/usePrograms';
import { useQueryClient } from 'react-query';
import ProgramCreator from './programs/ProgramCreator';
import ProgramCard from './programs/ProgramCard';
import { Button } from './ui/button.tsx';
import { PlusCircle, Loader2, BookOpen, LayoutGrid, Grid3x3, List } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.jsx';
import { cn } from '../lib/utils';
import ProgramManagementHub from './programs/ProgramManagementHub';

const CoachProgramsPage = () => {
  const { t } = useTranslation(['programs', 'common', 'coach_dashboard']);
  const { user } = useAuth();
  const coachId = user?._id;

  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [programToEdit, setProgramToEdit] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updatedAt_desc');
  const [view, setView] = useState('standard');
  const [dashboardView, setDashboardView] = useState('grid');

  const queryClient = useQueryClient();
  const { data: programs, isLoading, isError, error } = useCoachPrograms(coachId, { 
    status: statusFilter, 
    sort: sortBy 
  });
  const deleteProgramMutation = useDeleteProgram();
  const createProgramMutation = useCreateProgram();

   const handleCreateProgram = () => {
    const formData = new FormData();
    formData.append('programData', JSON.stringify({
        title: t('new_program_default_title', 'Standard'),
        status: 'draft'
    }));

    createProgramMutation.mutate(formData, {
        onSuccess: (newProgram) => {
            setProgramToEdit(newProgram);
            setIsCreatorOpen(true);
        },
        onError: (error) => {
            toast.error(error.message || t('common:error_generic'));
        }
    });
  };

  const handleEditProgram = (program) => {
    setProgramToEdit(program);
    setIsCreatorOpen(true);
  };

const handleDeleteProgram = (programToDelete) => {
    if (window.confirm(t('delete_program_confirmation', { title: programToDelete.title }))) {
      deleteProgramMutation.mutate(programToDelete._id);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (isError) {
      return (
        <div className="text-center py-10 text-red-500">
          <p>{t('common:error_generic')}</p>
          <p className="text-sm">{error.message}</p>
        </div>
      );
    }

    if (!programs || programs.length === 0) {
      return (
        <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted">
          <BookOpen className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h4 className="mt-4 text-lg font-semibold text-foreground">{t('no_programs_yet')}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{t('get_started_creating_program')}</p>
          <Button onClick={handleCreateProgram} className="w-full sm:w-auto shrink-0" disabled={createProgramMutation.isLoading}>
          {createProgramMutation.isLoading ? (
            <Loader2 size={18} className="animate-spin sm:mr-2" />
          ) : (
            <PlusCircle size={18} className="sm:mr-2" />
          )}
          <span className="hidden sm:inline">{t('create_new_program')}</span>
        </Button>
      </div>
      );
    }

    return (
      <div className={cn(
        "grid gap-6",
        {
          "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4": view === 'standard',
          "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5": view === 'compact',
        }
      )}>
        {programs.map((program) => (
          <ProgramCard
            key={program._id}
            program={program}
            view="coach"
            onEdit={handleEditProgram}
            onDelete={handleDeleteProgram}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('my_programs')}</h1>
          <p className="text-muted-foreground">{t('manage_your_programs_subtitle', 'Create, edit, and manage all of your coaching programs from here.')}</p>
        </div>
        <ToggleGroup type="single" value={dashboardView} onValueChange={(value) => value && setDashboardView(value)}>
            <ToggleGroupItem value="grid" aria-label="Grid View">
                <LayoutGrid className="mr-2 h-4 w-4" />
                {t('grid_view', { ns: 'coach_dashboard', defaultValue: 'Program Grid' })}
            </ToggleGroupItem>
            <ToggleGroupItem value="hub" aria-label="Management Hub">
                <List className="mr-2 h-4 w-4" />
                {t('management_hub', { ns: 'coach_dashboard', defaultValue: 'Management Hub' })}
            </ToggleGroupItem>
        </ToggleGroup>
      </div>
      
      {dashboardView === 'grid' ? (
        <>
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="all">{t('status_filters.all', 'All')}</TabsTrigger>
                        <TabsTrigger value="published">{t('status_filters.published', 'Published')}</TabsTrigger>
                        <TabsTrigger value="draft">{t('status_filters.draft', 'Drafts')}</TabsTrigger>
                    </TabsList>
                </Tabs>
                <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder={t('sort.placeholder', 'Sort by...')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="updatedAt_desc">{t('sort.most_recent', 'Most Recent')}</SelectItem>
                        <SelectItem value="enrollments_desc">{t('sort.most_enrollments', 'Most Enrollments')}</SelectItem>
                        <SelectItem value="revenue_desc">{t('sort.highest_revenue', 'Highest Revenue')}</SelectItem>
                        <SelectItem value="rating_desc">{t('sort.highest_rating', 'Highest Rating')}</SelectItem>
                        <SelectItem value="title_asc">{t('sort.title_az', 'Title (A-Z)')}</SelectItem>
                    </SelectContent>
                </Select>
                <ToggleGroup type="single" value={view} onValueChange={(val) => val && setView(val)} size="sm" className="hidden sm:flex">
                    <ToggleGroupItem value="standard" aria-label={t('viewStandard', 'Standard view')}><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
                    <ToggleGroupItem value="compact" aria-label={t('viewCompact', 'Compact view')}><Grid3x3 className="h-4 w-4" /></ToggleGroupItem>
                </ToggleGroup>
                </div>
                <Button onClick={handleCreateProgram} className="w-full sm:w-auto shrink-0">
                <PlusCircle size={18} className="sm:mr-2" />
                <span className="hidden sm:inline">{t('create_new_program')}</span>
                </Button>
            </div>

            <div className="pt-2">
                {renderContent()}
            </div>
        </>
      ) : (
        <ProgramManagementHub />
      )}

      <ProgramCreator
        isOpen={isCreatorOpen}
        setIsOpen={setIsCreatorOpen}
        programToEdit={programToEdit}
      />
    </div>
  );
};

export default CoachProgramsPage;