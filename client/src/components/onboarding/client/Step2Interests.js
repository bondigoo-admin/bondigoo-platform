import React from 'react';
import { useTranslation } from 'react-i18next';
import SearchableListSelector from '../../SearchableListSelector';

const Step2Interests = ({ value, onUpdate }) => {
  const { t } = useTranslation('onboarding');

  return (
    <div>
      <SearchableListSelector
        listType="specialties"
        selectedItems={value}
        onUpdate={(items) => onUpdate(items)}
        placeholderKey="onboarding:interests.placeholder"
        isFilter={true}
        multiSelect={true}
      />
    </div>
  );
};

export default Step2Interests;