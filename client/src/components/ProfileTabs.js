import React from 'react';
import { User, Calendar, Package, Star, Settings, Shield, Users, BookOpen } from 'lucide-react';

const ProfileTabs = ({ activeTab, setActiveTab, tabs }) => {

  const iconMap = {
    about: User,
    availability: Calendar,
    packages: Package,
    reviews: Star,
    programs: BookOpen,
    policies: Shield,
    connections: Users,
    settings: Settings,
  };

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex flex-wrap justify-center sm:justify-start" aria-label="Tabs">
        {tabs.map((tab) => {
          const Icon = iconMap[tab.id] || User;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                whitespace-nowrap py-4 px-1 sm:px-4 border-b-2 font-medium text-sm
                ${activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                flex items-center mr-2 sm:mr-8 focus:outline-none transition-colors duration-200
              `}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              <Icon className="h-5 w-5 mr-2" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default ProfileTabs;