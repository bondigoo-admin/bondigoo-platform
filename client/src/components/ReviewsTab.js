import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Loader2, Flag } from 'lucide-react';
import { respondToReview, getCoachReviews, reportReview } from '../services/ReviewAPI';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';
import { Button } from './ui/button.tsx';
import { Textarea } from './ui/textarea.tsx';
import { Progress } from './ui/progress.jsx';
import { Card, CardContent, CardFooter, CardHeader } from './ui/card.tsx';
import { Avatar, AvatarFallback } from './ui/avatar.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog.tsx';
import { RadioGroup, RadioGroupItem } from './ui/radio-group.jsx';
import { Label } from './ui/label.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';

const ReviewsTab = ({ userId, reviews: initialReviews, averageRating: initialAverageRating, isOwnProfile, onReviewsUpdate }) => {
  const { t } = useTranslation(['common', 'coachprofile']);
  const [reviewData, setReviewData] = useState({
    reviews: initialReviews || [],
    averageRating: initialAverageRating || 0,
    ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportingReview, setReportingReview] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');

  const computedIsOwnProfile = user && user.role === 'coach' && user.id === userId;
  if (isOwnProfile !== computedIsOwnProfile) {
    logger.warn('[ReviewsTab] isOwnProfile prop mismatch', { prop: isOwnProfile, computed: computedIsOwnProfile, userId });
  }

useEffect(() => {
    if (userId) {
      fetchReviews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

 const fetchReviews = async () => {
    try {
      setIsLoading(true);
      setError(null);
      logger.info(`[ReviewsTab] Now fetching reviews directly for userId: ${userId}`);
      const data = await getCoachReviews(userId);
      logger.info(`[ReviewsTab] Fetched review data from API:`, data);
      
      if (!data.success) throw new Error('API response unsuccessful');
      
      const newBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      data.reviews.forEach((review) => {
        if (review.rating >= 1 && review.rating <= 5) {
          newBreakdown[review.rating] += 1;
        }
      });
      
      const newReviewData = {
        reviews: data.reviews || [],
        averageRating: data.averageRating || 0,
        ratingBreakdown: newBreakdown,
      };

      setReviewData(newReviewData);
      
      if (onReviewsUpdate) {
        logger.info('[ReviewsTab] Propagating fresh review data to parent component.');
        onReviewsUpdate(newReviewData.reviews, newReviewData.averageRating);
      }
    } catch (err) {
      logger.error('[ReviewsTab] Fetch reviews failed', { userId, error: err.message });
      setError(t('coachprofile:errorFetchReviews'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitResponse = async (reviewId, responseText) => {
    if (!reviewId) {
      logger.error('[ReviewsTab] reviewId is undefined');
      toast.error('Review ID is missing');
      return;
    }
    logger.info('[ReviewsTab] Submitting coach response', { userId, reviewId });
    try {
      const responseData = { coachResponse: responseText };
      await respondToReview(reviewId, responseData);
      logger.info('[ReviewsTab] Response submitted', { userId, reviewId });
      toast.success(t('coachprofile:responseSubmitted'));
      await fetchReviews(); // Refresh reviews after response
      if (onReviewsUpdate) {
        logger.info('[ReviewsTab] Propagating review update to parent', { userId, reviewCount: reviewData.reviews.length });
        onReviewsUpdate(reviewData.reviews, reviewData.averageRating);
      }
    } catch (err) {
      logger.error('[ReviewsTab] Response submission failed', { userId, reviewId, error: err.message });
      toast.error(t('coachprofile:errorSubmitResponse'));
    }
  };

  const handleOpenReportModal = (review) => {
    if (isOwnProfile) return;
    setReportingReview(review);
    setIsReportModalOpen(true);
    setReportReason('');
    setReportDetails('');
  };

  const handleReportSubmit = async () => {
    if (!reportingReview || !reportReason) {
      toast.error(t('coachprofile:reportReasonRequired', 'A reason for the report is required.'));
      return;
    }
    try {
      await reportReview(reportingReview._id, { reason: reportReason, details: reportDetails });
      toast.success(t('coachprofile:reportSubmitted', 'Thank you for your report. Our team will review it shortly.'));
      setIsReportModalOpen(false);
    } catch (error) {
      logger.error('[ReviewsTab] Failed to submit report', { error });
      toast.error(error.response?.data?.message || t('coachprofile:errorSubmitReport', 'Failed to submit report.'));
    }
  };

  if (isLoading) return <div className="flex justify-center items-center p-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">{error}</div>;

  const totalReviews = reviewData.reviews.length;

  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="p-6">
          {totalReviews > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-5xl font-bold">{reviewData.averageRating.toFixed(1)}</span>
                <div className="flex-1">
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`h-7 w-7 ${i < Math.round(reviewData.averageRating) ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}
                      />
                    ))}
                  </div>
                  
                </div>
              </div>
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                   const percentage = totalReviews ? Math.round((reviewData.ratingBreakdown[star] / totalReviews) * 100) : 0;
                   return(
                    <div key={star} className="flex items-center gap-3 text-sm">
                      <div className="flex w-24">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${i < star ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}
                          />
                        ))}
                      </div>
                      <Progress 
                        value={percentage}
                        variant="yellow"
                        className="flex-1 h-2.5"
                      />
                      <span className="w-10 text-right font-medium text-muted-foreground">{percentage}%</span>
                    </div>
                   )
                  })}
              </div>
            </div>
          ) : (
            <h3 className="text-2xl font-semibold tracking-tight">{t('coachprofile:reviews')}</h3>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {totalReviews === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center">
            <p className="text-muted-foreground">{t('coachprofile:noReviews')}</p>
          </div>
        ) : (
          reviewData.reviews.map((review) => {
            if (!review._id) {
              logger.error('[ReviewsTab] Review missing _id during render', { review });
              return null;
            }
            return (
              <Card key={review._id}>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <Avatar>
                        <AvatarFallback>{review.clientInitials}</AvatarFallback>
                    </Avatar>
                    <div className="flex items-center gap-0.5">
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-5 w-5 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}
                          />
                        ))}
                      </div>
                      {!isOwnProfile && (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2" onClick={() => handleOpenReportModal(review)}>
                                <Flag className="h-4 w-4 text-muted-foreground/70 hover:text-muted-foreground transition-colors" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('coachprofile:reportReviewTitle', 'Report Review')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{review.comment}</p>
                  {review.coachResponse && (
                    <div className="mt-4 rounded-md border bg-muted p-4 dark:bg-muted/50">
                        <p className="text-sm font-semibold text-foreground mb-1">{t('coachprofile:coachResponse')}</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{review.coachResponse}</p>
                    </div>
                  )}
                </CardContent>
                {isOwnProfile && !review.coachResponse && (
                  <CardFooter>
                    <ResponseForm onSubmit={(responseText) => handleSubmitResponse(review._id, responseText)} />
                  </CardFooter>
                )}
              </Card>
            );
          })
        )}
      </div>
<Dialog open={isReportModalOpen} onOpenChange={setIsReportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('coachprofile:reportReviewTitle', 'Report Review')}</DialogTitle>
            <DialogDescription>{t('coachprofile:reportReviewDesc', 'Please select a reason for reporting this review. Your report helps us maintain a safe community.')}</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <RadioGroup value={reportReason} onValueChange={setReportReason}>
              <div className="flex items-center space-x-2"><RadioGroupItem value="impersonation" id="p-imp" /><Label htmlFor="p-imp">{t('coachprofile:reportReasons.impersonation', 'Impersonation or Fake Profile')}</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="inappropriate" id="p-inap" /><Label htmlFor="p-inap">{t('coachprofile:reportReasons.inappropriate', 'Inappropriate Content')}</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="spam" id="p-spam" /><Label htmlFor="p-spam">{t('coachprofile:reportReasons.spam', 'Spam or Fraud')}</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="harassment" id="p-harass" /><Label htmlFor="p-harass">{t('coachprofile:reportReasons.harassment', 'Harassment or Bullying')}</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="hate_speech" id="p-hate" /><Label htmlFor="p-hate">{t('coachprofile:reportReasons.hate_speech', 'Hate Speech')}</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="misinformation" id="p-misinfo" /><Label htmlFor="p-misinfo">{t('coachprofile:reportReasons.misinformation', 'Misinformation')}</Label></div>
            </RadioGroup>
            <Textarea
              placeholder={t('coachprofile:reportDetailsPlaceholder', 'Provide additional details (optional)...')}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReportModalOpen(false)}>{t('common:cancel')}</Button>
            <Button onClick={handleReportSubmit}>{t('common:submitReport', 'Submit Report')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ResponseForm = ({ onSubmit }) => {
  const { t } = useTranslation(['common', 'coachprofile']);
  const [responseText, setResponseText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (responseText.trim()) {
      onSubmit(responseText);
      setResponseText('');
    } else {
      toast.error(t('coachprofile:responseEmpty'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-2">
      <Textarea
        value={responseText}
        onChange={(e) => setResponseText(e.target.value)}
        placeholder={t('coachprofile:writeResponse')}
        className="w-full"
        rows={3}
        aria-label={t('coachprofile:writeResponse')}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm">{t('common:submit')}</Button>
      </div>
    </form>
  );
};

export default ReviewsTab;