import React from 'react';
import { useTranslation } from 'react-i18next';
import PackageManager from './PackageManager';

const PackagesTab = ({ coachId }) => {
  const { t } = useTranslation(['common', 'coachprofile']);

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
      <div className="px-4 py-5 sm:px-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          {t('coachprofile:packages')}
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          {t('coachprofile:packagesDescription')}
        </p>
      </div>
      <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
        <PackageManager coachId={coachId} />
      </div>
    </div>
  );
};

export default PackagesTab;