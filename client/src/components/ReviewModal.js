import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import PropTypes from 'prop-types';
import { toast } from 'react-hot-toast';
import { Star, Loader2 } from 'lucide-react';

// UI Components
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog.tsx';
import { Button } from './ui/button.tsx';
import { Label } from './ui/label.tsx';
import { Textarea } from './ui/textarea.tsx';
import { cn } from '../lib/utils';

// API Services
import { submitClientReview, submitCoachReview, submitProgramReview } from '../services/ReviewAPI';

const ReviewModal = ({ reviewType, entityId, entityTitle, onClose, onSubmitSuccess, existingReview, isSavingProgress }) => {
  const { t } = useTranslation(['review', 'common']);
  
  // Component State
  const [rating, setRating] = useState(existingReview?.rating || 0);
  const [comment, setComment] = useState(existingReview?.comment || '');
  const [privateFeedback, setPrivateFeedback] = useState(existingReview?.privateFeedback || '');
  const [hoveredRating, setHoveredRating] = useState(0);

  // Draggable Modal State & Refs
  const modalRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
  const [isPositionManagedByJS, setIsPositionManagedByJS] = useState(false);

  // Data Mutation
  const getMutationFn = () => {
      switch(reviewType) {
          case 'program': return submitProgramReview;
          case 'session_client': return submitClientReview;
          case 'session_coach': return submitCoachReview;
          default: return () => Promise.reject(new Error('Invalid review type'));
      }
  };

  const { mutate, isLoading } = useMutation(getMutationFn(), {
    onSuccess: (data) => {
      if (onSubmitSuccess) onSubmitSuccess(data);
      //toast.success(t('review:reviewSubmittedSuccess'));
      onClose();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('common:submitError'));
    },
  });

  // Event Handlers
  const handleStarClick = (value) => setRating(value);
  const handleStarHover = (value) => setHoveredRating(value);
  const handleStarLeave = () => setHoveredRating(0);

  const handleSubmit = () => {
    if (rating === 0) {
      toast.error(t('ratingRequired'));
      return;
    }
    
    let reviewData;
    if (reviewType === 'program') {
      reviewData = { programId: entityId, rating, comment, privateFeedback };
    } else { // session reviews
      reviewData = { sessionId: entityId, rating, comment, privateFeedback };
    }
    
    mutate({ ...reviewData, reviewId: existingReview?._id });
  };

  // Draggable Modal Logic
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !modalRef.current) return;
      setPosition({ x: e.clientX - dragStartOffset.x, y: e.clientY - dragStartOffset.y });
    };
    const handleMouseUp = () => isDragging && setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStartOffset]);

  const isOpen = true; // Modal is controlled by its presence in the DOM
  
  useEffect(() => {
      if (!isOpen) setIsPositionManagedByJS(false);
  }, [isOpen]);

  useEffect(() => {
    if (modalRef.current && isPositionManagedByJS) {
      modalRef.current.style.setProperty('top', `${position.y}px`, 'important');
      modalRef.current.style.setProperty('left', `${position.x}px`, 'important');
      modalRef.current.style.setProperty('transform', 'none', 'important');
    } else if (modalRef.current) {
      modalRef.current.style.removeProperty('top');
      modalRef.current.style.removeProperty('left');
      modalRef.current.style.removeProperty('transform');
    }
  }, [isPositionManagedByJS, position]);

  const handleMouseDownOnTitle = (e) => {
    if (e.button !== 0 || !modalRef.current) return;
    const modalRect = modalRef.current.getBoundingClientRect();
    const startX = isPositionManagedByJS ? position.x : modalRect.left;
    const startY = isPositionManagedByJS ? position.y : modalRect.top;
    if (!isPositionManagedByJS) {
      setPosition({ x: startX, y: startY });
      setIsPositionManagedByJS(true);
    }
    setIsDragging(true);
    setDragStartOffset({ x: e.clientX - startX, y: e.clientY - startY });
    e.preventDefault();
  };

  // Dynamic Title
  const title = reviewType === 'program' 
    ? (existingReview ? t('editReviewProgramTitle', { title: entityTitle }) : t('reviewProgramTitle', { title: entityTitle }))
    : (existingReview ? t('editReviewSessionTitle') : t('reviewSessionTitle'));
    
  

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent ref={modalRef} className="sm:max-w-lg max-h-[90vh] flex flex-col" onPointerDownOutside={(e) => isDragging && e.preventDefault()}>
        <DialogHeader onMouseDown={handleMouseDownOnTitle} className="cursor-move flex-shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-6">
          {/* Rating Section */}
          <div className="p-4 bg-muted/50 dark:bg-muted/20 rounded-lg">
            <Label className="block mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t('rating')}</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleStarClick(star)}
                  onMouseEnter={() => handleStarHover(star)}
                  onMouseLeave={handleStarLeave}
                  className="p-0 bg-transparent border-none cursor-pointer transition-transform duration-100 ease-in-out hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Rate ${star} stars`}
                  disabled={isLoading}
                >
                  <Star
                    className={cn(
                      'w-8 h-8 text-gray-300 dark:text-gray-600 transition-colors',
                      star <= (hoveredRating || rating) && 'text-yellow-400'
                    )}
                    fill={star <= (hoveredRating || rating) ? 'currentColor' : 'none'}
                  />
                </button>
              ))}
            </div>
          </div>
          
          {/* Public Comment Section */}
          <div className="space-y-2">
            <Label htmlFor="comment" className="text-sm font-medium">{t('comment')}</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('commentPlaceholder')}
              rows={4}
              disabled={isLoading}
            />
          </div>

          {/* Private Feedback Section */}
          {(reviewType === 'session_client' || reviewType === 'program') && (
            <div className="space-y-2">
              <Label htmlFor="privateFeedback" className="text-sm font-medium">{t('privateFeedback')}</Label>
              <Textarea
                id="privateFeedback"
                value={privateFeedback}
                onChange={(e) => setPrivateFeedback(e.target.value)}
                placeholder={t('privateFeedbackPlaceholder')}
                rows={3}
                disabled={isLoading}
              />
            </div>
          )}
        </div>
        
        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isLoading || isSavingProgress}>
            {t('common:cancel')}
          </Button>
           <Button onClick={handleSubmit} disabled={rating === 0 || isLoading || isSavingProgress}>
            {(isLoading || isSavingProgress) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isSavingProgress ? t('common:saving') : isLoading ? t('common:submitting') : (existingReview ? t('common:update') : t('common:submit'))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

ReviewModal.propTypes = {
  reviewType: PropTypes.oneOf(['program', 'session_client', 'session_coach']).isRequired,
  entityId: PropTypes.string.isRequired,
  entityTitle: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSubmitSuccess: PropTypes.func,
  existingReview: PropTypes.shape({
    _id: PropTypes.string,
    rating: PropTypes.number,
    comment: PropTypes.string,
    privateFeedback: PropTypes.string,
  }),
  isSavingProgress: PropTypes.bool,
};

ReviewModal.defaultProps = {
  isSavingProgress: false,
  entityTitle: '',
  onSubmitSuccess: () => {/*empty*/},
  existingReview: null,
};

export default ReviewModal;