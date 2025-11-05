import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';
import { CheckCircle, Target, BookOpen, Zap, Compass, Presentation } from 'lucide-react';
import { cn } from '../../../lib/utils'; // Make sure this path is correct for your project

const options = [
  { id: 'one_on_one', icon: Target },
  { id: 'programs', icon: BookOpen },
  { id: 'live_sessions', icon: Zap },
  { id: 'webinars', icon: Presentation },
  { id: 'exploring', icon: Compass },
];

const Step1PrimaryGoal = ({ value = [], onToggle }) => {
  const { t } = useTranslation('onboarding');

  const handleSelect = (id) => {
    if (typeof onToggle !== 'function') {
      console.error("Error: The 'onToggle' prop is missing. Please update the parent component.");
      return;
    }
    onToggle(id);
  };

  return (
    <div className="space-y-4">
      {options.map((option) => {
        const isSelected = value.includes(option.id);
        const IconComponent = option.icon;

        return (
          <Card
            key={option.id}
            onClick={() => handleSelect(option.id)}
            className={cn(
              'group cursor-pointer transition-all duration-200 ease-in-out border rounded-2xl',
              isSelected
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-lg'
                : 'border-slate-200 dark:border-slate-800 bg-transparent hover:border-indigo-400/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardTitle
                className={cn(
                  'flex items-center text-base font-semibold transition-colors',
                  isSelected 
                    ? 'text-indigo-700 dark:text-indigo-400' 
                    : 'text-slate-700 dark:text-slate-200'
                )}
              >
                <IconComponent
                  className={cn(
                    'mr-3 h-5 w-5 transition-colors',
                     isSelected
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-500 dark:text-slate-400'
                  )}
                />
                {t(`goal.${option.id}.title`)}
              </CardTitle>
              {isSelected && <CheckCircle className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p
                className={cn(
                  'pl-8 text-sm text-slate-500 dark:text-slate-400'
                )}
              >
                {t(`goal.${option.id}.description`)}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default Step1PrimaryGoal;