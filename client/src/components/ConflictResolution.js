import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Clock, X, ChevronRight, Calendar } from 'lucide-react';
import moment from 'moment';

const ConflictResolution = ({ conflicts, onResolve, onClose }) => {
  const { t } = useTranslation(['common', 'managesessions']);
  const [processedConflicts, setProcessedConflicts] = useState([]);

  useEffect(() => {
    // Process and validate conflicts
    const validConflicts = (Array.isArray(conflicts) ? conflicts : [])
      .filter(conflict => conflict && conflict.session1 && conflict.session2)
      .map(conflict => ({
        ...conflict,
        session1: { ...conflict.session1, isNew: conflict.session1.isNew || false },
        session2: { ...conflict.session2, isNew: conflict.session2.isNew || false }
      }));
    setProcessedConflicts(validConflicts);
  }, [conflicts]);

  const formatSessionTime = (session) => {
    if (!session.start || !session.end) return 'Invalid time';
    return `${moment(session.start).format('MMM D, YYYY h:mm A')} - ${moment(session.end).format('h:mm A')}`;
  };

  const getSessionTypeName = (session) => {
    if (session.sessionType?.name) return session.sessionType.name;
    if (session.type) return session.type;
    return 'Unknown session type';
  };

  const handleResolve = (keptSession, removedSession) => {
    console.log('Resolving conflict:', { keptSession, removedSession });
    onResolve(keptSession, removedSession);
  };

  if (processedConflicts.length === 0) {
    return null; // Don't render anything if there are no valid conflicts
  }

  return (
    <motion.div 
      className="modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div 
        className="modal-content conflict-resolution"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
      >
        <div className="conflict-resolution-header">
          <h3>
            <AlertTriangle size={24} />
            {t('managesessions:conflictsDetected')}
          </h3>
          <button onClick={onClose} className="close-button" aria-label="Close">
            <X size={24} />
          </button>
        </div>
        <p>{t('managesessions:conflictResolutionMessage')}</p>
  
        <AnimatePresence>
          <ul className="conflict-list">
            {processedConflicts.map((conflict, index) => (
              <motion.li 
                key={`conflict-${index}`}
                className="conflict-item"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="conflict-sessions">
                  {[conflict.session1, conflict.session2].map((session, sessionIndex) => (
                    <div key={`session-${index}-${sessionIndex}`} className="conflict-session">
                      <div className="session-header">
                        <Clock size={16} />
                        <span className="session-title">
                          {session.title || t(`managesessions:${getSessionTypeName(session)}`)}
                        </span>
                        {session.isNew && <span className="new-badge">{t('managesessions:new')}</span>}
                      </div>
                      <span className="session-time">
                        <Calendar size={14} />
                        {formatSessionTime(session)}
                      </span>
                    </div>
                  ))}
                  <ChevronRight size={24} className="conflict-arrow" />
                </div>
                <div className="conflict-actions">
                  <button 
                    onClick={() => handleResolve(conflict.session1, conflict.session2)} 
                    className="btn btn-primary"
                  >
                    {t('managesessions:keepFirst')}
                  </button>
                  <button 
                    onClick={() => handleResolve(conflict.session2, conflict.session1)} 
                    className="btn btn-secondary"
                  >
                    {t('managesessions:keepSecond')}
                  </button>
                </div>
              </motion.li>
            ))}
          </ul>
        </AnimatePresence>
  
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-outline">
            {t('common:cancel')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

ConflictResolution.propTypes = {
  conflicts: PropTypes.oneOfType([
    PropTypes.arrayOf(
      PropTypes.shape({
        session1: PropTypes.object,
        session2: PropTypes.object,
      })
    ),
    PropTypes.object
  ]).isRequired,
  onResolve: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default ConflictResolution;