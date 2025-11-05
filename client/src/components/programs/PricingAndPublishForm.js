import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '../ui/label.tsx';
import { Input } from '../ui/input.tsx';
import { Switch } from '../ui/switch.tsx';
import { Button } from '../ui/button.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog.tsx';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import { useQuery } from 'react-query';
import { getPricingRates } from '../../services/priceAPI';
import { cn } from '../../lib/utils';

// Radix SelectItem styled to match ShadCN/UI
const StyledSelectItem = React.forwardRef(({ children, className, ...props }, ref) => (
  <Select.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <Select.ItemText>{children}</Select.ItemText>
  </Select.Item>
));
StyledSelectItem.displayName = 'StyledSelectItem';


const PricingAndPublishForm = ({
  price: initialPrice,
  status,
  isDiscussionEnabled,
  onPriceChange,
  onStatusChange,
  onDiscussionEnabledChange,
}) => {
  const { t } = useTranslation(['programs', 'common', 'payments']);

  const [showPublishConfirm, setShowPublishConfirm] = React.useState(false);
  const [isPricingDetailsExpanded, setIsPricingDetailsExpanded] = React.useState(false);
  
  const [price, setPrice] = React.useState(initialPrice?.amount ?? 0);
  const [currency, setCurrency] = React.useState(initialPrice?.currency ?? 'CHF');
  const [isPriceFocused, setIsPriceFocused] = React.useState(false);

  const { data: ratesData, isLoading: isLoadingPrice } = useQuery(
    'pricingRates',
    getPricingRates,
    { staleTime: Infinity }
  );

  const currencySymbols = {
    USD: '$',
    EUR: '€',
    CHF: 'CHF',
    GBP: '£',
  };

  const handleStatusToggle = (isPublished) => {
    if (isPublished) {
      setShowPublishConfirm(true);
    } else {
      onStatusChange('draft');
    }
  };

  const handlePublishConfirm = () => {
    onStatusChange('published');
    setShowPublishConfirm(false);
  };

  const handlePriceChange = (value) => {
    const numValue = value === '' ? 0 : parseFloat(value);
    setPrice(numValue);
    onPriceChange('amount', numValue);
  };

  const handleCurrencyChange = (value) => {
    setCurrency(value);
    onPriceChange('currency', value);
  };

  const currencySymbol = currencySymbols[currency];
  const coachVatRatePercent = ratesData?.vatRatePercent ?? 0;
  const coachPlatformFeePercent = ratesData?.platformFeePercent ?? 0;

  // --- Price Calculations ---
  const listPrice = price || 0;
  
  // Payment processing fee constants
  const stripeFeePercent = 3.25;
  const stripeFixedFees = { CHF: 0.30, EUR: 0.25, USD: 0.30, GBP: 0.20 };
  const stripeFeeFixed = stripeFixedFees[currency] || 0.30;

  const priceBeforeVat = listPrice / (1 + (coachVatRatePercent / 100));
  const vatAmount = listPrice - priceBeforeVat;
  
  const platformFeeAmount = priceBeforeVat * (coachPlatformFeePercent / 100);
  // Stripe fee is calculated on the total amount charged to the customer
  const stripeFeeAmount = listPrice > 0 ? (listPrice * (stripeFeePercent / 100)) + stripeFeeFixed : 0;
  
  // Final amount the coach receives
  const coachReceives = priceBeforeVat - platformFeeAmount - stripeFeeAmount;
  // --- End Price Calculations ---
  
  return (
    <div className="flex flex-col gap-6">
      {/* Price Section */}
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 md:p-5">
        <Label htmlFor="price">{t('field_price_label')}</Label>
        <div className="flex items-center gap-2">
          <Select.Root value={currency} onValueChange={handleCurrencyChange}>
            <Select.Trigger 
              className="flex h-10 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" 
              aria-label={t('managesessions:currency')}
            >
              <Select.Value asChild>
                <span>{currencySymbol}</span>
              </Select.Value>
              <Select.Icon>
                <ChevronDown size={16} className="text-muted-foreground" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="relative z-50 min-w-[5rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
                <Select.Viewport className="p-1">
                  {Object.keys(currencySymbols).map((curr) => (
                    <StyledSelectItem key={curr} value={curr}>
                      {curr}
                    </StyledSelectItem>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
          <Input
            id="price"
            type="number"
            value={isPriceFocused && price === 0 ? '' : price}
            onChange={(e) => handlePriceChange(e.target.value)}
            onFocus={() => setIsPriceFocused(true)}
            onBlur={() => setIsPriceFocused(false)}
            placeholder="0.00"
            step="0.01"
            min="0"
            className="flex-1"
          />
        </div>
        <p className="text-sm text-muted-foreground">{t('price_desc')}</p>
      </div>
    
    {/* Earning Breakdown Section */}
    {price > 0 && (
      <div className="rounded-lg border bg-card p-4 md:p-5">
        <div
          className="flex w-full cursor-pointer items-center justify-between"
          onClick={() => setIsPricingDetailsExpanded(!isPricingDetailsExpanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setIsPricingDetailsExpanded(!isPricingDetailsExpanded)}
          aria-expanded={isPricingDetailsExpanded}
        >
          <h4 className="text-base font-semibold text-card-foreground">{t('pricing_details_title')}</h4>
          <Button variant="ghost" size="icon" className="-mr-2 h-7 w-7">
            {isPricingDetailsExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </Button>
        </div>
        {isPricingDetailsExpanded && (
          <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
            {isLoadingPrice ? (
              <p className="text-sm text-muted-foreground">{t('payments:loadingPrice')}</p>
            ) : (
             <TooltipProvider>
                {/* --- Customer Pays Section --- */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between">
                        <h5 className="font-semibold text-foreground">{t('payments:customerPays', 'Customer Pays')}</h5>
                        <span className="font-semibold text-foreground">
                            {currencySymbol}{listPrice.toFixed(2)}
                        </span>
                    </div>
                </div>

                <div className="border-b border-border"></div>

                {/* --- Your Earnings Section --- */}
                <div className="flex flex-col gap-2">
                    <h5 className="font-semibold text-foreground">{t('payments:earningBreakdown', 'Earning Breakdown')}</h5>

                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t('payments:listPrice', 'List Price')}</span>
                        <span className="font-medium text-foreground">
                            {currencySymbol}{listPrice.toFixed(2)}
                        </span>
                    </div>

                    {coachVatRatePercent > 0 && (
                        <div className="flex items-center justify-between text-sm">
                            <Tooltip>
                                <TooltipTrigger asChild><span className="flex items-center gap-2 text-muted-foreground">- {t('payments:vat')} ({coachVatRatePercent}%) <Info size={14} /></span></TooltipTrigger>
                                <TooltipContent><p>{t('payments:tooltipVat')}</p></TooltipContent>
                            </Tooltip>
                            <span className="font-medium text-muted-foreground">-{currencySymbol}{vatAmount.toFixed(2)}</span>
                        </div>
                    )}

                    <div className="flex items-center justify-between text-sm">
                        <Tooltip>
                            <TooltipTrigger asChild><span className="flex items-center gap-2 text-muted-foreground">- {t('payments:platformFee')} ({coachPlatformFeePercent}%) <Info size={14} /></span></TooltipTrigger>
                            <TooltipContent><p>{t('payments:tooltipPlatformFee')}</p></TooltipContent>
                        </Tooltip>
                        <span className="font-medium text-muted-foreground">-{currencySymbol}{platformFeeAmount.toFixed(2)}</span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="flex items-center gap-2 text-muted-foreground">
                                    - {t('payments:paymentProcessingFee', 'Payment Fee')} ({stripeFeePercent}% + {currencySymbol}{stripeFeeFixed.toFixed(2)}) <Info size={14} />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent><p>{t('payments:tooltipPaymentProcessingFee', 'Covers transaction costs from our payment provider (Stripe).')}</p></TooltipContent>
                        </Tooltip>
                        <span className="font-medium text-muted-foreground">
                            -{currencySymbol}{stripeFeeAmount.toFixed(2)}
                        </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t border-dashed pt-2">
                        <span className="font-semibold text-foreground">{t('payments:youReceive', 'You Receive')}</span>
                        <span className="text-lg font-bold text-primary">
                            {currencySymbol}{Math.max(0, coachReceives).toFixed(2)}
                        </span>
                    </div>
                </div>
             </TooltipProvider>
            )}
          </div>
        )}
      </div>
    )}

    {/* Q&A Section */}
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between">
          <Label htmlFor="discussion-switch" className="flex-1 pr-4">{t('enable_lesson_qa_label')}</Label>
          <Switch
              id="discussion-switch"
              checked={isDiscussionEnabled}
              onCheckedChange={onDiscussionEnabledChange}
          />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
          {t('enable_lesson_qa_desc')}
      </p>
    </div>

    {/* Publish Section */}
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 md:p-5">
        <div className="flex items-center justify-between">
            <Label htmlFor="status" className="flex-1 pr-4">{t('field_status_label')}</Label>
            <Switch
                id="status"
                checked={status === 'published'}
                onCheckedChange={handleStatusToggle}
            />
        </div>
        <p className="text-sm text-muted-foreground">
          {status === 'draft' ? t('status_draft_desc') : t('status_published_desc')}
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <Label className="text-base">{t('current_status_label')}</Label>
            <span className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium',
                status === 'published' 
                  ? 'border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300' 
                  : 'border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
            )}>
                <span className={cn(
                  'h-2 w-2 rounded-full',
                  status === 'published' ? 'bg-green-500' : 'bg-gray-500'
                )} />
                {status === 'published' ? t('status_published') : t('status_draft')}
            </span>
        </div>
    </div>

    <AlertDialog open={showPublishConfirm} onOpenChange={setShowPublishConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('publish_confirm_title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('publish_confirm_desc')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handlePublishConfirm}>{t('publish_button')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </div>
  );
};

export default PricingAndPublishForm;