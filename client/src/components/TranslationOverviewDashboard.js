import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Edit } from 'lucide-react';

const TranslationOverviewDashboard = ({ overview = {}, onListTypeSelect }) => {
  const { t } = useTranslation(['admin']);
  const [selectedList, setSelectedList] = useState(null);

  const getStatusColor = (percentage) => {
    if (percentage === 0) return '#FF4136';
    if (percentage < 50) return '#FF851B';
    if (percentage < 80) return '#FFDC00';
    return '#2ECC40';
  };

  const calculateListProgress = (languages) => {
    let totalPercentage = 0;
    let count = 0;
    Object.entries(languages).forEach(([lang, status]) => {
      if (lang !== 'en') {
        totalPercentage += status.percentage;
        count++;
      }
    });
    return count > 0 ? totalPercentage / count : 0;
  };

  const calculateOverallProgress = () => {
    let totalProgress = 0;
    let count = 0;
    Object.values(overview).forEach(languages => {
      totalProgress += calculateListProgress(languages);
      count++;
    });
    return count > 0 ? totalProgress / count : 0;
  };

  const overallProgress = calculateOverallProgress();

  const handleListClick = (listType) => {
    setSelectedList(listType);
    onListTypeSelect(listType);
  };

  const handleEditTranslations = (e, listType) => {
    e.stopPropagation();
    onListTypeSelect(listType);
  };

  return (

     
      <div className="list-type-grid">
        <AnimatePresence>
          {Object.entries(overview).map(([listType, languages]) => {
            const listProgress = calculateListProgress(languages);
            const isSelected = selectedList === listType;
            
            return (
              <motion.div 
                key={listType}
                className={`list-type-card ${isSelected ? 'selected' : ''}`}
                onClick={() => handleListClick(listType)}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  height: isSelected ? 'auto' : '120px',
                  transition: { duration: 0.3 }
                }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <h3>{t(`admin:listTypes.${listType}`)}</h3>
                <div className="list-progress">
                  <div className="progress-bar">
                    <motion.div 
                      className="progress-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${listProgress}%` }}
                      transition={{ duration: 0.5 }}
                      style={{ backgroundColor: getStatusColor(listProgress) }}
                    />
                  </div>
                  <span className="progress-text">{listProgress.toFixed(0)}%</span>
                </div>
                <AnimatePresence>
                  {isSelected && (
                    <motion.div 
                      className="language-progress"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      {Object.entries(languages).map(([lang, status]) => (
                        lang !== 'en' && (
                          <div key={lang} className="language-status">
                            <span className="language-code">{lang.toUpperCase()}</span>
                            <div className="progress-bar">
                              <motion.div 
                                className="progress-fill"
                                initial={{ width: 0 }}
                                animate={{ width: `${status.percentage}%` }}
                                transition={{ duration: 0.5 }}
                                style={{ backgroundColor: getStatusColor(status.percentage) }}
                              />
                            </div>
                            <span className="percentage">{status.percentage.toFixed(0)}%</span>
                          </div>
                        )
                      ))}
                      <button className="edit-translations-button" onClick={(e) => handleEditTranslations(e, listType)}>
                        <Edit size={16} /> {t('admin:editTranslations')}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.div 
                  className="expand-icon"
                  initial={{ rotate: 0 }}
                  animate={{ rotate: isSelected ? 180 : 0 }}
                >
                  {isSelected ? <ChevronUp /> : <ChevronDown />}
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
  );
};

export default TranslationOverviewDashboard;