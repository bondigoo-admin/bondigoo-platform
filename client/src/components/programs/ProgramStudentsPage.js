import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import { getProgramEnrollments, getProgramLandingPage } from '../../services/programAPI';
import { useAllCoachParticipants } from '../../hooks/usePrograms';
import { Input } from '../ui/input.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';
import { Users, AlertCircle, ArrowLeft, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion.jsx';

const ProgramStudentsPage = ({ viewMode = 'singleProgram' }) => {
  const { programId } = useParams();
  const { t, i18n } = useTranslation(['programs', 'common']);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: hubData, isLoading: isLoadingHub, isError: isHubError, error: hubError } = useAllCoachParticipants({ enabled: viewMode === 'hub' });
  const { data: program, isLoading: isLoadingProgram } = useQuery(['program', programId], () => getProgramLandingPage(programId), { enabled: viewMode === 'singleProgram' });
  const { data: enrollments, isLoading: isLoadingEnrollments, isError, error } = useQuery(['programEnrollments', programId], () => getProgramEnrollments(programId), { enabled: viewMode === 'singleProgram' });

  const formatDate = (date) => {
    try {
      return format(new Date(date), 'PP');
    } catch {
      return 'N/A';
    }
  };

  const getInitials = (user) => {
    return `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();
  }
  
  const renderStudentTable = (enrollmentList) => {
      const filtered = enrollmentList.filter(enrollment =>
          enrollment.user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          enrollment.user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          enrollment.user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      return (
        <div className="border rounded-lg overflow-hidden">
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead className="w-[45%]">{t('student_name_header', 'Student')}</TableHead>
                    <TableHead>{t('enrolled_on_header', 'Enrolled On')}</TableHead>
                    <TableHead>{t('progress_header', 'Progress')}</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {filtered.map((enrollment) => (
                    <TableRow key={enrollment._id}>
                    <TableCell>
                        <div className="flex items-center gap-3">
                        <Avatar>
                            <AvatarImage src={enrollment.user.profilePicture?.url} />
                            <AvatarFallback>{getInitials(enrollment.user)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <p className="font-medium">{enrollment.user.firstName} {enrollment.user.lastName}</p>
                            <p className="text-sm text-muted-foreground">{enrollment.user.email}</p>
                        </div>
                        </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(enrollment.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">
                        {`${enrollment.progress?.completedLessons?.length || 0} / ${enrollment.progress?.totalLessons || 0} ${t('lessons_completed', 'lessons')}`}
                    </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </div>
      );
  }

  if (viewMode === 'hub') {
    if (isLoadingHub) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    if (isHubError) return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>{t('common:error_generic_title')}</AlertTitle><AlertDescription>{hubError?.message}</AlertDescription></Alert>;
    if (!hubData || hubData.length === 0) {
        return (
            <div className="text-center py-12 border-2 border-dashed rounded-lg bg-card">
                <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                <h4 className="mt-4 text-lg font-semibold">{t('no_students_enrolled', 'No Students Enrolled Yet')}</h4>
                <p className="mt-1 text-sm text-muted-foreground">{t('students_will_appear_here', 'When students enroll in any of your programs, they will appear here.')}</p>
            </div>
        );
    }
    return (
        <div className="space-y-6">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                    placeholder={t('search_students_placeholder', 'Search by name or email...')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full md:w-1/2"
                />
            </div>
            <Accordion type="multiple" className="w-full space-y-4">
                {hubData.map(programGroup => (
                    <AccordionItem value={programGroup.programId} key={programGroup.programId} className="border rounded-lg overflow-hidden">
                        <AccordionTrigger className="text-base font-semibold hover:no-underline bg-muted/50 px-4 py-3">
                             <div className="flex items-center gap-2">
                                <span>{programGroup.programTitle}</span>
                                <span className="text-sm font-normal bg-background text-muted-foreground rounded-full px-2 py-0.5">{programGroup.items.length} {t('students', 'Students')}</span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-4">
                           {renderStudentTable(programGroup.items)}
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    )
  }

  const renderSkeleton = () => (
    <div className="space-y-4">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-10 w-full" />
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><Skeleton className="h-5 w-32" /></TableHead>
              <TableHead><Skeleton className="h-5 w-24" /></TableHead>
              <TableHead><Skeleton className="h-5 w-48" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-5 w-40" /></div></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-48" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  if (isLoadingProgram || isLoadingEnrollments) {
    return <div className="max-w-4xl mx-auto p-4 md:p-6">{renderSkeleton()}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" className="pl-0 text-sm text-muted-foreground hover:text-foreground">
            <Link to="/dashboard?tab=programs"><ArrowLeft className="mr-2 h-4 w-4" />{t('back_to_programs', 'Back to Programs')}</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">{program?.title}</h1>
        <p className="flex items-center text-lg text-muted-foreground"><Users className="mr-2 h-5 w-5" />{t('student_roster_title', 'Student Roster')}</p>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('common:error_generic_title')}</AlertTitle>
          <AlertDescription>{error?.message || t('common:error_generic')}</AlertDescription>
        </Alert>
      )}

      {enrollments && enrollments.length > 0 ? (
        <>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                    placeholder={t('search_students_placeholder', 'Search by name or email...')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full md:w-1/2"
                />
            </div>
            {renderStudentTable(enrollments)}
        </>
      ) : (
         <div className="text-center py-12 border-2 border-dashed rounded-lg bg-card">
          <Users className="mx-auto h-12 w-12 text-muted-foreground" />
          <h4 className="mt-4 text-lg font-semibold">{t('no_students_enrolled', 'No Students Enrolled Yet')}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{t('students_will_appear_here', 'When students enroll in this program, they will appear here.')}</p>
        </div>
      )}
    </div>
  );
};

export default ProgramStudentsPage;