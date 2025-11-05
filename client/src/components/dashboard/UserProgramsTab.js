import React, { useState, useMemo } from 'react';
import { useUserDashboard } from '../../hooks/useUserDashboard';
import ProgramCard from '../programs/ProgramCard';
import { Skeleton } from '../ui/skeleton.jsx';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs.tsx';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.tsx';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button.tsx';
import { Link } from 'react-router-dom';

const UserProgramsTab = () => {
    const { t } = useTranslation('userdashboard');
    const { enrollmentsData, isLoadingEnrollments, isErrorEnrollments } = useUserDashboard();
    const [filter, setFilter] = useState('all');

    const filteredEnrollments = useMemo(() => {
        const enrollments = enrollmentsData?.enrollments || [];
        if (filter === 'in-progress') {
            return enrollments.filter(e => (e.progress?.completionPercentage || 0) < 100 && (e.progress?.completionPercentage || 0) > 0);
        }
        if (filter === 'completed') {
            return enrollments.filter(e => (e.progress?.completionPercentage || 0) === 100);
        }
        // 'all' filter returns everything
        return enrollments;
    }, [enrollmentsData, filter]);

    if (isErrorEnrollments) {
        return (
            <Alert variant="destructive">
                <AlertTitle>{t('programs.errorTitle', 'Error Loading Programs')}</AlertTitle>
                <AlertDescription>{t('programs.errorDescription', 'We could not load your programs. Please try again later.')}</AlertDescription>
            </Alert>
        );
    }
    
    return (
        <div className="space-y-6">
            <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-bold tracking-tight">{t('programs.title', 'My Programs')}</h2>
                <Tabs defaultValue="all" onValueChange={setFilter}>
                    <TabsList>
                        <TabsTrigger value="all">{t('programs.all', 'All')}</TabsTrigger>
                        <TabsTrigger value="in-progress">{t('programs.inProgress', 'In Progress')}</TabsTrigger>
                        <TabsTrigger value="completed">{t('programs.completed', 'Completed')}</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
            
            {isLoadingEnrollments && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Skeleton className="h-80 w-full" />
                    <Skeleton className="h-80 w-full" />
                    <Skeleton className="h-80 w-full" />
                </div>
            )}

            {!isLoadingEnrollments && filteredEnrollments.length === 0 && (
                <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
                    <h3 className="text-lg font-semibold">{t('programs.emptyTitle', 'Your learning library is empty.')}</h3>
                    <p className="mt-1">{t('programs.emptySubtitle', 'Enroll in a program to see it here.')}</p>
                    <Button asChild size="sm" className="mt-4">
                        <Link to="/programs">{t('programs.cta', 'Explore Programs')}</Link>
                    </Button>
                </div>
            )}

            {!isLoadingEnrollments && filteredEnrollments.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredEnrollments.map(enrollment => (
                        <ProgramCard 
                            key={enrollment._id} 
                            program={enrollment.program} 
                            view="user"
                            progress={enrollment.progress?.completionPercentage || 0}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default UserProgramsTab;