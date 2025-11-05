import React from 'react';
import { useTranslation } from 'react-i18next';
import SearchableListSelector from '../../SearchableListSelector';
import BioEditor from '../../BioEditor';
import { Label } from '../../ui/label.tsx';

const Step3Credentials = ({ data, onUpdate }) => {
  const { t } = useTranslation('onboarding');

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-2 block">{t('step3c.bioLabel')}</Label>
        <BioEditor
          initialBio={data.bio}
          onBioChange={(newBio) => onUpdate('bio', newBio)}
        />
      </div>
      <div>
        <Label className="mb-2 block">{t('step3c.educationLabel')}</Label>
        <SearchableListSelector
          listType="educationLevels"
          selectedItems={data.educationLevels}
          onUpdate={(items) => onUpdate('educationLevels', items)}
          placeholderKey="onboarding_coach:step3c.educationPlaceholder"
          multiSelect
          isFilter
        />
      </div>
      <div>
        <Label className="mb-2 block">{t('step3c.coachingStylesLabel')}</Label>
        <SearchableListSelector
          listType="coachingStyles"
          selectedItems={data.coachingStyles}
          onUpdate={(items) => onUpdate('coachingStyles', items)}
          placeholderKey="onboarding_coach:step3c.coachingStylesPlaceholder"
          multiSelect
          isFilter
        />
      </div>
    </div>
  );
};

export default Step3Credentials;