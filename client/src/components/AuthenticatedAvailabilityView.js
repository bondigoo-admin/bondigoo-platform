import React, { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../contexts/AuthContext';
import ManageSessions from './ManageSessions';
import AvailabilityTab from './AvailabilityTab';
import { getCoachProfile } from '../services/coachAPI';

const AuthenticatedAvailabilityView = ({ coachId }) => {
  const { t } = useTranslation(['common', 'coachprofile']);
  const { user } = useContext(AuthContext);
  const [viewAsUser, setViewAsUser] = useState(false);
  const [isCoach, setIsCoach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCoachData = async () => {
      try {
        setLoading(true);
        const coachData = await getCoachProfile(coachId);
        setIsCoach(user.id === coachData.user._id || user.role === 'admin');
        setLoading(false);
      } catch (err) {
        console.error('Error fetching coach data:', err);
        setError('Error loading coach data');
        setLoading(false);
      }
    };

    fetchCoachData();
  }, [coachId, user]);

  const toggleView = () => {
    setViewAsUser(!viewAsUser);
  };

  if (loading) {
    return <div>{t('common:loading')}</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  if (isCoach && !viewAsUser) {
    return (
      <div>
        <button onClick={toggleView} className="btn-secondary mb-4">
          {t('coachprofile:viewAsUser')}
        </button>
        <ManageSessions coachId={coachId} />
      </div>
    );
  }

  return (
    <div>
      {isCoach && (
        <button onClick={toggleView} className="btn-secondary mb-4">
          {t('coachprofile:viewAsCoach')}
        </button>
      )}
      <AvailabilityTab coachId={coachId} />
    </div>
  );
};

export default AuthenticatedAvailabilityView;