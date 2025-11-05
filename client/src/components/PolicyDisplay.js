import React from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Clock, RefreshCw, Percent, AlertTriangle, FileText, CalendarDays, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Badge } from './ui/badge.tsx';

const PolicyDisplay = ({ 
  policy, 
  policyType, // 'oneOnOne' or 'webinar'
  lastUpdated, 
  title: customTitle,
  showTitle = true,
  condensed = false 
}) => {
  const { t } = useTranslation(['coachprofile', 'common']);

  if (!policy || (!policy.tiers?.length && !policy.rescheduling && !policy.minimumNoticeHoursClientCancellation && !policy.additionalNotes)) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-sm text-slate-700 dark:text-slate-300">
        <Info className="h-5 w-5 flex-shrink-0 text-slate-500" />
        {t('coachprofile:policyNotSet')}
      </div>
    );
  }

  const { tiers = [], minimumNoticeHoursClientCancellation, additionalNotes, rescheduling } = policy;
  const sortedTiers = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);

  const Section = ({ title, icon: Icon, children }) => (
    <div className="space-y-3">
      {title && (
        <h4 className="flex items-center text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Icon className="mr-2 h-4 w-4" />
          {title}
        </h4>
      )}
      {children}
    </div>
  );

  const PolicyContent = () => (
    <div className={`space-y-6 ${condensed ? 'text-sm' : ''}`}>
      {sortedTiers.length > 0 && (
        <Section title={t('coachprofile:refundPolicy')} icon={Percent}>
          <ul className="space-y-2.5">
            {sortedTiers.map((tier, index) => (
              <li key={index} className="flex items-start">
                <div className="mt-1 flex-shrink-0 h-5 flex items-center">
                  <span className="block h-1.5 w-1.5 rounded-full bg-primary/70"></span>
                </div>
                <p className="ml-3 text-slate-700 dark:text-slate-300">
                  {t('coachprofile:refundTierDescription', {
                    percentage: tier.refundPercentage,
                    hours: tier.hoursBefore,
                  })}
                </p>
              </li>
            ))}
            <li className="flex items-start">
              <div className="mt-1 flex-shrink-0 h-5 flex items-center">
                <span className="block h-1.5 w-1.5 rounded-full bg-primary/70"></span>
              </div>
              <p className="ml-3 text-slate-700 dark:text-slate-300">
                {t('coachprofile:noRefundTierDescription', {
                  hours: sortedTiers[sortedTiers.length - 1]?.hoursBefore || 0,
                })}
              </p>
            </li>
          </ul>
        </Section>
      )}

      {policyType === 'oneOnOne' && rescheduling?.allowClientInitiatedRescheduleHoursBefore !== undefined && (
        <Section title={t('coachprofile:reschedulingPolicy')} icon={RefreshCw}>
          <div className="flex items-start">
            <div className="mt-1 flex-shrink-0 h-5 flex items-center">
              <span className="block h-1.5 w-1.5 rounded-full bg-primary/70"></span>
            </div>
            <p className="ml-3 text-slate-700 dark:text-slate-300">
              {t('coachprofile:reschedulingAllowedBefore', { hours: rescheduling.allowClientInitiatedRescheduleHoursBefore })}
            </p>
          </div>
        </Section>
      )}

      {additionalNotes && (
        <Section title={t('coachprofile:additionalNotes')} icon={FileText}>
          <p className="whitespace-pre-line text-slate-600 dark:text-slate-400 text-sm">{additionalNotes}</p>
        </Section>
      )}

      {minimumNoticeHoursClientCancellation > 0 && (
        <div className="flex items-start rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mr-2.5 mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="text-xs sm:text-sm">
            {t('coachprofile:selfCancellationNotice', { hours: minimumNoticeHoursClientCancellation })}
          </p>
        </div>
      )}
    </div>
  );

  if (condensed) {
    return <PolicyContent />;
  }

  const policyTitleText = customTitle || t(`coachprofile:policyTypes.${policyType}`);
  const PolicyIcon = policyType === 'oneOnOne' ? CalendarDays : Users;

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full">
      <CardHeader>
        {showTitle && (
          <CardTitle className="flex items-center text-xl font-semibold text-slate-900 dark:text-slate-100">
            <PolicyIcon className="mr-3 h-5 w-5 text-primary" />
            {policyTitleText}
          </CardTitle>
        )}
      </CardHeader>
      <CardContent>
        <PolicyContent />
      </CardContent>
    </Card>
  );
};

export default PolicyDisplay;