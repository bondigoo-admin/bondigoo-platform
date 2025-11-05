import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getUpcomingBookings } from '../services/coachAPI';
import ReviewForm from './ReviewForm';
import ReminderBadge from './ui/ReminderBadge';
import moment from 'moment';


const UpcomingSessions = ({ userId }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { t } = useTranslation(['common', 'managesessions']);
  const [filter, setFilter] = useState('all');
  const [showReviewForm, setShowReviewForm] = useState(null);

  useEffect(() => {
    if (userId) {
      fetchSessions();
    } else {
      setError('User ID is missing. Please make sure you are logged in.');
      setLoading(false);
    }
  }, [userId]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getUpcomingBookings(userId);
      setSessions(data);
    } catch (error) {
      console.error('Error fetching upcoming sessions:', error);
      setError('Failed to fetch upcoming sessions. Please try again later.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredSessions = sessions.filter(session => 
    filter === 'all' || (session.sessionType && session.sessionType.name.toLowerCase() === filter)
  );

  const handleReviewSubmitted = () => {
    setShowReviewForm(null);
    fetchSessions();
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="upcoming-sessions">
      <h2>{t('managesessions:upcomingTitle')}</h2>
      {filteredSessions.length === 0 ? (
        <p>No upcoming sessions found.</p>
      ) : (
        filteredSessions.map(session => (
          <div key={session._id} className="session-item">
            <p>{session.coach && session.coach.name ? session.coach.name : 'Unknown Coach'} - {formatDate(session.start)}</p>
            <p>{session.sessionType ? session.sessionType.name : 'Unknown Session Type'}</p>
            {session.status === 'completed' && !session.reviewed && (
              <button onClick={() => setShowReviewForm(session._id)}>
                {t('managesessions:leaveReview')}
              </button>
            )}
            {showReviewForm === session._id && (
              <ReviewForm
                sessionId={session._id}
                coachId={session.coach ? session.coach._id : null}
                onReviewSubmitted={handleReviewSubmitted}
              />
            )}
            <ReminderBadge 
              startTime={session.start}
              variant={moment(session.start).diff(moment(), 'minutes') <= 15 ? 'urgent' : 'default'}
            />
          </div>
        ))
      )}
    </div>
  );
};

export default UpcomingSessions;