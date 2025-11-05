import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Info, Tag, Loader2, Plus, Minus, Equal } from 'lucide-react';

import { calculateWebinarPrice } from '../services/priceAPI';
import { logger } from '../utils/logger';
import { cn } from '../lib/utils';

import { Card, CardContent } from './ui/card.tsx';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Skeleton } from './ui/skeleton.jsx';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible.jsx';

const getDiscountDisplayName = (discount, t) => {
  if (!discount) return '';
  if (discount.source === 'manual_code') {
    return t('bookings:discountCodeApplied', { code: discount.code });
  }
  return discount.name || t('bookings:promoApplied', 'Promotion Applied');
};

const BreakdownRow = ({ icon: Icon, label, value, isFinal = false, isDiscount = false }) => (
  <div className={cn("flex items-center justify-between py-1.5 text-sm", isFinal && "border-t pt-2 mt-2")}>
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className={cn("h-4 w-4 flex-shrink-0", isDiscount && "text-green-600 dark:text-green-500")} />
      <span>{label}</span>
    </div>
    <span className={cn("font-semibold text-foreground", isFinal && "text-base", isDiscount && "text-green-600 dark:text-green-500")}>
      {value}
    </span>
  </div>
);

const WebinarPricingInterface = ({ booking, onBook }) => {
  const { t } = useTranslation(['bookings', 'common', 'payments']);
  const queryClient = useQueryClient();
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);

  const queryKey = ['webinarPrice', booking._id];

  const { data: priceDetails, isLoading: isPriceLoading, isError } = useQuery(
    queryKey,
    () => calculateWebinarPrice(booking._id),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      onError: (error) => {
        logger.error('[WebinarPricingInterface] Initial price fetch failed', { bookingId: booking._id, error });
        toast.error(t('bookings:errors.priceCalculationError'));
      },
    }
  );

  const { mutate: applyDiscount, isLoading: isApplyingDiscount, error: discountError } = useMutation(
    (code) => calculateWebinarPrice(booking._id, code),
    {
      onSuccess: (data) => {
        const winningDiscount = data?._calculationDetails?.winningDiscount;
        if (winningDiscount && winningDiscount.source === 'manual_code') {
          toast.success(t('bookings:discountAppliedSuccessfully'));
        } else if (winningDiscount && winningDiscount.source === 'automatic_rule') {
          toast.info(t('bookings:betterDealKept', { dealName: getDiscountDisplayName(winningDiscount, t) }));
        } else {
          toast.error(t('bookings:errors.codeNotApplicable'));
        }
        queryClient.setQueryData(queryKey, data);
        setDiscountCodeInput(''); // Clear input on successful application
      },
      onError: (error) => {
        const message = error.response?.data?.message || t('bookings:errors.invalidOrExpiredCode');
        toast.error(message);
        logger.error('[WebinarPricingInterface] Discount application failed', { bookingId: booking._id, error });
      },
    }
  );

  const appliedDiscount = useMemo(() => priceDetails?._calculationDetails?.winningDiscount || null, [priceDetails]);
  const isCodeApplied = appliedDiscount?.source === 'manual_code';

  const handleApplyDiscount = useCallback(() => {
    if (!discountCodeInput.trim()) return;
    applyDiscount(discountCodeInput.trim());
  }, [discountCodeInput, applyDiscount]);
  
  const handleBook = useCallback(() => {
    onBook(appliedDiscount?.code || null);
  }, [onBook, appliedDiscount]);
  
  const isLoading = isPriceLoading || isApplyingDiscount;

  return (
    <Card className="bg-muted/30 dark:bg-muted/20">
      <CardContent className="p-4 space-y-4">
        {isPriceLoading && !priceDetails ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <div className="text-sm text-destructive text-center p-4">{t('bookings:errors.priceCalculationError')}</div>
        ) : priceDetails && (
          <>
            <Collapsible open={showBreakdown} onOpenChange={setShowBreakdown}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                  <span>{t('bookings:price')}</span>
                </div>
                <div className="flex items-center">
                  <AnimatePresence>
                    {isLoading && (
                      <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="overflow-hidden">
                        <Loader2 className="h-4 w-4 animate-spin mr-2 text-primary" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-base">
                      {appliedDiscount && (
                        <span className="font-semibold text-muted-foreground line-through mr-2">
                          {priceDetails.base?.amount?.amount?.toFixed(2)}
                        </span>
                      )}
                      <span className="font-semibold text-lg">
                        {priceDetails.final?.amount?.amount?.toFixed(2)} {priceDetails.currency}
                      </span>
                      <Info size={14} className="ml-2 text-muted-foreground" />
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>
              
              <CollapsibleContent className="space-y-3 pt-3 border-t mt-3">
                <div className="space-y-1.5 text-sm">
                  <BreakdownRow icon={Plus} label={t('bookings:listPrice')} value={`${priceDetails.base?.amount?.amount?.toFixed(2)} ${priceDetails.currency}`} />
                  
                  {appliedDiscount && (
                    <BreakdownRow 
                      icon={Minus} 
                      label={getDiscountDisplayName(appliedDiscount, t)} 
                      value={`- ${appliedDiscount.amountDeducted?.toFixed(2)} ${priceDetails.currency}`}
                      isDiscount={true}
                    />
                  )}
                  
                  <BreakdownRow 
                    icon={Plus} 
                    label={`${t('payments:vatIncluded')} (${Number(priceDetails.vat?.rate).toFixed(1)}%)`} 
                    value={`${priceDetails.vat?.amount?.toFixed(2)} ${priceDetails.currency}`} 
                  />
                  
                  <BreakdownRow 
                    icon={Equal} 
                    label={t('bookings:total')} 
                    value={`${priceDetails.final?.amount?.amount?.toFixed(2)} ${priceDetails.currency}`} 
                    isFinal={true}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
            
            <div className="pt-4 border-t space-y-2">
              <div className="flex gap-2">
                <Input 
                  type="text" 
                  placeholder={t('bookings:discountCodePlaceholder')}
                  className="uppercase font-mono"
                  value={discountCodeInput}
                  onChange={(e) => setDiscountCodeInput(e.target.value.toUpperCase())}
                  disabled={isApplyingDiscount || isCodeApplied}
                />
                <Button 
                  onClick={handleApplyDiscount} 
                  variant="secondary"
                  disabled={isApplyingDiscount || !discountCodeInput || isCodeApplied}
                >
                  {isApplyingDiscount ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common:apply')}
                </Button>
              </div>
              {discountError && <p className="text-xs text-destructive px-1">{discountError.response?.data?.message || t('bookings:errors.invalidOrExpiredCode')}</p>}
            </div>
          </>
        )}

        <Button onClick={handleBook} disabled={isLoading || isError} className="w-full">
          {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CreditCard className="mr-2 h-5 w-5" />}
          <span className="text-base font-medium">{t('bookings:bookWebinarButton')}</span>
        </Button>
      </CardContent>
    </Card>
  );
};

export default WebinarPricingInterface;