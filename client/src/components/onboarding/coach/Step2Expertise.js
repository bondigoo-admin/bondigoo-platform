import React from 'react';
import { useTranslation } from 'react-i18next';
import SearchableListSelector from '../../SearchableListSelector';
import { Label } from '../../ui/label.tsx';

const Step2Expertise = ({ data, onUpdate }) => {
  const { t } = useTranslation('onboarding');

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-2 block">{t('step2c.specialtiesLabel')}</Label>
        <SearchableListSelector
          listType="specialties"
          selectedItems={data.specialties}
          onUpdate={(items) => onUpdate('specialties', items)}
          placeholderKey="onboarding_coach:step2c.specialtiesPlaceholder"
          multiSelect
          isFilter
        />
      </div>
      <div>
        <Label className="mb-2 block">{t('step2c.skillsLabel')}</Label>
        <SearchableListSelector
          listType="skills"
          selectedItems={data.skills}
          onUpdate={(items) => onUpdate('skills', items)}
          placeholderKey="onboarding_coach:step2c.skillsPlaceholder"
          multiSelect
          isFilter
        />
      </div>
      <div>
        <Label className="mb-2 block">{t('step2c.languagesLabel')}</Label>
        <SearchableListSelector
          listType="languages"
          selectedItems={data.languages}
          onUpdate={(items) => onUpdate('languages', items)}
          placeholderKey="onboarding_coach:step2c.languagesPlaceholder"
          multiSelect
          isFilter
        />
      </div>
    </div>
  );
};

export default Step2Expertise;