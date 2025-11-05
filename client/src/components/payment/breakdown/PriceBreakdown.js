
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card.tsx';
import { useTranslation } from 'react-i18next';

const PriceBreakdown = ({
  priceData,
  showVAT = true,
  expandable = true,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { t } = useTranslation(['payments']);

  const formatAmount = (amount, currency) => {
    return new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: currency || 'CHF'
    }).format(amount);
  };

  const baseAmount = React.useMemo(() => {
    return typeof priceData.base === 'object' 
      ? priceData.base.amount 
      : priceData.base;
  }, [priceData.base]);

  const vatAmount = React.useMemo(() => {
    if (!priceData.vat) return 0;
    return typeof priceData.vat.amount === 'object'
      ? priceData.vat.amount.amount
      : priceData.vat.amount;
  }, [priceData.vat]);

  return (
    <Card className={className}>
      <CardHeader 
        className={`flex flex-row items-center justify-between cursor-pointer
                   ${expandable ? 'hover:bg-muted/50' : ''}`}
        onClick={() => expandable && setIsExpanded(!isExpanded)}
      >
        <CardTitle className="text-lg font-semibold">
          {formatAmount(priceData.final, priceData.currency)}
        </CardTitle>
        {expandable && (
          <button className="p-1 hover:bg-muted rounded-full">
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        )}
      </CardHeader>

      <AnimatePresence>
        {(isExpanded || !expandable) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="space-y-3">
              {/* Base Price */}
              <div className="flex justify-between text-sm">
                <span>{t('payments:basePrice')}</span>
                <span>{formatAmount(baseAmount, priceData.currency)}</span>
              </div>

              {/* Platform Fee */}
              {priceData.platformFee && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    {t('payments:platformFee')}
                    <Info size={14} className="text-muted-foreground/70" />
                  </span>
                  <span>
                    {formatAmount(priceData.platformFee.amount, priceData.currency)}
                    {priceData.platformFee.percentage && 
                      ` (${priceData.platformFee.percentage}%)`}
                  </span>
                </div>
              )}

              {/* Discounts */}
              {priceData.discounts?.map((discount, index) => (
                <div key={index} className="flex justify-between text-sm text-green-600">
                  <span>{discount.description}</span>
                  <span>-{formatAmount(discount.amount, priceData.currency)}</span>
                </div>
              ))}

              {/* VAT */}
              {showVAT && priceData.vat && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{t('payments:vat', { rate: priceData.vat.rate })}%</span>
                  <span>{formatAmount(vatAmount, priceData.currency)}</span>
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between text-base font-medium pt-2 border-t">
                <span>{t('payments:total')}</span>
                <span>{formatAmount(priceData.final, priceData.currency)}</span>
              </div>

              {/* VAT Notice */}
              {showVAT && priceData.vat?.included && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  {t('payments:vatIncluded')}
                </p>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};

export default PriceBreakdown;