import React from 'react';
import { useTranslation } from 'react-i18next';

const Translation = ({ i18nKey, defaultValue }) => {
  const { t } = useTranslation();
  const translatedText = t(i18nKey);

  if (process.env.NODE_ENV === 'development' && translatedText === i18nKey) {
    return <span style={{ color: 'red' }}>{`[MISSING: ${i18nKey}]`}</span>;
  }

  return translatedText || defaultValue || i18nKey;
};

export default Translation;