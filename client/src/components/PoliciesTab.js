import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Clock, RefreshCw, Info, CalendarClock, ShieldAlert, Pencil } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, de } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Button } from './ui/button.tsx';

const locales = { en: enUS, de };

const PolicyDisplayCard = ({ title, policy, t }) => {
  if (!policy || !policy.tiers || policy.tiers.length === 0) {
    return null;
  }

  const sortedTiers = [...policy.tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);

  return (
    <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full">
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col space-y-6 pt-0">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider flex items-center">
            <CalendarClock className="mr-2 h-4 w-4" />
            {t('coachprofile:refundPolicy')}
          </h4>
          <ul className="space-y-2.5">
            {sortedTiers.map((tier, index) => (
              <li key={index} className="flex items-start">
                <div className="flex-shrink-0 h-5 flex items-center">
                  <span className="block h-1.5 w-1.5 rounded-full bg-primary/50"></span>
                </div>
                <p className="ml-3 text-sm text-slate-700 dark:text-slate-300">
                  {t('coachprofile:refundTierDescription', {
                    percentage: tier.refundPercentage,
                    hours: tier.hoursBefore,
                  })}
                </p>
              </li>
            ))}
            <li className="flex items-start">
              <div className="flex-shrink-0 h-5 flex items-center">
                 <span className="block h-1.5 w-1.5 rounded-full bg-primary/50"></span>
              </div>
              <p className="ml-3 text-sm text-slate-700 dark:text-slate-300">
                {t('coachprofile:noRefundTierDescription', {
                  hours: sortedTiers[sortedTiers.length - 1]?.hoursBefore || 0,
                })}
              </p>
            </li>
          </ul>
        </div>

        {policy.rescheduling && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider flex items-center">
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('coachprofile:reschedulingPolicy')}
            </h4>
            <div className="flex items-start">
               <div className="flex-shrink-0 h-5 flex items-center">
                  <span className="block h-1.5 w-1.5 rounded-full bg-primary/50"></span>
                </div>
              <p className="ml-3 text-sm text-slate-700 dark:text-slate-300">
                {t('coachprofile:reschedulingAllowedBefore', { hours: policy.rescheduling.allowClientInitiatedRescheduleHoursBefore })}
              </p>
            </div>
          </div>
        )}

        <div className="flex-grow"></div>

        <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-start text-xs text-slate-500 dark:text-slate-400">
                <ShieldAlert className="h-4 w-4 mr-2.5 mt-0.5 flex-shrink-0" />
                <p>
                    {t('coachprofile:selfCancellationNotice', { hours: policy.minimumNoticeHoursClientCancellation })}
                </p>
            </div>
        </div>

      </CardContent>
    </Card>
  );
};

const PoliciesTab = ({ cancellationPolicy, isOwnProfile }) => {
  const { t, i18n } = useTranslation(['common', 'coachprofile']);
  const navigate = useNavigate();

  const handleEditPolicies = () => {
    navigate('/settings?tab=coach');
  };

  const lastUpdated = cancellationPolicy?.lastUpdated
    ? formatDistanceToNow(new Date(cancellationPolicy.lastUpdated), { addSuffix: true, locale: locales[i18n.language] || enUS })
    : null;

  const hasPolicies = cancellationPolicy && (cancellationPolicy.oneOnOne || cancellationPolicy.webinar);

  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 sm:p-6 rounded-lg">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {t('coachprofile:policiesTitle')}
          </h3>
          {lastUpdated && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center">
              <Clock size={12} className="mr-1.5" />
              <span>{t('common:lastUpdated')} {lastUpdated}</span>
            </p>
          )}
        </div>
        {isOwnProfile && (
          <Button variant="outline" onClick={handleEditPolicies}>
            <Pencil className="mr-2 h-4 w-4" />
            {t('common:edit')}
          </Button>
        )}
      </div>
      
      {hasPolicies ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cancellationPolicy.oneOnOne && (
            <PolicyDisplayCard title={t('coachprofile:policyTypes.oneOnOne')} policy={cancellationPolicy.oneOnOne} t={t} />
          )}
          {cancellationPolicy.webinar && (
             <PolicyDisplayCard title={t('coachprofile:policyTypes.webinar')} policy={cancellationPolicy.webinar} t={t} />
          )}
        </div>
      ) : (
         <div className="p-4 my-4 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 rounded-lg flex items-center gap-3 border border-slate-200 dark:border-slate-700">
           <Info size={18} className="text-slate-500 dark:text-slate-400" />
           <span>{t('coachprofile:noPoliciesSet')}</span>
         </div>
      )}
    </div>
  );
};

export default PoliciesTab;