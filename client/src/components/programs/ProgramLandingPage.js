import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation as useReactRouterLocation } from 'react-router-dom';
import { useProgramLandingPage, useUserEnrollments, useEnrollInProgram, useProgramReviews, programKeys } from '../../hooks/usePrograms';
import { calculateProgramPrice } from '../../services/priceAPI';
import { PaymentOrchestrator } from '../../services/PaymentOrchestratorService';
import { usePayment } from '../../contexts/PaymentContext';
import { useQueryClient } from 'react-query'; 
import { Loader2, ServerCrash, Star, CheckCircle, Play, BookOpen, ChevronDown, Video, FileText, Download, BarChart3, Clock, Tv, X, ChevronLeft, ChevronRight, PlayCircle, Library, Image as ImageIcon, Users, Presentation, Tag, Flag } from 'lucide-react';
import { Button } from '../ui/button.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs.tsx';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible.jsx';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificationSocket } from '../../contexts/SocketContext';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { logger } from '../../utils/logger';
import paymentAPI from '../../services/paymentAPI';
import PaymentPopup from '../payment/PaymentPopup';
import { Badge } from '../ui/badge.tsx';
import ReviewModal from '../ReviewModal';
import ReportModal from '../shared/ReportModal';

const ReviewsDisplay = ({ programId, programTitle }) => {
    const { t } = useTranslation(['programs', 'common']);
    const { data: reviews, status } = useProgramReviews(programId);
    const { user } = useAuth();
    const { data: enrollments } = useUserEnrollments();
    const queryClient = useQueryClient();
    const [isReviewModalOpen, setReviewModalOpen] = useState(false);

    const userEnrollment = useMemo(() => {
        return enrollments?.find(e => e.program._id === programId);
    }, [enrollments, programId]);

      const hasReviewed = useMemo(() => {
        if (!reviews || !user) return false;
        return reviews.some(review => review.raterId._id === user._id);
    }, [reviews, user]);

     const userReview = useMemo(() => {
        if (!reviews || !user) return null;
        return reviews.find(review => review.raterId._id === user._id);
    }, [reviews, user]);
    
    const canReview = userEnrollment && userEnrollment.status === 'completed';

    if (status === 'loading') return <Loader2 className="animate-spin" />;
    if (status === 'error') return <p>{t('reviews_fetch_error')}</p>;

    const onReviewSubmitSuccess = () => {
        // Invalidate queries for the specific program's details and its review list
        queryClient.invalidateQueries(['programReviews', programId]);
        queryClient.invalidateQueries(['program', programId]);
        // Invalidate all program list queries to update ProgramCard ratings on the main programs page
        queryClient.invalidateQueries(programKeys.all);
    };

    return (
        <div className="py-8">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold">{t('reviews_title')}</h3>
                {canReview && (
                    <Button variant="hero" onClick={() => setReviewModalOpen(true)}>
                        {hasReviewed ? t('edit_review_button', 'Edit Your Review') : t('leave_review_button')}
                    </Button>
                )}
            </div>
            {reviews && reviews.length > 0 ? (
                <div className="space-y-6">
                   {reviews.map(review => (
                        <div key={review._id} className="p-4 border rounded-lg">
                            <div className="flex items-center mb-2">
                                <Avatar className="h-10 w-10 mr-4">
                                    <AvatarImage src={review.raterId.profilePicture?.url} />
                                    <AvatarFallback>{review.raterId.firstName[0]}{review.raterId.lastName[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-semibold">{review.raterId.firstName} {review.raterId.lastName}</p>
                                    <div className="flex items-center text-sm text-muted-foreground">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} className={`h-4 w-4 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <p className="text-gray-600 dark:text-gray-300">{review.comment}</p>
                            {review.coachResponse && (
                                <div className="mt-4 ml-8 p-3 bg-muted/50 rounded-lg">
                                    <p className="text-sm font-semibold text-foreground">{t('coach_response', { ns: 'common' })}</p>
                                    <p className="text-sm text-muted-foreground">{review.coachResponse}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-muted-foreground">{t('no_reviews_yet')}</p>
            )}
            {isReviewModalOpen && (
                <ReviewModal
                    reviewType="program"
                    entityId={programId}
                    entityTitle={programTitle}
                    onClose={() => setReviewModalOpen(false)}
                    onSubmitSuccess={onReviewSubmitSuccess}
                    existingReview={userReview}
                />
            )}
        </div>
    );
};

const formatDuration = (totalMinutes) => {
  if (!totalMinutes || totalMinutes <= 0) return null;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let result = '';
  if (hours > 0) {
    result += `${hours}h`;
  }
  if (minutes > 0) {
    result += ` ${minutes}m`;
  }
  return result.trim() || '0m';
};


const ProgramLandingPage = () => {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket, isConnected } = useNotificationSocket();
  const { pathname } = useReactRouterLocation();
  const { t } = useTranslation(['programs', 'common']);
  const queryClient = useQueryClient();
  const { stripePromise } = usePayment();

  const { data: program, isLoading, isError, error } = useProgramLandingPage(programId);
  const { data: reviews, isLoading: isLoadingReviews } = useProgramReviews(programId);
  const { data: enrollments } = useUserEnrollments(user?._id);
  const { mutate: enroll, isLoading: isEnrolling } = useEnrollInProgram();
  const [isProcessingEnrollment, setIsProcessingEnrollment] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState({
    amount: null,
    currency: null,
    clientSecret: null,
  });
  const [activeFlowId, setActiveFlowId] = useState(null);

  const [priceDetails, setPriceDetails] = useState(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [validationError, setValidationError] = useState('');
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);

  useEffect(() => {
    if (socket && isConnected && user?._id) {
      const handleEnrollmentUpdate = (data) => {
        if (data.programId === programId) {
          queryClient.invalidateQueries({ queryKey: programKeys.enrollments(user._id) });
        }
      };
      
      socket.on('enrollment_activated', handleEnrollmentUpdate);

      return () => {
        socket.off('enrollment_activated', handleEnrollmentUpdate);
      };
    }
  }, [socket, isConnected, user, programId, queryClient]);

const performOptimisticEnrollmentUpdate = useCallback(() => {
    if (!user || !program) return;
    queryClient.setQueryData(programKeys.enrollments(user._id), (oldData) => {
      const existingEnrollments = oldData || [];
      const existingIndex = existingEnrollments.findIndex(e => e.program._id === programId);
      
      if (existingIndex > -1) {
        const updatedEnrollments = [...existingEnrollments];
        updatedEnrollments[existingIndex].status = 'active';
        return updatedEnrollments;
      } else {
        const newEnrollment = {
          _id: `temp-${Date.now()}`,
          program: {
            _id: programId,
            title: program.title,
          },
          status: 'active',
          progress: { totalLessons: program.totalLessons || 0, completedLessons: [] }
        };
        return [...existingEnrollments, newEnrollment];
      }
    });
  }, [queryClient, user, programId, program]);

  const hasRealEnrollment = useMemo(() =>
    enrollments?.some(e => e.program._id === programId && (e.status === 'active' || e.status === 'completed')),
    [enrollments, programId]
  );

  const isCoachOfProgram = useMemo(() => user?._id === program?.coach?._id, [user, program]);

  const canAccessProgram = hasRealEnrollment || isCoachOfProgram;

useEffect(() => {
    if (program && !canAccessProgram && user) {
      setIsLoadingPrice(true);
      calculateProgramPrice(program._id, null, user)
        .then(data => {
            setPriceDetails(data);
            if(data?._calculationDetails?.appliedDiscount){
                setAppliedDiscount(data._calculationDetails.appliedDiscount);
            } else {
                setAppliedDiscount(null);
            }
        })
        .catch(err => {
            logger.error('Failed to calculate initial program price', err);
            toast.error(t('priceCalculationError', {ns: 'bookings'}));
        })
        .finally(() => setIsLoadingPrice(false));
    } else if(canAccessProgram) {
        setIsLoadingPrice(false);
    }
  }, [program, canAccessProgram, user, t]);

  const learnPath = isCoachOfProgram && !hasRealEnrollment
    ? `/learn/program/${programId}?preview=true`
    : `/learn/program/${programId}`;

  const displayStats = useMemo(() => {
    // Prioritize the fresh reviews data for calculations if available
    if (reviews && reviews.length > 0) {
      const totalRating = reviews.reduce((acc, review) => acc + review.rating, 0);
      return {
        averageRating: totalRating / reviews.length,
        reviewCount: reviews.length,
      };
    }
    // Fallback to the stats from the main program object to prevent flicker
    return { averageRating: program?.averageRating || 0, reviewCount: program?.reviewCount || 0 };
  }, [reviews, program]);

  const [activeMediaIndex, setActiveMediaIndex] = useState(null);

  const galleryImages = useMemo(() => program?.programImages || [], [program]);

  const allMedia = useMemo(() => {
    const media = [];
    if (program?.trailerVideo?.url) {
        media.push({ type: 'video', url: program.trailerVideo.url, _id: 'trailer' });
    }
    if (program?.programImages) {
        media.push(...program.programImages.map(img => ({ type: 'image', url: img.url, _id: img._id })));
    }
    return media;
  }, [program]);

  const openGallery = (index) => {
    if (allMedia.length > 0) {
      setActiveMediaIndex(index);
    }
  };

  const closeGallery = () => {
    setActiveMediaIndex(null);
  };

  const nextMedia = (e) => {
    e.stopPropagation();
    if (allMedia.length > 1) {
      setActiveMediaIndex(prev => (prev + 1) % allMedia.length);
    }
  };

  const prevMedia = (e) => {
    e.stopPropagation();
    if (allMedia.length > 1) {
      setActiveMediaIndex(prev => (prev - 1 + allMedia.length) % allMedia.length);
    }
  };

const handleApplyDiscount = async () => {
    if (!discountCode || !program) return;
    setIsApplyingDiscount(true);
    setValidationError('');
    try {
      const result = await calculateProgramPrice(program._id, discountCode, user);
      setPriceDetails(result);
      setAppliedDiscount(result._calculationDetails.appliedDiscount || null);
      toast.success(t('discountAppliedSuccessfully', { ns: 'bookings' }));
      setDiscountCode('');
    } catch (error) {
      logger.error('ProgramLandingPage: Discount application failed.', { error: error.response?.data || error.message });
      const errorData = error.response?.data;
      let i18nKey = 'bookings:errors.invalidOrExpiredCode';
      let i18nParams = {};
      if (errorData?.code) {
        switch (errorData.code) {
          case 'DISCOUNT_NOT_ACTIVE_YET': i18nKey = 'bookings:errors.discountNotActiveYet'; break;
          case 'DISCOUNT_EXPIRED': i18nKey = 'bookings:errors.discountExpired'; break;
          case 'USAGE_LIMIT_REACHED': i18nKey = 'bookings:errors.discountUsageLimitReached'; break;
          case 'MINIMUM_PURCHASE_NOT_MET':
            i18nKey = 'bookings:errors.discountMinPurchaseRequired';
            i18nParams = { amount: errorData.details.amount, currency: errorData.details.currency };
            break;
          case 'LOGIN_REQUIRED': i18nKey = 'bookings:errors.discountLoginRequired'; break;
          case 'ALREADY_USED': i18nKey = 'bookings:errors.discountAlreadyUsed'; break;
          case 'NOT_ELIGIBLE': i18nKey = 'bookings:errors.discountNotEligible'; break;
          case 'NOT_APPLICABLE_TO_ITEM': i18nKey = 'bookings:errors.discountNotApplicableToItem'; break;
          case 'INVALID_OR_EXPIRED_CODE': i18nKey = 'bookings:errors.invalidOrExpiredCode'; break;
          case 'AUTOMATIC_DISCOUNT': i18nKey = 'bookings:errors.automaticDiscount'; break;
          default: break;
        }
      }
  const message = t(i18nKey, i18nParams);
      setValidationError(message);
      setAppliedDiscount(null);
      calculateProgramPrice(program._id, null, user).then(setPriceDetails);
    } finally {
      setIsApplyingDiscount(false);
    }
  };

const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
    setValidationError('');
    setIsLoadingPrice(true);
    calculateProgramPrice(program._id, null, user)
      .then(setPriceDetails)
      .finally(() => setIsLoadingPrice(false));
  };

const handleEnroll = async () => {
    setIsProcessingEnrollment(true);
    logger.info('[ProgramLandingPage.handleEnroll] 1. Enrollment process started.');
    if (!user) {
      logger.warn('[ProgramLandingPage.handleEnroll] 2. User not logged in. Redirecting to login.');
      navigate('/login', { state: { from: pathname } });
      return;
    }
    
    if (!priceDetails) {
        logger.error('[ProgramLandingPage.handleEnroll] 2. CRITICAL: priceDetails is null. Aborting enrollment.');
        toast.error(t('priceStillLoading', { ns: 'common', defaultValue: 'Price is still loading, please wait.'}));
        setIsProcessingEnrollment(false);
        return;
    }
    logger.info('[ProgramLandingPage.handleEnroll] 2. Price details are available.', { priceDetails });

    const transientId = crypto.randomUUID();
    
    const amountInCents = Math.round(priceDetails.final.amount.amount * 100);
    logger.info(`[ProgramLandingPage.handleEnroll] Converting amount for payment flow. Decimal: ${priceDetails.final.amount.amount}, Cents: ${amountInCents}`);

    setPaymentDetails({ 
      amount: amountInCents,
      currency: priceDetails.currency,
      clientSecret: null
    });

    setActiveFlowId(transientId);
  
   await PaymentOrchestrator.initializePayment({
      flowId: transientId,
      amount: amountInCents,
      currency: priceDetails.currency,
      metadata: {
        programId: programId,
        isPopup: true,
        flowState: 'pre_enrollment'
      }
    });

    const enrollPayload = {
        discountCode: appliedDiscount ? appliedDiscount.code : undefined
    };

    logger.info('[ProgramLandingPage.handleEnroll] 3. Calling the enroll mutation (API call to backend)...', { programId, payload: enrollPayload });
  
enroll({ programId, payload: enrollPayload }, {
      onSuccess: async (data) => {
        logger.info('[ProgramLandingPage.handleEnroll] 4a. (SUCCESS) enroll mutation returned:', { data });
        if (data.success && (data.message?.includes('free program') || priceDetails.final.amount.amount === 0)) {
          toast.success(t('enrollmentSuccess', { ns: 'common', defaultValue: 'Enrollment successful!' }));
          queryClient.invalidateQueries({ queryKey: programKeys.enrollments(user._id) });
          performOptimisticEnrollmentUpdate();
          await PaymentOrchestrator.handleCleanup(transientId, { source: 'flow_complete' });
          setIsProcessingEnrollment(false);
          return;
        }
  
        const paymentIntentId = data.paymentIntent?.id || data.paymentIntent?._id;

        if (data.success && data.clientSecret && paymentIntentId && data.paymentId) {
          logger.info('[ProgramLandingPage.handleEnroll] 4a. (SUCCESS and VALID) Data is well-formed. Updating Payment Orchestrator.', { paymentIntentId });
          await PaymentOrchestrator.updateFlow(transientId, {
            bookingId: data.paymentId, 
            clientSecret: data.clientSecret,
            paymentIntentId: paymentIntentId, 
            status: 'payment_pending',
            metadata: {
              updateType: 'booking_created',
              confirmationId: transientId,
              modalState: 'payment_active',
              paymentStep: 'method',
              actualBookingId: paymentIntentId,
            }
          });
          setPaymentDetails(prev => ({ ...prev, clientSecret: data.clientSecret }));
          setActiveFlowId(data.paymentId);
        } else {
          logger.error('[ProgramLandingPage.handleEnroll] 4a. (SUCCESS but FAILED) Backend returned success=true but data is malformed.', { data });
          toast.error(data.message || t('enrollmentInitiationError', { ns: 'common' }));
          await PaymentOrchestrator.handleCleanup(transientId, { source: 'flow_error' });
          setActiveFlowId(null);
        }
        setIsProcessingEnrollment(false);
      },
      onError: async (err) => {
        logger.error('[ProgramLandingPage.handleEnroll] 4b. (ERROR) enroll mutation failed.', { error: err.response?.data || err.message });
        toast.error(err.response?.data?.message || t('enrollmentError', { ns: 'common' }));
        await PaymentOrchestrator.handleCleanup(transientId, { source: 'flow_error' });
        setActiveFlowId(null);
        setIsProcessingEnrollment(false);
      }
    });
  };

const handlePaymentSuccess = useCallback(() => {
    toast.success(t('paymentSuccessEnrollmentConfirmed', { ns: 'programs' }));
    performOptimisticEnrollmentUpdate();
    setActiveFlowId(null);
    setPaymentDetails(null);
  }, [performOptimisticEnrollmentUpdate, t]);

  const handlePaymentClose = useCallback(() => {
    if (activeFlowId) {
      PaymentOrchestrator.handleCleanup(activeFlowId, { source: 'user_close' });
    }
    setActiveFlowId(null);
    setPaymentDetails(null);
  }, [activeFlowId]);

    const handleReportSuccess = () => {
    toast.success(t('reportSubmittedSuccess', { ns: 'common' }));
    setIsReportModalOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-20 container mx-auto">
        <ServerCrash className="h-16 w-16 mx-auto text-destructive" />
        <h2 className="mt-4 text-xl font-semibold">{t('programLoadErrorTitle', { ns: 'common' })}</h2>
        <p className="text-muted-foreground">{error.response?.data?.message || error.message}</p>
      </div>
    );
  }

   const { coach, title, subtitle, description, programImages, trailerVideo, learningOutcomes, modules, basePrice: price, totalLessons, enrollmentsCount, skillLevel, language, contentDuration, estimatedCompletionTime } = program;
  const mainImage = programImages?.find(img => img.isMain) || programImages?.[0];
  const displayImage = mainImage?.url || trailerVideo?.posterUrl;
  const coachProfilePictureUrl = coach?.coachProfilePicture?.url || coach?.profilePicture?.url;

  const isDescriptionJson = (desc) => {
    if (typeof desc !== 'string') return false;
    const trimmed = desc.trim();
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
  };

  const renderLessonIcon = (contentType) => {
    const props = { className: "program-landing-page__curriculum-lesson-icon" };
    switch (contentType) {
      case 'video': return <Video {...props} />;
      case 'text': return <FileText {...props} />;
      case 'document': return <Download {...props} />;
      case 'presentation': return <Presentation {...props} />;
      default: return <BookOpen {...props} />;
    }
  };

  const getCurriculumMeta = () => {
    const parts = [
      t('curriculumMeta', { moduleCount: modules?.length || 0, lessonCount: totalLessons || 0 })
    ];
    const durationStr = formatDuration(contentDuration?.minutes);
    if (durationStr) {
      parts.push(t('totalLengthValue', { duration: durationStr, defaultValue: `${durationStr} total` }));
    }
    return parts.join(' • ');
  };

logger.info('ProgramLandingPage: PRE-RENDER CHECK', {
    isEnrolling,
    canAccessProgram,
    priceDetails,
    appliedDiscount,
    validationError,
  });
  
  return (
    <div className="bg-background">
 <header className="bg-slate-900 text-white">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-8 lg:gap-x-12 xl:gap-x-16 items-center py-12 md:py-16 lg:py-20">
            <div className="lg:col-span-7 order-1 lg:order-2">
              <div className="relative group" onClick={() => openGallery(0)}>
                <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl cursor-pointer">
                  {displayImage ? (
                      <img src={displayImage} alt={title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"/>
                  ) : (
                      <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                          <Play className="w-16 h-16 text-slate-600" />
                      </div>
                  )}
                </div>
                <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10">
                  {trailerVideo?.url && (
                      <div 
                        className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full cursor-pointer hover:bg-black/80 transition-colors"
                        onClick={(e) => { e.stopPropagation(); openGallery(0); }}
                        title={t('playTrailer')}
                      >
                        <PlayCircle className="h-4 w-4" />
                        <span>{t('trailer', 'Trailer')}</span>
                      </div>
                  )}
                  {galleryImages.length > 0 && (
                      <div 
                        className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full cursor-pointer hover:bg-black/80 transition-colors"
                        onClick={(e) => { e.stopPropagation(); openGallery(trailerVideo?.url ? 1 : 0); }}
                        title={t('viewPhotos', { count: galleryImages.length })}
                      >
                        <ImageIcon className="h-4 w-4" />
                        <span>{galleryImages.length}</span>
                      </div>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 order-2 lg:order-1">
              <div className="flex flex-wrap gap-2 mb-3">
                {skillLevel?.map(level => (
                    <Badge key={level._id} variant="secondaryOnDark" className="bg-slate-700/50 border-slate-600/50 text-slate-300 font-medium">
                        {t(`skillLevel.${level.name}`, { ns: 'programs', defaultValue: level.name })}
                    </Badge>
                ))}
                {language?.map(lang => (
                    <Badge key={lang._id} variant="secondaryOnDark" className="bg-slate-700/50 border-slate-600/50 text-slate-300 font-medium">
                        {t(`language.${lang.name}`, { ns: 'common', defaultValue: lang.name })}
                    </Badge>
                ))}
              </div>

              <h1 className="text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tighter">{title}</h1>
              <p className="mt-4 text-lg text-slate-300">{subtitle}</p>
              
              <Link to={`/coach/${coach._id}`} className="mt-6 inline-flex items-center gap-3 group">
                <Avatar>
                  <AvatarImage src={coachProfilePictureUrl} />
                  <AvatarFallback>{coach.firstName?.[0]}{coach.lastName?.[0]}</AvatarFallback>
                </Avatar>
                <span className="font-medium text-slate-200 group-hover:text-white transition-colors">{t('taughtBy', { coachFirstName: coach.firstName, coachLastName: coach.lastName })}</span>
              </Link>
              
              <div className="mt-8 pt-6 border-t border-slate-700/50 flex flex-wrap items-center gap-x-6 gap-y-4">
                <div className="flex items-center gap-3">
                  <Star className="w-5 h-5 text-yellow-400" />
                  <div>
                    <p className="font-bold text-base text-white">{displayStats.averageRating > 0 ? displayStats.averageRating.toFixed(1) : t('newRating')}</p>
                    <p className="text-xs text-slate-400">({t('reviewsCount', { count: displayStats.reviewCount || 0 })})</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Library className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="font-bold text-base text-white">{modules?.length || 0}</p>
                    <p className="text-xs text-slate-400">{t('module', { count: modules?.length || 0, ns: 'common' })}</p>
                  </div>
                </div>

                {contentDuration?.minutes > 0 && (
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="font-bold text-base text-white">{formatDuration(contentDuration.minutes)}</p>
                      <p className="text-xs text-slate-400">{t('contentLength', 'Inhaltsdauer')}</p>
                    </div>
                  </div>
                )}

                {estimatedCompletionTime?.minutes > 0 && (
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="font-bold text-base text-white">{formatDuration(estimatedCompletionTime.minutes)}</p>
                      <p className="text-xs text-slate-400">{t('timeToComplete', 'Zeit zum Abschluss')}</p>
                    </div>
                  </div>
                )}
              </div>
              
             <div className="mt-8 lg:hidden">
                {canAccessProgram ? (
                  <Button variant="hero" asChild size="lg" className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90">
                    <Link to={learnPath}><PlayCircle className="mr-2 h-5 w-5" /> {t('goToLearning')}</Link>
                  </Button>
                ) : (
                  <Button variant="hero" onClick={handleEnroll} disabled={isProcessingEnrollment || !price} size="lg" className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90">
                    {isProcessingEnrollment ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <BookOpen className="mr-2 h-5 w-5" />}
                    {t('enrollNow', { ns: 'common' })}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-16">
          <div className="lg:col-span-8">
            <Card className="p-6 md:p-8 mb-12">
              <h2 className="text-2xl md:text-3xl font-bold mb-6">{t('field_outcomes_label')}</h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {learningOutcomes?.map((outcome, index) => (
                  <li key={index} className="flex items-start">
                    <CheckCircle className="size-5 text-green-500 mr-3 mt-1 flex-shrink-0" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Tabs defaultValue="description" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="description">{t('field_description_label')}</TabsTrigger>
                <TabsTrigger value="curriculum">{t('step_curriculum')}</TabsTrigger>
                <TabsTrigger value="reviews">{t('reviewsLabel', { ns: 'common' })}</TabsTrigger>
              </TabsList>
              
              <TabsContent value="description" className="mt-6 prose prose-lg max-w-none dark:prose-invert">
                {!isDescriptionJson(description) && <div dangerouslySetInnerHTML={{ __html: description }} />}
              </TabsContent>

              <TabsContent value="curriculum" className="mt-6">
                <div className="flex flex-wrap justify-between items-baseline gap-2 mb-4">
                  <h3 className="text-2xl font-bold">{t('step_curriculum')}</h3>
                  <span className="text-sm text-muted-foreground">{getCurriculumMeta()}</span>
                </div>
                <div className="space-y-3">
                  {modules?.map((module, index) => (
                    <Collapsible key={module._id} defaultOpen={index === 0} className="border rounded-lg overflow-hidden">
                      <CollapsibleTrigger className="flex justify-between items-center w-full p-4 font-semibold text-lg bg-muted/50 hover:bg-muted transition-colors">
                        <span className="text-left">{index + 1}. {module.title}</span>
                        <ChevronDown className="h-5 w-5 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <ul className="border-t divide-y">
                          {module.lessons.map(lesson => (
                            <li key={lesson._id} className="flex items-center p-4">
                              <div className="text-muted-foreground mr-4">
                                {renderLessonIcon(lesson.contentType)}
                              </div>
                              <span className="flex-grow">{lesson.title}</span>
                              {lesson.content?.duration && (
                                <span className="ml-4 text-sm text-muted-foreground">{t('lessonDuration', { duration: Math.round(lesson.content.duration / 60) })}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </TabsContent>
             <TabsContent value="reviews" className="mt-6">
                <ReviewsDisplay programId={programId} programTitle={title} />
              </TabsContent>
            </Tabs>
          </div>

           <aside className="lg:col-span-4">
            <div className="sticky top-24">
                <Card className="overflow-hidden">
                             <div className="p-6 flex flex-col gap-4">
                        {isLoadingPrice ? <div className="flex justify-center items-center h-24"><Loader2 className="animate-spin text-primary" /></div> : (
                        canAccessProgram ? (
                            <Button variant="secondary" asChild size="lg" className="w-full text-base py-6">
                                <Link to={learnPath}><PlayCircle className="mr-2 size-5" /> {t('goToLearning')}</Link>
                            </Button>
                        ) : (
                            priceDetails && <>
                                {!appliedDiscount ? (
                                    <div className="text-5xl font-extrabold text-center tracking-tight">
                                    {new Intl.NumberFormat(undefined, { style: 'currency', currency: priceDetails.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(priceDetails.final.amount.amount)}
                                </div>
                                ) : (
                                    <div className="space-y-2.5 text-sm border bg-muted/50 p-4 rounded-lg">
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">{t('originalPrice', { ns: 'common', defaultValue: 'Original Price' })}</span>
                                            <span className="font-medium line-through">{new Intl.NumberFormat(undefined, { style: 'currency', currency: priceDetails.currency }).format(priceDetails.base.amount.amount)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">{t('discount', { ns: 'common', defaultValue: 'Discount' })} ({appliedDiscount.code})</span>
                                            <span className="font-medium text-green-600 dark:text-green-500">- {new Intl.NumberFormat(undefined, { style: 'currency', currency: priceDetails.currency }).format(appliedDiscount.amountDeducted)}</span>
                                        </div>
                                        
                                        <div className="flex justify-between items-center pt-2.5 border-t mt-2.5">
                                        <span className="text-muted-foreground">{t('subtotal', { ns: 'common', defaultValue: 'Subtotal' })}</span>
                                        <span className="font-medium">{new Intl.NumberFormat(undefined, { style: 'currency', currency: priceDetails.currency }).format(priceDetails.final.amount.amount - priceDetails.vat.amount)}</span>
                                    </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">{t('vat', { ns: 'common', defaultValue: 'VAT' })} ({priceDetails.vat.rate.toFixed(1)}%)</span>
                                            <span className="font-medium">{new Intl.NumberFormat(undefined, { style: 'currency', currency: priceDetails.currency }).format(priceDetails.vat.amount)}</span>
                                        </div>
                                        
                                       <div className="!mt-4 flex justify-between items-baseline font-bold text-xl border-t pt-3">
                                        <span>{t('total', { ns: 'common', defaultValue: 'Total' })}</span>
                                        <span>{new Intl.NumberFormat(undefined, { style: 'currency', currency: priceDetails.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(priceDetails.final.amount.amount)}</span>
                                    </div>
                                    </div>
                                )}
                                
                                <div className="space-y-2 pt-2">
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder={t('discountCodePlaceholder', { ns: 'bookings', defaultValue: 'Discount Code' })}
                                            value={discountCode}
                                            onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                                            disabled={isApplyingDiscount || !!appliedDiscount}
                                            className="uppercase font-mono"
                                        />
                                        <Button
                                            variant="outline"
                                            onClick={handleApplyDiscount}
                                            disabled={!discountCode || isApplyingDiscount || !!appliedDiscount}
                                            className="flex-shrink-0"
                                        >
                                            {isApplyingDiscount ? <Loader2 className="h-4 w-4 animate-spin" /> : t('apply', { ns: 'common' })}
                                        </Button>
                                    </div>
                                    {validationError && <p className="text-xs text-destructive px-1">{validationError}</p>}
                                    {appliedDiscount && (
                                         <Button variant="link" size="sm" className="p-0 h-auto text-destructive" onClick={handleRemoveDiscount}>
                                            {t('removeDiscount', { ns: 'common', defaultValue: 'Remove discount' })}
                                        </Button>
                                    )}
                                </div>

                                <Button variant="default" onClick={handleEnroll} disabled={isProcessingEnrollment || !priceDetails} size="lg" className="w-full text-base py-6 mt-2">
                                    {isProcessingEnrollment ? <Loader2 className="mr-2 size-6 animate-spin" /> : t('enrollNow', { ns: 'common' })}
                                </Button>
                            </>
                        ))}
                    </div>
                    <div className="p-6 border-t">
                        <h3 className="text-lg font-semibold mb-4">{t('programIncludes')}</h3>
                        <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
                            {contentDuration?.minutes > 0 && (
                                <li className="flex items-center">
                                    <Clock className="size-5 mr-3 text-primary" />
                                    <span>{t('onDemandContent', { duration: formatDuration(contentDuration.minutes), defaultValue: `${formatDuration(contentDuration.minutes)} on-demand content` })}</span>
                                </li>
                            )}
                            {estimatedCompletionTime?.minutes > 0 && (
                                <li className="flex items-center">
                                    <BarChart3 className="size-5 mr-3 text-primary" />
                                    <span>{t('estimatedEffort', { duration: formatDuration(estimatedCompletionTime.minutes), defaultValue: `${formatDuration(estimatedCompletionTime.minutes)} estimated effort` })}</span>
                                </li>
                            )}
                            <li className="flex items-center"><BookOpen className="size-5 mr-3 text-primary" /> <span>{t('individualLessons', { count: totalLessons || 0 })}</span></li>
                            <li className="flex items-center"><Download className="size-5 mr-3 text-primary" /> <span>{t('downloadableResources')}</span></li>
                            <li className="flex items-center"><Tv className="size-5 mr-3 text-primary" /> <span>{t('mobileDesktopAccess')}</span></li>
                            <li className="flex items-center"><CheckCircle className="size-5 mr-3 text-primary" /> <span>{t('lifetimeAccess')}</span></li>
                        </ul>
                    </div>
                {!isCoachOfProgram && (
                      <div className="p-4 border-t text-center">
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setIsReportModalOpen(true)}>
                          <Flag className="mr-2 h-3 w-3" />
                          {t('report_program_button', 'Report this program')}
                        </Button>
                      </div>
                    )}
                </Card>
            </div>
          </aside>
        </div>
      </main>

       {!canAccessProgram && (
        <div className="sticky bottom-0 z-40 w-full bg-background/80 backdrop-blur-sm border-t p-3 flex justify-between items-center lg:hidden">
          <div>
            {priceDetails?.final?.amount != null && (
              <div className="flex items-baseline gap-2">
                {appliedDiscount && priceDetails.base.amount > priceDetails.final.amount && (
                    <span className="text-md text-muted-foreground line-through">
                        {new Intl.NumberFormat(undefined, { style: 'currency', currency: priceDetails.currency }).format(priceDetails.base.amount)}
                    </span>
                )}
              <span className="font-bold text-xl">
                {new Intl.NumberFormat(undefined, { style: 'currency', currency: priceDetails.currency }).format(priceDetails.final.amount.amount)}
            </span>
              </div>
            )}
          </div>
          <Button variant="hero" onClick={handleEnroll} disabled={isProcessingEnrollment || !priceDetails} size="lg">
            {isProcessingEnrollment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('enrollNow', { ns: 'common' })}
          </Button>
        </div>
      )}
       {activeMediaIndex !== null && allMedia.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={closeGallery}>
          <div className="relative w-full h-full max-w-6xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col justify-center items-center h-full">
              {(() => {
                const currentMedia = allMedia[activeMediaIndex];
                if (!currentMedia) return null;

                if (currentMedia.type === 'video') {
                  return (
                    <video
                      src={currentMedia.url}
                      controls
                      autoPlay
                      className="block max-w-full max-h-full object-contain rounded-lg"
                      key={currentMedia.url}
                    />
                  );
                }
                return (
                  <img
                    src={currentMedia.url}
                    alt={`${t('image_preview')} ${activeMediaIndex + 1}`}
                    className="block max-w-full max-h-full object-contain rounded-lg"
                  />
                );
              })()}
              <div className="absolute -bottom-12 flex items-center justify-center gap-4 text-white">
                {allMedia.length > 1 && (
                  <>
                    <Button variant="ghost" size="icon" className="rounded-full bg-white/10 hover:bg-white/20 text-white" onClick={prevMedia} aria-label={t('common:previous')}>
                      <ChevronLeft size={24} />
                    </Button>
                    <span className="font-mono text-sm">
                      {activeMediaIndex + 1} / {allMedia.length}
                    </span>
                    <Button variant="ghost" size="icon" className="rounded-full bg-white/10 hover:bg-white/20 text-white" onClick={nextMedia} aria-label={t('common:next')}>
                      <ChevronRight size={24} />
                    </Button>
                  </>
                )}
              </div>
              <Button variant="ghost" size="icon" className="absolute top-2 right-2 md:-top-4 md:-right-12 rounded-full bg-white/10 hover:bg-white/20 text-white" onClick={closeGallery} aria-label={t('common:close')}>
                  <X size={24} />
              </Button>
            </div>
          </div>
        </div>
      )}
     {activeFlowId && paymentDetails.amount && paymentDetails.clientSecret && (
        <PaymentPopup
          key={activeFlowId}
          bookingId={activeFlowId}
          isOpen={!!activeFlowId}
          onClose={handlePaymentClose}
          onComplete={handlePaymentSuccess}
          amount={paymentDetails.amount}
          currency={paymentDetails.currency}
          clientSecret={paymentDetails.clientSecret}
          sessionStartTime={new Date()}
        />
      )}
   {isReportModalOpen && (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          entityId={programId}
          entityType="program"
          onReportSuccess={handleReportSuccess}
        />
      )}
    </div>
  );
};

export default ProgramLandingPage;