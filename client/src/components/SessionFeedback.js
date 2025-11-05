import React, { useState } from 'react';
import { Star, Send, ThumbsUp, Clock, Book, Target } from 'lucide-react';

const SessionFeedback = ({ sessionId, coachName, sessionType, onSubmitFeedback }) => {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [aspectRatings, setAspectRatings] = useState({
    preparedness: 0,
    knowledge: 0,
    communication: 0,
    helpfulness: 0,
  });
  const [goals, setGoals] = useState([]);
  const [newGoal, setNewGoal] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleRatingChange = (newRating) => {
    setRating(newRating);
  };

  const handleAspectRatingChange = (aspect, value) => {
    setAspectRatings(prev => ({ ...prev, [aspect]: value }));
  };

  const handleAddGoal = () => {
    if (newGoal.trim()) {
      setGoals([...goals, newGoal.trim()]);
      setNewGoal('');
    }
  };

  const handleRemoveGoal = (index) => {
    setGoals(goals.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const feedbackData = {
      sessionId,
      rating,
      feedback,
      aspectRatings,
      goals,
    };
    onSubmitFeedback(feedbackData);
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <div className="session-feedback submitted">
        <ThumbsUp size={48} />
        <h2>Thank you for your feedback!</h2>
        <p>Your input helps us improve our coaching services.</p>
      </div>
    );
  }

  return (
    <div className="session-feedback">
      <h2>Session Feedback</h2>
      <p className="session-info">
        {sessionType} session with {coachName}
      </p>
      <form onSubmit={handleSubmit}>
        <div className="rating-section">
          <h3>Overall Rating</h3>
          <div className="star-rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                size={32}
                onClick={() => handleRatingChange(star)}
                fill={star <= rating ? '#ffc107' : 'none'}
                stroke={star <= rating ? '#ffc107' : '#ccc'}
                className="star"
              />
            ))}
          </div>
        </div>

        <div className="aspect-ratings">
          <h3>Rate specific aspects</h3>
          {Object.entries(aspectRatings).map(([aspect, value]) => (
            <div key={aspect} className="aspect-rating">
              <label>{aspect.charAt(0).toUpperCase() + aspect.slice(1)}</label>
              <input
                type="range"
                min="0"
                max="5"
                value={value}
                onChange={(e) => handleAspectRatingChange(aspect, parseInt(e.target.value))}
              />
              <span>{value}</span>
            </div>
          ))}
        </div>

        <div className="feedback-section">
          <h3>Your Feedback</h3>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Share your thoughts about the session..."
            rows="4"
          />
        </div>

        <div className="goals-section">
          <h3>Goals and Outcomes</h3>
          <div className="add-goal">
            <input
              type="text"
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              placeholder="Enter a goal or outcome"
            />
            <button type="button" onClick={handleAddGoal}>
              Add
            </button>
          </div>
          <ul className="goals-list">
            {goals.map((goal, index) => (
              <li key={index}>
                <Target size={16} />
                <span>{goal}</span>
                <button type="button" onClick={() => handleRemoveGoal(index)}>
                  &times;
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button type="submit" className="submit-button">
          <Send size={20} />
          Submit Feedback
        </button>
      </form>
    </div>
  );
};

export default SessionFeedback;