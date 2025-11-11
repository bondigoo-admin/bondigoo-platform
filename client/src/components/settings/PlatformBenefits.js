import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card.tsx';
import { Badge } from '../ui/badge.tsx';
import { Star } from 'lucide-react';
import { format } from 'date-fns';

const PlatformBenefits = ({ settings }) => {
  const { t } = useTranslation(['settings', 'coachSettings']);
  const override = settings?.platformFeeOverride;

  const isExpired = override?.effectiveUntil && new Date() > new Date(override.effectiveUntil);

  if (!override || isExpired) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('platformBenefits.title', 'Platform Fee Status')}</CardTitle>
          <CardDescription>{t('platformBenefits.standardDesc', 'You are currently on the standard platform fee plan.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">9.9%</p>
        </CardContent>
      </Card>
    );
  }

  const getBenefitTitle = () => {
    if (override.type === 'ZERO_FEE') {
      return t('platformBenefits.zeroFee.title', 'Zero Fee Plan');
    }
    if (override.type === 'PERCENTAGE_DISCOUNT') {
      return t('platformBenefits.discount.title', '{{discount}}% Fee Discount', { discount: override.discountPercentage });
    }
    return t('platformBenefits.title', 'Platform Fee Status');
  };

  const getAppliedRate = () => {
    if (override.type === 'ZERO_FEE') return '0%';
    if (override.type === 'PERCENTAGE_DISCOUNT') {
      const discountedRate = 9.9 * (1 - (override.discountPercentage / 100));
      return `${discountedRate.toFixed(2)}%`;
    }
    return '9.9%';
  };

  return (
    <Card className="border-primary/50 bg-primary/5 dark:bg-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="text-yellow-500 fill-yellow-400" />
          {getBenefitTitle()}
        </CardTitle>
        <CardDescription>{t('platformBenefits.specialRateDesc', 'A special platform fee rate has been applied to your account.')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">{t('platformBenefits.appliedRate', 'Your Applied Rate')}</p>
          <p className="text-2xl font-bold">{getAppliedRate()}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{t('platformBenefits.appliesTo', 'Applies To')}</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {override.appliesTo.map(scope => (
              <Badge key={scope} variant="secondary">{t(`userManagement.feeOverride.scopes.${scope.toLowerCase()}`, scope)}</Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{t('platformBenefits.expires', 'Expires')}</p>
          <p className="font-medium">
            {override.effectiveUntil ? format(new Date(override.effectiveUntil), 'PPP') : t('platformBenefits.indefinite', 'Does not expire')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PlatformBenefits;