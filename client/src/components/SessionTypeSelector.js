import React from 'react';
import { useTranslation } from 'react-i18next';

const SessionTypeSelector = ({ sessionTypes, selectedType, onSelectType }) => {
  const { t } = useTranslation(['common', 'managesessions']);

  console.log('SessionTypes in SessionTypeSelector:', sessionTypes);

  return (
    <div className="session-type-selector">
      <button
        key="all"
        className={`session-type-button ${selectedType === 'all' ? 'active' : ''}`}
        onClick={() => onSelectType('all')}
      >
        {t('managesessions:all')}
      </button>
      {sessionTypes.map(type => (
        <button
          key={type.id}
          className={`session-type-button ${selectedType === type.id ? 'active' : ''}`}
          onClick={() => onSelectType(type.id)}
        >
          {t(`managesessions:${type.name}`)}
        </button>
      ))}
    </div>
  );
};

export default SessionTypeSelector;