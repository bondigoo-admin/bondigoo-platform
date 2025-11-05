import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoachPrograms, useDeleteProgram, useCreateProgram  } from '../hooks/usePrograms';
import { useQueryClient } from 'react-query';
import ProgramCard from './programs/ProgramCard';
import { Button } from '../components/ui/button.tsx';
import { PlusCircle, Loader2, BookOpen, List, LayoutGrid } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.tsx';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.jsx';
import ProgramManagementHub from './programs/ProgramManagementHub';

const CoachProgramsTab = ({ coachId, onCreateProgram, onEditProgram }) => {
  const { t } = useTranslation(['programs', 'common', 'coach_dashboard']);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updatedAt_desc');
  const [view, setView] = useState('grid');

 const { data: programs, isLoading, isError, error } = useCoachPrograms(coachId, { 
    status: statusFilter, 
    sort: sortBy 
  });
  const deleteProgramMutation = useDeleteProgram();
  const createProgramMutation = useCreateProgram();
  const queryClient = useQueryClient();

  const handleCreateProgram = () => {
    const formData = new FormData();
    formData.append('programData', JSON.stringify({
        title: t('new_program_default_title', 'Untitled Program'),
        status: 'draft'
    }));
    
    createProgramMutation.mutate(formData, {
        onSuccess: (newProgram) => {
            toast.success(t('draft_created_success', 'Draft program created. You can start editing.'));
            onEditProgram(newProgram);
        },
        onError: (error) => {
            toast.error(error.message || t('common:error_generic'));
        }
    });
  };

  const handleDeleteProgram = (programToDelete) => {
    if (window.confirm(t('delete_program_confirmation', { title: programToDelete.title }))) {
      deleteProgramMutation.mutate(programToDelete._id);
    }
  };

  const handleEditProgram = (program) => {
    onEditProgram(program);
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
          <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
          <h4 className="mt-4 text-lg font-semibold">{t('no_programs_yet')}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{t('get_started_creating_program')}</p>
          <Button onClick={handleCreateProgram} className="mt-4">
            <PlusCircle size={18} className="sm:mr-2" />
            <span className="hidden sm:inline">{t('create_new_program')}</span>
          </Button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
    <section className="my-programs md:col-span-2 lg:col-span-3 bg-white p-6 rounded-lg shadow-sm border">
     <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
        <h3 className="flex items-center text-xl font-semibold">
          <BookOpen size={24} className="mr-3 text-primary" />
          {t('my_programs')}
        </h3>
        <ToggleGroup type="single" value={view} onValueChange={(value) => value && setView(value)}>
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
      
      {view === 'grid' ? (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-6">
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
              <Button onClick={handleCreateProgram} className="w-full sm:w-auto shrink-0" disabled={createProgramMutation.isLoading}>
                      {createProgramMutation.isLoading ? (
                          <Loader2 size={18} className="animate-spin sm:mr-2" />
                      ) : (
                          <PlusCircle size={18} className="sm:mr-2" />
                      )}
                      <span className="hidden sm:inline">{t('create_new_program')}</span>
                    </Button>
                </div>
              {renderContent()}
        </>
      ) : (
        <ProgramManagementHub />
      )}
    </section>
  );
};

export default CoachProgramsTab;