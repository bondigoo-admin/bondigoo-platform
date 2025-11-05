// src/components/ReviewForm.js

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { logger } from '../utils/logger';

const ReviewForm = ({ bookingId, coachName, onSubmitReview, notificationType }) => {
  const { t } = useTranslation(['common', 'review']);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const isCoachReview = notificationType === 'review_prompt_coach';

  const handleSubmit = (e) => {
    e.preventDefault();
    logger.info('[ReviewForm] Submitting review:', {
      bookingId,
      rating,
      comment,
      isCoachReview,
    });
    onSubmitReview(bookingId, { rating, comment, isCoachReview });
    setRating(0);
    setComment('');
  };

  return (
    <form onSubmit={handleSubmit} className="review-form">
      <h4>
        {isCoachReview 
          ? t('review:leaveReviewForClient') 
          : t('review:leaveReviewForCoach', { coachName })}
      </h4>
      <div className="rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={24}
            onClick={() => setRating(star)}
            fill={star <= rating ? 'gold' : 'none'}
            stroke={star <= rating ? 'gold' : 'currentColor'}
            style={{ cursor: 'pointer' }}
          />
        ))}
      </div>
      <div>
        <label>{t('review:comment')}:</label>
        <textarea 
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          required
        ></textarea>
      </div>
      <button type="submit">{t('review:submit')}</button>
    </form>
  );
};

export default ReviewForm;