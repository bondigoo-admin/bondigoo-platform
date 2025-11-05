import React from 'react';
import { useTranslation } from 'react-i18next';
import { User, Users, Settings } from 'lucide-react';

const UserProfileTabs = ({ activeTab, setActiveTab, isOwnProfile }) => {
  const { t } = useTranslation(['common', 'userprofile']);

  const tabsConfig = [
    { id: 'about', label: t('userprofile:tabs.about'), icon: User },
    { id: 'connections', label: t('userprofile:tabs.connections'), icon: Users },
    { id: 'settings', label: t('userprofile:tabs.settings'), icon: Settings, forOwnerOnly: true },
  ];

  const availableTabs = tabsConfig.filter(tab => {
    if (tab.forOwnerOnly) {
      return isOwnProfile;
    }
    return true;
  });

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <nav className="-mb-px flex flex-wrap justify-center sm:justify-start" aria-label="Tabs">
        {availableTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                whitespace-nowrap py-4 px-3 sm:px-4 border-b-2 font-medium text-sm
                ${activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600'}
                flex items-center mr-2 sm:mr-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 transition-colors duration-200
              `}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              <Icon className="h-5 w-5 mr-2" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default UserProfileTabs;