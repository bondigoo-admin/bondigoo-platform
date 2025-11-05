import React from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../ui/skeleton.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import { Plus, Minus, Info, Equal, Coins, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Renders a single row in the earnings breakdown.
 * @param {object} props - The component props.
 * @param {React.ElementType} props.icon - The icon component to display.
 * @param {string} props.label - The label for the breakdown item.
 * @param {string} props.value - The formatted currency value.
 * @param {string} [props.tooltipText] - Optional text for an info tooltip.
 * @param {boolean} [props.isFinal=false] - If true, applies styles for the final total row.
 * @param {boolean} [props.isEarlyBird=false] - If true, applies styles for early bird pricing.
 */
const BreakdownRow = ({ icon: Icon, label, value, tooltipText, isFinal = false, isEarlyBird = false }) => {
  return (
    <div className={cn(
      "flex items-center justify-between py-1.5",
      isFinal ? "text-base" : "text-sm"
    )}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={cn(
          "h-4 w-4 flex-shrink-0",
          isFinal && !isEarlyBird && "text-primary",
          isEarlyBird && "text-teal-500"
        )} />
        <span className={cn(
          "truncate",
          isEarlyBird && "text-teal-700 dark:text-teal-300"
        )}>
          {label}
        </span>
        {tooltipText && (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="More info">
                  <Info className="h-3.5 w-3.5 cursor-help opacity-70 hover:opacity-100" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs p-2 text-xs">
                <p>{tooltipText}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <span className={cn(
        "font-medium text-foreground",
        isFinal && "text-lg font-bold",
        !isEarlyBird && isFinal && "text-primary dark:text-primary-light",
        isEarlyBird && "font-semibold text-teal-600 dark:text-teal-400",
        isEarlyBird && isFinal && "!text-lg !font-bold !text-teal-500 dark:!text-teal-300"
      )}>
        {value}
      </span>
    </div>
  );
};

const EarningsBreakdown = ({ data, isLoading, currencySymbols }) => {
  const { t } = useTranslation(['payments', 'managesessions']);

  const formatCurrency = (amount, currency) => {
    if (typeof amount !== 'number') return '';
    const symbol = currencySymbols?.[currency] || currency || '$';
    return `${symbol}${amount.toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-1/4" />
        </div>
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/5" />
        </div>
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-2/4" />
          <Skeleton className="h-4 w-1/5" />
        </div>
        <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/50">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-6 w-1/4" />
        </div>
      </div>
    );
  }

  // A valid breakdown requires at least the clientPays amount.
  if (!data || typeof data.clientPays !== 'number') {
    return null;
  }
  
  const hasEarlyBird = data.earlyBird && typeof data.earlyBird.clientPays === 'number' && data.earlyBird.clientPays > 0;

  return (
    <div className="w-full space-y-4">
      {/* Standard Pricing Breakdown */}
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
          <Coins className="h-4 w-4 text-muted-foreground" />
          {t('payments:earningsBreakdown', 'Earnings Breakdown')}
        </h4>
        <div className="space-y-1">
          <BreakdownRow
            icon={Plus}
            label={t('payments:clientPays')}
            value={formatCurrency(data.clientPays, data.currency)}
          />
          <BreakdownRow
            icon={Minus}
            label={t('payments:vatHandledByPlatform')}
            value={formatCurrency(data.vat.amount, data.currency)}
            tooltipText={t('payments:vatTooltip')}
          />
          <BreakdownRow
            icon={Minus}
            label={t('payments:platformFeeWithPercent', { percentage: data.platformFee.percentage })}
            value={formatCurrency(data.platformFee.amount, data.currency)}
          />
          <BreakdownRow
            icon={Minus}
            label={t('payments:stripeFeeEstimate')}
            value={formatCurrency(data.estimatedStripeFee, data.currency)}
            tooltipText={t('payments:stripeFeeTooltip')}
          />
        </div>
        <div className="border-t border-border/50 pt-2 mt-2">
          <BreakdownRow
            icon={Equal}
            label={t('payments:youEarn', 'You Earn')}
            value={formatCurrency(data.coachReceives, data.currency)}
            isFinal={true}
          />
        </div>
      </div>

      {/* Early Bird Scenario Breakdown (conditionally rendered) */}
      {hasEarlyBird && (
        <div className="border-t border-dashed border-border pt-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-teal-600 dark:text-teal-400 mb-2">
            <Sparkles className="h-4 w-4" />
            {t('payments:earlyBirdScenario', 'Early Bird Scenario')}
          </h4>
          <div className="space-y-1">
            <BreakdownRow
              icon={Plus}
              label={t('payments:clientPays')}
              value={formatCurrency(data.earlyBird.clientPays, data.currency)}
              isEarlyBird={true}
            />
            <BreakdownRow
              icon={Minus}
              label={t('payments:vatHandledByPlatform')}
              value={formatCurrency(data.earlyBird.vat.amount, data.currency)}
              isEarlyBird={true}
            />
            <BreakdownRow
              icon={Minus}
              label={t('payments:platformFeeWithPercent', { percentage: data.earlyBird.platformFee.percentage })}
              value={formatCurrency(data.earlyBird.platformFee.amount, data.currency)}
              isEarlyBird={true}
            />
             {typeof data.earlyBird.estimatedStripeFee === 'number' && (
                <BreakdownRow
                  icon={Minus}
                  label={t('payments:stripeFeeEstimate')}
                  value={formatCurrency(data.earlyBird.estimatedStripeFee, data.currency)}
                  isEarlyBird={true}
                />
             )}
          </div>
          <div className="border-t border-teal-500/20 pt-2 mt-2">
            <BreakdownRow
              icon={Equal}
              label={t('payments:youEarn', 'You Earn')}
              value={formatCurrency(data.earlyBird.coachReceives, data.currency)}
              isFinal={true}
              isEarlyBird={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EarningsBreakdown;