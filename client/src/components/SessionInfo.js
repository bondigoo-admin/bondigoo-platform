
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';

const SessionInfo = ({ bookingId, userRole }) => {
  const { t } = useTranslation();
  const [sessionUrl, setSessionUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Fetch session link from backend
  useEffect(() => {
    const fetchSessionLink = async () => {
      setLoading(true);
      try {
        const response = await axios.post(
          `${process.env.REACT_APP_API_URL}/sessions/generate/${bookingId}`,
          {},
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`, // Assumes JWT token storage
            },
          }
        );
        setSessionUrl(response.data.sessionUrl);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch session link');
      } finally {
        setLoading(false);
      }
    };

    fetchSessionLink();
  }, [bookingId]);

  // Copy session link to clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(sessionUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    }).catch((err) => {
      console.error('Failed to copy link:', err);
      setError('Failed to copy link');
    });
  };

  if (loading) return <div className="loading">{t('session.loading')}</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="session-info">
      <h3>{t('session.info.title')}</h3>
      <p>{t('session.info.role', { role: userRole || 'unknown' })}</p>
      {sessionUrl && (
        <div className="session-link-container">
          <label>{t('session.info.link')}</label>
          <div className="link-display">
            <input
              type="text"
              value={sessionUrl}
              readOnly
              className="session-link-input"
            />
            <button
              onClick={handleCopyLink}
              className="copy-button"
              title={t('session.info.copy')}
            >
              {copied ? t('session.info.copied') : t('session.info.copy')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

SessionInfo.propTypes = {
  bookingId: PropTypes.string.isRequired,
  userRole: PropTypes.string,
};

export default SessionInfo;