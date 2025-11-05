import React from 'react';
import { useTranslation } from 'react-i18next';
import CoachCard from '../../CoachCard';
import { Loader2 } from 'lucide-react';

const Step6Publish = ({ coach }) => {
  const { t } = useTranslation('onboarding');

  return (
    <div className="flex flex-col items-center gap-8 pt-8">
      <h3 className="text-xl font-semibold">{t('step6c.previewTitle')}</h3>
      <div className="w-full max-w-sm mx-auto">
        {coach ? (
          <CoachCard coach={coach} onInitiateRequest={() => {/*empty*/}} isAuthenticated={false} view="grid" isPreviewMode={true} />
        ) : (
          <div className="flex justify-center items-center h-64 border-2 border-dashed rounded-lg">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
};

export default Step6Publish;