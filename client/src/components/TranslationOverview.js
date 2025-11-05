import React from 'react';
import { useTranslation } from 'react-i18next';

const TranslationOverview = ({ overview }) => {
  const { t } = useTranslation(['admin']);

  return (
    <div className="translation-overview">
      <h3>{t('admin:translationOverview')}</h3>
      <div className="overview-grid">
        {Object.entries(overview).map(([listType, langStatus]) => (
          <div key={listType} className="list-type-card">
            <h4>{t(`admin:listTypes.${listType}`)}</h4>
            {Object.entries(langStatus).map(([lang, status]) => (
              <div 
                key={lang} 
                className={`language-status ${status.percentage === 100 ? 'complete' : 'incomplete'}`}
              >
                <span className="language-name">{t(`admin:language.${lang}`)}</span>
                <div className="status-bar">
                  <div 
                    className="status-fill" 
                    style={{ width: `${status.percentage}%` }}
                  ></div>
                </div>
                <span className="status-text">
                  {status.translated}/{status.total} ({status.percentage.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TranslationOverview;