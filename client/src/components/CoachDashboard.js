import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import CoachProgramsTab from './CoachProgramsTab';
import AnalyticsDashboard from './AnalyticsDashboard';
import { Loader2, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx'; 
import ProgramCreator from './programs/ProgramCreator';
import DashboardOverviewTab from './dashboard/overview/DashboardOverviewTab';
import ManageSessions from './ManageSessions';
import ClientManagementTab from './ClientManagementTab';
import SettingsPage from './SettingsPage';
import { useQuery } from 'react-query';
import { getCoachProfile } from '../services/coachAPI';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.tsx';
import { Button } from './ui/button.tsx';
import { Progress } from './ui/progress.jsx';

const CoachDashboard = () => {
  const { t } = useTranslation(['programs', 'common', 'coach_dashboard', 'onboarding_coach', 'pageTitles']);
  const { user } = useAuth();
  const coachId = user?._id;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [programToEdit, setProgramToEdit] = useState(null);

  const { data: coachProfile, isLoading: isLoadingProfile } = useQuery(
    ['coachProfileForDashboard', coachId],
    () => getCoachProfile(coachId),
    { enabled: !!coachId && user.role === 'coach' }
  );

  const profileStrength = useMemo(() => {
    if (!coachProfile) return 0;
    let score = 10;
    if (coachProfile.profilePicture?.url) score += 15;
    if (coachProfile.headline?.length > 10) score += 15;
    if (coachProfile.specialties?.length > 0) score += 10;
    if (coachProfile.skills?.length > 0) score += 5;
    if (coachProfile.languages?.length > 0) score += 5;
    if (coachProfile.bio?.length > 0 && coachProfile.bio[0]?.content?.length > 50) score += 15;
    if (coachProfile.educationLevels?.length > 0 || coachProfile.coachingStyles?.length > 0) score += 10;
    if (coachProfile.baseRate?.amount > 0) score += 5;
    if (Object.values(coachProfile.settings?.availabilityManagement?.workingHours || {}).some(day => day.start && day.end)) score += 10;
    return Math.min(score, 100);
  }, [coachProfile]);

  useEffect(() => {
  document.title = t('pageTitles:coachDashboard', 'Coach Dashboard - Bondigoo');
  }, [t]);

  const handleCreateProgram = () => {
    setProgramToEdit(null);
    setIsCreatorOpen(true);
  };

  const handleEditProgram = (program) => {
    setProgramToEdit(program);
    setIsCreatorOpen(true);
  };

  const handleTabChange = (value) => {
    setSearchParams({ tab: value });
  };

  const welcomeMessage = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('overview.goodMorning', { name: user?.firstName });
    if (hour < 18) return t('overview.goodAfternoon', { name: user?.firstName });
    return t('overview.goodEvening', { name: user?.firstName });
  };

  if (!user || isLoadingProfile) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (coachProfile?.status === 'pending') {
    return (
      <div className="p-4 md:p-6 lg:p-8 flex items-center justify-center min-h-[calc(100vh-200px)]">
        <Alert className="max-w-2xl">
            <Sparkles className="h-4 w-4" />
            <AlertTitle className="text-xl font-bold">{t('onboarding_coach:pending.title')}</AlertTitle>
            <AlertDescription className="mt-2">
                {t('onboarding_coach:pending.description', { strength: profileStrength })}
            </AlertDescription>
            <Progress value={profileStrength} className="my-4" />
            <div className="mt-4">
                <Button asChild>
                    <Link to={`/coach-profile/${coachId}/setup`}>{t('onboarding_coach:pending.cta')}</Link>
                </Button>
            </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="coach-dashboard-container p-4 md:p-6 lg:p-8 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">{welcomeMessage()}</h1>
      
      <main className="coach-dashboard-main">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6">
              <TabsTrigger value="overview">{t('tabs.overview', {ns: 'coach_dashboard'})}</TabsTrigger>
              <TabsTrigger value="analytics">{t('tabs.analytics', {ns: 'coach_dashboard'})}</TabsTrigger>
              <TabsTrigger value="clients">{t('tabs.clients', {ns: 'coach_dashboard'})}</TabsTrigger>
              <TabsTrigger value="programs">{t('tabs.programs', {ns: 'coach_dashboard'})}</TabsTrigger>
              <TabsTrigger value="schedule">{t('tabs.schedule', {ns: 'coach_dashboard'})}</TabsTrigger>
              <TabsTrigger value="settings">{t('tabs.settings', {ns: 'coach_dashboard'})}</TabsTrigger>
          </TabsList>
            <TabsContent value="overview" className="mt-4">
                <DashboardOverviewTab />
            </TabsContent>
             <TabsContent value="analytics" className="mt-4">
                <AnalyticsDashboard programId={searchParams.get('programId')} />
            </TabsContent>
            <TabsContent value="clients" className="mt-4">
                <ClientManagementTab />
            </TabsContent>
            <TabsContent value="programs" className="mt-4">
                 <CoachProgramsTab 
                    coachId={coachId} 
                    onCreateProgram={handleCreateProgram}
                    onEditProgram={handleEditProgram}
                 />
            </TabsContent>
           <TabsContent value="schedule" className="mt-4">
                {user && <ManageSessions userId={user._id} isEmbedded={true} />}
            </TabsContent>
            <TabsContent value="settings" className="mt-4">
                <SettingsPage isEmbedded={true} />
            </TabsContent>
        </Tabs>
      </main>

      <ProgramCreator
        isOpen={isCreatorOpen}
        setIsOpen={setIsCreatorOpen}
        programToEdit={programToEdit}
      />
    </div>
  );
};

export default CoachDashboard;