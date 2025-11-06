import React, { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/card.tsx';
import { Badge } from '../ui/badge.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.tsx';
import { Button } from '../ui/button.tsx';
import { Star, Users, HandCoins, Library, FileText, Trash2, Clock, Video, BookOpen, MoreVertical, Edit, BarChart2, MessageSquare, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import { useProgramReviews } from '../../hooks/usePrograms';
import { cn } from '../../lib/utils';
import { logger } from '../../utils/logger';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';
import { Progress } from '../ui/progress.jsx';
import CustomVideoPlayer from '../player/CustomVideoPlayer.js';

const ProgramCard = ({ program, view = 'client', onEdit, onDelete, progress = 0, isEnrolled = false, ...rest }) => {
  useEffect(() => {
    if (Object.keys(rest).length > 0) {
      logger.warn('[ProgramCard Diagnostic] Received unexpected props:', rest);
    }
  }, [rest]);
  logger.debug(`[ProgramCard] Rendering card for program "${program.title}" (ID: ${program._id}). isEnrolled: ${isEnrolled}`);
  const { t, i18n } = useTranslation(['programs', 'common']);
  const navigate = useNavigate();

  const { data: reviews } = useProgramReviews(program._id);
  
  const isUserView = view === 'user';
  const completionPercentage = progress;

  const displayStats = useMemo(() => {
    if (reviews && reviews.length > 0) {
      const totalRating = reviews.reduce((acc, review) => acc + review.rating, 0);
      return { averageRating: totalRating / reviews.length, reviewCount: reviews.length };
    }
    return { averageRating: program.averageRating || 0, reviewCount: program.reviewCount || 0 };
  }, [reviews, program.averageRating, program.reviewCount]);

  const { totalLessons, formattedContentDuration, formattedCompletionTime } = useMemo(() => {
    const totalLessons = program.totalLessons ?? (program.modules?.reduce((acc, mod) => acc + (mod.lessons?.length || 0), 0) || 0);

    const formatHumanReadableDuration = (totalMinutes) => {
      if (!totalMinutes || totalMinutes < 1) return null;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const parts = [];
      if (hours > 0) parts.push(`${hours}${t('common:hours_short', 'h')}`);
      if (minutes > 0) parts.push(`${minutes}${t('common:minutes_short', 'm')}`);
      return parts.join(' ');
    };

    return {
      totalLessons,
      formattedContentDuration: formatHumanReadableDuration(program.contentDuration?.minutes),
      formattedCompletionTime: formatHumanReadableDuration(program.estimatedCompletionTime?.minutes),
    };
  }, [program.totalLessons, program.modules, program.contentDuration, program.estimatedCompletionTime, t]);

  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);

  const allMedia = useMemo(() => {
    const media = [];
    if (program.trailerVideo?.url && program.trailerVideo?.thumbnail) {
      media.push({
        type: 'video',
        url: program.trailerVideo.thumbnail,
        ...program.trailerVideo,
      });
    }
    if (program.programImages?.length) {
      media.push(...program.programImages.map(img => ({ ...img, type: 'image' })));
    }
    return media;
  }, [program.programImages, program.trailerVideo]);

  useEffect(() => {
    const mainImageIndex = allMedia.findIndex(m => m.isMain);
    setCurrentMediaIndex(mainImageIndex > -1 ? mainImageIndex : 0);
  }, [allMedia]);

  const handleNextMedia = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setCurrentMediaIndex(prev => (prev + 1) % allMedia.length);
  };

  const handlePrevMedia = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setCurrentMediaIndex(prev => (prev - 1 + allMedia.length) % allMedia.length);
  };

  const currentMedia = allMedia[currentMediaIndex];
  
  const coachInitials = program.coach ? `${program.coach.firstName?.[0] || ''}${program.coach.lastName?.[0] || ''}` : 'N/A';
  
  const coachProfilePictureUrl = program.coach 
    ? program.coach.coachProfilePicture?.url || program.coach.profilePicture?.url
    : null;

  const formatCurrency = (amount, currency = 'USD') => {
    if (amount === undefined || amount === null) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStrOrObj) => {
    if (!dateStrOrObj) return t('common:notSet');
    const date = new Date(dateStrOrObj);
    return date.toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleEditClick = () => { if (typeof onEdit === 'function') onEdit(program); };
  const handleDeleteClick = () => { if (typeof onDelete === 'function') onDelete(program); };
  
  if (isUserView) {
    return (
      <TooltipProvider delayDuration={100}>
        <Card className="flex flex-col h-full bg-card overflow-hidden transition-shadow duration-300 shadow-sm hover:shadow-xl border dark:border-slate-800">
            <div className="group block outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-t-lg">
                <div className="relative w-full overflow-hidden">
                    <Link to={`/learn/program/${program._id}`} className="absolute inset-0 z-10" aria-label={program.title} />
                    <div className="w-full aspect-[16/9] bg-muted dark:bg-slate-800">
                        {currentMedia ? (
                             currentMedia.type === 'video' ? (
                                <CustomVideoPlayer
                                    previewMode
                                    videoFile={{
                                        url: currentMedia.url,
                                        thumbnailUrl: currentMedia.thumbnail,
                                        trimStart: currentMedia.trimStart,
                                        trimEnd: currentMedia.trimEnd,
                                    }}
                                />
                            ) : (
                                <img src={currentMedia.url} alt={program.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                            )
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/50">
                                <BookOpen className="w-16 h-16" />
                            </div>
                        )}
                    </div>
                    {allMedia.length > 1 && (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handlePrevMedia} 
                                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label={t('common:previous')}
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleNextMedia} 
                                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label={t('common:next')}
                            >
                                <ChevronRight className="h-5 w-5" />
                            </Button>
                        </>
                    )}
                    <div className="absolute bottom-2 right-2 z-20 flex flex-col items-end gap-1.5">
                      {formattedContentDuration && (
                        <div className="flex items-center gap-1.5 rounded-sm bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                          <Video className="h-3.5 w-3.5" />
                          <span>{formattedContentDuration}</span>
                        </div>
                      )}
                      {formattedCompletionTime && (
                        <div className="flex items-center gap-1.5 rounded-sm bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formattedCompletionTime}</span>
                        </div>
                      )}
                    </div>
                </div>
            </div>
            <CardContent className="p-4 flex flex-col flex-grow">
                <div className="flex items-start gap-2">
                    <h3 className="flex-grow text-base font-semibold leading-snug text-foreground" title={program.title}>
                        <Link to={`/learn/program/${program._id}`} className="hover:text-primary transition-colors focus:outline-none relative z-20">{program.title}</Link>
                    </h3>
                    {isEnrolled && (
                        <Tooltip>
                            <TooltipTrigger>
                                <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{t('card_enrolled_tooltip', { ns: 'programs', defaultValue: 'You are enrolled in this program' })}</p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
                
                <div className="flex items-center gap-2 mt-2">
                    <Avatar className="h-6 w-6 flex-shrink-0">
                      <AvatarImage src={coachProfilePictureUrl} />
                      <AvatarFallback className="text-xs">{coachInitials}</AvatarFallback>
                    </Avatar>
                    <p className="text-sm text-muted-foreground">
                        <Link to={`/coach/${program.coach?._id}`} className="font-medium hover:underline relative z-20">{`${program.coach?.firstName} ${program.coach?.lastName}`}</Link>
                    </p>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {program.skillLevel?.map(level => {
                    if (typeof level !== 'object' || !level.name) return null;
                    const levelName = level.translations?.[i18n.language] || level.name;
                    return ( <Badge key={level._id} variant="secondary" className="px-2 py-0.5 text-xs font-medium">{levelName}</Badge> );
                  })}
                  {program.language?.map(lang => {
                    if (typeof lang !== 'object' || !lang.name) return null;
                    return ( <Badge key={lang._id} variant="secondary" className="px-2 py-0.5 text-xs font-medium">{t(`language.${lang.name}`, { ns: 'common', defaultValue: lang.name })}</Badge> );
                  })}
                </div>

                <div className="flex-grow" />
                
                <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-sm text-muted-foreground mt-4 pt-3 border-t">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 flex-shrink-0 text-amber-500" />
                    <span className="font-semibold text-foreground">{displayStats.averageRating > 0 ? displayStats.averageRating.toFixed(1).toString() : t('card_new_rating')}</span>
                    <span className="text-xs">({displayStats.reviewCount || 0})</span>
                  </div>
                  {program.modules?.length > 0 && (
                    <>
                      <div className="h-4 w-px bg-border" />
                       <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-default"><Library className="h-4 w-4" /><span className="font-medium text-foreground">{program.modules.length}</span></div>
                        </TooltipTrigger>
                        <TooltipContent><p>{t('card_modules_count', { count: program.modules.length, defaultValue: '{{count}} Modules' })}</p></TooltipContent>
                      </Tooltip>
                    </>
                  )}
                  {totalLessons > 0 && (
                     <>
                      <div className="h-4 w-px bg-border" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-default"><FileText className="h-4 w-4" /><span className="font-medium text-foreground">{totalLessons}</span></div>
                        </TooltipTrigger>
                        <TooltipContent><p>{t('card_lessons_count', { count: totalLessons, defaultValue: '{{count}} Lessons' })}</p></TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>

               {completionPercentage !== undefined && (
                    <div className="mt-3 space-y-1">
                        <Progress 
                            value={completionPercentage} 
                            variant={completionPercentage === 100 ? 'completed' : 'default'}
                            className="h-2 bg-slate-200 dark:bg-slate-700" 
                        />
                        <p className="text-xs text-muted-foreground">{t('card_completion', { ns: 'programs', defaultValue: '{{percentage}}% Complete', percentage: completionPercentage.toFixed(0) })}</p>
                    </div>
                )}
            </CardContent>
            <CardFooter className="p-3 border-t mt-auto">
                <Button asChild className="w-full">
                    <Link to={`/learn/program/${program._id}`}>
                        {completionPercentage > 0 ? t('continue_learning', { ns: 'programs', defaultValue: 'Continue Learning' }) : t('start_program', { ns: 'programs', defaultValue: 'Start Program' })}
                    </Link>
                </Button>
            </CardFooter>
        </Card>
      </TooltipProvider>
    );
  }


  if (view === 'coach') {
    const statusClasses = {
      published: 'bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-900/50 dark:text-emerald-300',
      draft: 'bg-slate-100 text-slate-800 border-transparent dark:bg-slate-800 dark:text-slate-300',
      archived: 'border-dashed border-muted-foreground/50 text-muted-foreground',
    };
    return (
      <TooltipProvider delayDuration={100}>
        <Card className="flex flex-col h-full bg-card overflow-hidden">
          <div className="flex flex-col h-full">
            <button type="button" onClick={handleEditClick} className="group block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-t-lg">
              <div className="relative w-full overflow-hidden border-b border-border">
                <div className="w-full aspect-[16/9] bg-muted dark:bg-slate-800">
                  {currentMedia ? (
                      currentMedia.type === 'video' ? (
                        <CustomVideoPlayer
                            previewMode
                            videoFile={{
                                url: currentMedia.url,
                                thumbnailUrl: currentMedia.thumbnail,
                                trimStart: currentMedia.trimStart,
                                trimEnd: currentMedia.trimEnd,
                            }}
                        />
                    ) : (
                        <img src={currentMedia.url} alt={program.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    )
                  ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/50">
                          <BookOpen className="w-16 h-16" />
                      </div>
                  )}
                </div>
                {allMedia.length > 1 && (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handlePrevMedia}
                            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label={t('common:previous')}
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleNextMedia}
                            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label={t('common:next')}
                        >
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </>
                )}
                <div className="absolute bottom-2 right-2 z-10 flex flex-col items-end gap-1.5">
                  {formattedContentDuration && (
                    <div className="flex items-center gap-1.5 rounded-sm bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      <Video className="h-3.5 w-3.5" />
                      <span>{formattedContentDuration}</span>
                    </div>
                  )}
                  {formattedCompletionTime && (
                    <div className="flex items-center gap-1.5 rounded-sm bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formattedCompletionTime}</span>
                    </div>
                  )}
                </div>
              </div>
            </button>

            {/* Main content area, structured like client view */}
            <div className="p-4 flex flex-col flex-grow">
              <div className="flex justify-between items-start gap-3">
                <h3 className="text-base font-semibold leading-snug text-foreground text-left" title={program.title}>
                  {program.title}
                </h3>
                <Badge className={cn('flex-shrink-0', statusClasses[program.status] || statusClasses.draft)}>{t(`status_${program.status}`)}</Badge>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                {program.skillLevel?.map(level => {
                  if (typeof level !== 'object' || !level.name) return null;
                  const levelName = level.translations?.[i18n.language] || level.name;
                  return <Badge key={level._id} variant="secondary" className="px-2 py-0.5 text-xs font-medium">{levelName}</Badge>;
                })}
                {program.language?.map(lang => {
                  if (typeof lang !== 'object' || !lang.name) return null;
                  return <Badge key={lang._id} variant="secondary" className="px-2 py-0.5 text-xs font-medium">{t(`language.${lang.name}`, { ns: 'common', defaultValue: lang.name })}</Badge>;
                })}
              </div>
              
              <div className="flex-grow" />

              <div className="flex items-end justify-between mt-3 pt-3 border-t">
                <div className="flex items-center flex-wrap gap-x-2.5 gap-y-2 text-sm text-muted-foreground">
                  <Tooltip><TooltipTrigger asChild><div className="flex items-center gap-1 cursor-default"><Star className="h-4 w-4 flex-shrink-0 text-amber-500" /><span className="font-semibold text-foreground">{displayStats.averageRating > 0 ? displayStats.averageRating.toFixed(1) : t('card_new_rating')}</span><span className="text-xs">({displayStats.reviewCount || 0})</span></div></TooltipTrigger><TooltipContent><p>{t('card_rating_tooltip', { count: displayStats.reviewCount })}</p></TooltipContent></Tooltip>
                  <div className="h-4 w-px bg-border" />
                  <Tooltip><TooltipTrigger asChild><div className="flex items-center gap-1.5 cursor-default"><Users className="h-4 w-4" /><span className="font-medium text-foreground">{program.enrollmentsCount || 0}</span></div></TooltipTrigger><TooltipContent><p>{t('card_enrollments')}</p></TooltipContent></Tooltip>
                  {program.modules?.length > 0 && <><div className="h-4 w-px bg-border" /><Tooltip><TooltipTrigger asChild><div className="flex items-center gap-1.5 cursor-default"><Library className="h-4 w-4" /><span className="font-medium text-foreground">{program.modules.length}</span></div></TooltipTrigger><TooltipContent><p>{t('card_modules_count', { count: program.modules.length })}</p></TooltipContent></Tooltip></>}
                  {totalLessons > 0 && <><div className="h-4 w-px bg-border" /><Tooltip><TooltipTrigger asChild><div className="flex items-center gap-1.5 cursor-default"><FileText className="h-4 w-4" /><span className="font-medium text-foreground">{totalLessons}</span></div></TooltipTrigger><TooltipContent><p>{t('card_lessons_count', { count: totalLessons })}</p></TooltipContent></Tooltip></>}
                </div>
               <div className="flex flex-col items-end shrink-0 ml-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-lg font-bold text-primary cursor-default flex items-center gap-1">
                        <HandCoins className="h-4 w-4" />
                        <span>{formatCurrency(program.revenue || 0, program.basePrice?.currency)}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('card_revenue')}</p>
                    </TooltipContent>
                  </Tooltip>
                  {program.basePrice?.amount != null && (
                    <div className="text-sm text-muted-foreground -mt-1">
                      {formatCurrency(program.basePrice?.amount, program.basePrice?.currency)}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
           <CardFooter className="border-t p-3 flex justify-between items-center mt-auto">
              <p className="text-xs text-muted-foreground">{t('card.last_updated', 'Updated')}: {formatDate(program.updatedAt)}</p>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">{t('common:actions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleEditClick}>
                    <Edit className="mr-2 h-4 w-4" />
                    <span>{t('common:edit')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/dashboard?tab=analytics&programId=${program._id}`)}>
                      <BarChart2 className="mr-2 h-4 w-4" />
                      <span>{t('card_actions.view_analytics', 'View Analytics')}</span>
                  </DropdownMenuItem>
                   <DropdownMenuItem onClick={() => navigate(`/programs/${program._id}/students`)}>
                      <Users className="mr-2 h-4 w-4" />
                      <span>{t('card_actions.student_roster', 'Student Roster')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/programs/${program._id}/submissions`)}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      <span>{t('assignment_submissions', 'Submissions')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/programs/${program._id}/qa`)}>
                      <MessageSquare className="mr-2 h-4 w-4" />
                      <span>{t('card_actions.manage_qa', 'Manage Q&A')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={handleDeleteClick}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>{t('common:delete')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardFooter>
          </div>
        </Card>
      </TooltipProvider>
    );
  }

if (view === 'list') {
    return (
      <TooltipProvider delayDuration={100}>
       <Link to={`/programs/${program._id}`} className="group block w-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg">
          <Card className="flex flex-col sm:flex-row h-full w-full overflow-hidden transition-shadow duration-300 shadow-sm hover:shadow-lg border dark:border-slate-800">
            <div className="sm:w-1/3 md:w-1/4 flex-shrink-0 relative">
              <div className="absolute inset-0 bg-muted">
                {currentMedia ? (
                    currentMedia.type === 'video' ? (
                        <CustomVideoPlayer
                            previewMode
                            videoFile={{
                                url: currentMedia.url,
                                thumbnailUrl: currentMedia.thumbnail,
                                trimStart: currentMedia.trimStart,
                                trimEnd: currentMedia.trimEnd,
                            }}
                        />
                    ) : (
                        <img src={currentMedia.url} alt={program.title} className="w-full h-full object-cover" />
                    )
                ) : (
                    <img src={'https://images.unsplash.com/photo-1543269865-cbf427effbad?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=870&q=80'} alt={program.title} className="w-full h-full object-cover" />
                )}
              </div>
               {allMedia.length > 1 && (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handlePrevMedia}
                            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label={t('common:previous')}
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleNextMedia}
                            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label={t('common:next')}
                        >
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </>
                )}
              <div className="absolute bottom-2 right-2 z-10 flex flex-col items-end gap-1.5">
                {formattedContentDuration && (
                  <div className="flex items-center gap-1.5 rounded-sm bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    <Video className="h-3.5 w-3.5" />
                    <span>{formattedContentDuration}</span>
                  </div>
                )}
                {formattedCompletionTime && (
                  <div className="flex items-center gap-1.5 rounded-sm bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formattedCompletionTime}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col flex-grow p-4 sm:p-6 justify-between">
              <div>
                <div className="flex justify-between items-start gap-4">
                 <div className="flex-grow">
                    <div className="flex items-start gap-2">
                      <h3 className="flex-grow text-lg font-semibold leading-snug text-foreground transition-colors group-hover:text-primary text-left truncate" title={program.title}>{program.title}</h3>
                      {isEnrolled && (
                          <Tooltip>
                              <TooltipTrigger>
                                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                              </TooltipTrigger>
                              <TooltipContent>
                                  <p>{t('card_enrolled_tooltip', { ns: 'programs', defaultValue: 'You are enrolled in this program' })}</p>
                              </TooltipContent>
                          </Tooltip>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Avatar className="h-6 w-6 flex-shrink-0">
                        <AvatarImage src={coachProfilePictureUrl} />
                        <AvatarFallback className="text-xs">{coachInitials}</AvatarFallback>
                      </Avatar>
                      <p className="text-sm text-muted-foreground">
                          {`${program.coach?.firstName} ${program.coach?.lastName}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-xl font-bold text-primary shrink-0 ml-2">
                    {formatCurrency(program.basePrice?.amount, program.basePrice?.currency)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {program.skillLevel?.map(level => {
                    if (typeof level !== 'object' || !level.name) return null;
                    const levelName = level.translations?.[i18n.language] || level.name;
                    return ( <Badge key={level._id} variant="secondary" className="px-2 py-0.5 text-xs font-medium">{levelName}</Badge> );
                  })}
                  {program.language?.map(lang => {
                    if (typeof lang !== 'object' || !lang.name) return null;
                    return ( <Badge key={lang._id} variant="secondary" className="px-2 py-0.5 text-xs font-medium">{t(`language.${lang.name}`, { ns: 'common', defaultValue: lang.name })}</Badge> );
                  })}
                </div>
              </div>
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-4 pt-4 border-t">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 flex-shrink-0 text-amber-500" />
                  <span className="font-semibold text-foreground">{displayStats.averageRating > 0 ? displayStats.averageRating.toFixed(1) : t('card_new_rating')}</span>
                  <span className="text-xs">({displayStats.reviewCount || 0})</span>
                </div>
                {program.modules?.length > 0 && (<div className="flex items-center gap-1.5"><Library className="h-4 w-4" /><span className="font-medium text-foreground">{program.modules.length}</span><span className="hidden sm:inline">{t('card_modules_short', 'Modules')}</span></div>)}
                {totalLessons > 0 && (<div className="flex items-center gap-1.5"><FileText className="h-4 w-4" /><span className="font-medium text-foreground">{totalLessons}</span><span className="hidden sm:inline">{t('card_lessons_short', 'Lessons')}</span></div>)}
              </div>
            </div>
          </Card>
        </Link>
      </TooltipProvider>
    );
  }

return (
    <TooltipProvider delayDuration={100}>
      <Link to={`/programs/${program._id}`} className="group block h-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg" aria-label={program.title}>
        <div className="flex flex-col h-full">
          <div className="relative w-full overflow-hidden rounded-lg shadow-sm transition-shadow group-hover:shadow-xl">
            <div className="w-full aspect-[16/9] bg-muted dark:bg-slate-800">
              {currentMedia ? (
                  currentMedia.type === 'video' ? (
                    <CustomVideoPlayer
                        previewMode
                        videoFile={{
                            url: currentMedia.url,
                            thumbnailUrl: currentMedia.thumbnail,
                            trimStart: currentMedia.trimStart,
                            trimEnd: currentMedia.trimEnd,
                        }}
                    />
                ) : (
                    <img src={currentMedia.url} alt={program.title} className="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105" />
                )
              ) : (
                  <img src={'https://images.unsplash.com/photo-1543269865-cbf427effbad?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=870&q=80'} alt="" className="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105" />
              )}
            </div>
            {allMedia.length > 1 && (
                <>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handlePrevMedia}
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label={t('common:previous')}
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleNextMedia}
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label={t('common:next')}
                    >
                        <ChevronRight className="h-5 w-5" />
                    </Button>
                </>
            )}
            <div className="absolute bottom-2 right-2 z-10 flex flex-col items-end gap-1.5">
              {formattedContentDuration && (
                <div className="flex items-center gap-1.5 rounded-sm bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  <Video className="h-3.5 w-3.5" />
                  <span>{formattedContentDuration}</span>
                </div>
              )}
              {formattedCompletionTime && (
                <div className="flex items-center gap-1.5 rounded-sm bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formattedCompletionTime}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-3">
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarImage src={coachProfilePictureUrl} />
              <AvatarFallback>{coachInitials}</AvatarFallback>
            </Avatar>
            <div className="flex-grow overflow-hidden">
              <div className="flex items-start gap-2">
                <h3 className="flex-grow text-base font-semibold leading-snug text-foreground truncate transition-colors group-hover:text-primary text-left" title={program.title}>
                  {program.title}
                </h3>
                {isEnrolled && (
                  <Tooltip>
                      <TooltipTrigger>
                          <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      </TooltipTrigger>
                      <TooltipContent>
                          <p>{t('card_enrolled_tooltip', { ns: 'programs', defaultValue: 'You are enrolled in this program' })}</p>
                      </TooltipContent>
                  </Tooltip>
                )}
              </div>
              
              <div className="flex flex-wrap gap-1.5 mt-2">
                {program.skillLevel?.map(level => {
                  if (typeof level !== 'object' || !level.name) return null;
                  const levelName = level.translations?.[i18n.language] || level.name;
                  return (
                    <Badge key={level._id} variant="secondary" className="px-2 py-0.5 text-xs font-medium">
                      {levelName}
                    </Badge>
                  );
                })}
                {program.language?.map(lang => {
                  if (typeof lang !== 'object' || !lang.name) return null;
                  return (
                    <Badge key={lang._id} variant="secondary" className="px-2 py-0.5 text-xs font-medium">
                      {t(`language.${lang.name}`, { ns: 'common', defaultValue: lang.name })}
                    </Badge>
                  );
                })}
              </div>
              
              <div className="flex items-end justify-between mt-1 border-t">
                <div className="flex items-center gap-x-2.5 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 flex-shrink-0 text-amber-500" />
                    <span className="font-semibold text-foreground">{displayStats.averageRating > 0 ? displayStats.averageRating.toFixed(1) : t('card_new_rating')}</span>
                    <span className="text-xs">({displayStats.reviewCount || 0})</span>
                  </div>

                  {program.modules?.length > 0 && (
                    <>
                      <div className="h-4 w-px bg-border" />
                       <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-default">
                            <Library className="h-4 w-4" />
                            <span className="font-medium text-foreground">{program.modules.length}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('card_modules_count', { count: program.modules.length, defaultValue: '{{count}} Modules' })}</p>
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )}

                  {totalLessons > 0 && (
                     <>
                      <div className="h-4 w-px bg-border" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-default">
                            <FileText className="h-4 w-4" />
                            <span className="font-medium text-foreground">{totalLessons}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('card_lessons_count', { count: totalLessons, defaultValue: '{{count}} Lessons' })}</p>
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
                
                <div className="text-lg font-bold text-primary shrink-0 ml-2 ">
                  {formatCurrency(program.basePrice?.amount, program.basePrice?.currency)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </TooltipProvider>
  );
};

export default ProgramCard;