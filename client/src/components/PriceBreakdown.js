import React from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, ChevronDown, ChevronUp, Tag } from 'lucide-react'; // Added Tag for discounts
import { useTranslation } from 'react-i18next';

// A simple Card-like structure for styling. Replace with your actual UI components if available.
const CardContainer = ({ children, className }) => (
  <div className={`add-edit-session-price-card ${className}`}>
    {children}
  </div>
);
const CardHeaderContainer = ({ children, onClick, className }) => (
  <div className={`add-edit-session-price-card-header ${className}`} onClick={onClick}>
    {children}
  </div>
);
const CardTitleText = ({ children }) => (
  <h4 className="add-edit-session-price-card-title">{children}</h4>
);
const CardContentContainer = ({ children, className }) => (
  <div className={`add-edit-session-price-card-content ${className}`}>
    {children}
  </div>
);


const PriceBreakdown = ({
  priceData,
  showVAT = true,
  expandable = true,
  initiallyExpanded = false, // New prop
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = React.useState(initiallyExpanded);
  const { t } = useTranslation(['payments', 'managesessions']); // Added managesessions for consistency

  const formatAmount = (amount, currency) => {
    if (amount == null || isNaN(Number(amount))) return t('managesessions:notApplicable'); // Handle null or invalid amounts
    return new Intl.NumberFormat('de-CH', { // Example locale
      style: 'currency',
      currency: currency || 'USD', // Default currency
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  };

  const baseAmount = React.useMemo(() => {
    return typeof priceData.base === 'object' && priceData.base.amount != null
      ? priceData.base.amount
      : priceData.base != null ? priceData.base : 0;
  }, [priceData.base]);

  const finalAmount = React.useMemo(() => {
    return typeof priceData.final === 'object' && priceData.final.amount != null
      ? priceData.final.amount
      : priceData.final != null ? priceData.final : baseAmount; // Fallback to base if final is not distinct
  }, [priceData.final, baseAmount]);

  const platformFeeAmount = React.useMemo(() => {
    if (!priceData.platformFee || priceData.platformFee.amount == null) return 0;
    return typeof priceData.platformFee.amount === 'object'
      ? priceData.platformFee.amount.amount
      : priceData.platformFee.amount;
  }, [priceData.platformFee]);

  const vatAmount = React.useMemo(() => {
    if (!priceData.vat || priceData.vat.amount == null) return 0;
    return typeof priceData.vat.amount === 'object'
      ? priceData.vat.amount.amount
      : priceData.vat.amount;
  }, [priceData.vat]);

  const earlyBirdPrice = priceData.earlyBirdPrice;
  const earlyBirdActive = priceData.earlyBirdDeadline && new Date(priceData.earlyBirdDeadline) > new Date();


  return (
    <CardContainer className={`add-edit-session-price-breakdown ${className}`}>
      <CardHeaderContainer
        className={`add-edit-session-price-header ${expandable ? 'add-edit-session-price-expandable' : ''}`}
        onClick={expandable ? () => setIsExpanded(!isExpanded) : undefined}
      >
        <CardTitleText>
          {earlyBirdActive && earlyBirdPrice != null ? (
            <>
              <span className="add-edit-session-price-strikethrough">{formatAmount(finalAmount, priceData.currency)}</span>
              {' '}
              {formatAmount(earlyBirdPrice, priceData.currency)}
              <span className="add-edit-session-early-bird-badge">{t('managesessions:earlyBird')}</span>
            </>
          ) : (
            formatAmount(finalAmount, priceData.currency)
          )}
        </CardTitleText>
        {expandable && (
          <button type="button" className="add-edit-session-price-chevron-button" aria-expanded={isExpanded}>
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </CardHeaderContainer>

      <AnimatePresence>
        {(isExpanded || !expandable) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="add-edit-session-price-motion-content"
          >
            <CardContentContainer className="add-edit-session-price-details-content">
              <div className="add-edit-session-price-row">
                <span>{t('payments:basePrice')}</span>
                <span>{formatAmount(baseAmount, priceData.currency)}</span>
              </div>

              {priceData.platformFee && platformFeeAmount > 0 && (
                <div className="add-edit-session-price-row add-edit-session-price-muted">
                  <span className="add-edit-session-price-info-label">
                    {t('payments:platformFee')}
                    {priceData.platformFee.percentage && ` (${priceData.platformFee.percentage}%)`}
                    <Info size={14} className="add-edit-session-price-info-icon" />
                  </span>
                  <span>+ {formatAmount(platformFeeAmount, priceData.currency)}</span>
                </div>
              )}

              {priceData.discounts?.map((discount, index) => (
                <div key={index} className="add-edit-session-price-row add-edit-session-price-discount">
                  <span className="add-edit-session-price-info-label">
                    <Tag size={14} className="add-edit-session-price-tag-icon" />
                    {discount.description || t('payments:discountApplied')}
                  </span>
                  <span>- {formatAmount(discount.amount, priceData.currency)}</span>
                </div>
              ))}
              
              {earlyBirdActive && earlyBirdPrice != null && (
                 <div className="add-edit-session-price-row add-edit-session-price-discount">
                    <span>{t('managesessions:earlyBirdDiscount')}</span>
                    <span>- {formatAmount(baseAmount - earlyBirdPrice, priceData.currency)}</span>
                </div>
              )}


              {showVAT && priceData.vat && vatAmount > 0 && (
                <div className="add-edit-session-price-row add-edit-session-price-muted">
                  <span>{t('payments:vat', { rate: priceData.vat.rate })}%</span>
                  <span>+ {formatAmount(vatAmount, priceData.currency)}</span>
                </div>
              )}

              <div className="add-edit-session-price-row add-edit-session-price-total">
                <span>{t('payments:total')}</span>
                <span>
                 {earlyBirdActive && earlyBirdPrice != null 
                    ? formatAmount(earlyBirdPrice, priceData.currency)
                    : formatAmount(finalAmount, priceData.currency)}
                </span>
              </div>

              {showVAT && priceData.vat?.included && (
                <p className="add-edit-session-price-vat-notice">
                  {t('payments:vatIncluded')}
                </p>
              )}
            </CardContentContainer>
          </motion.div>
        )}
      </AnimatePresence>
    </CardContainer>
  );
};

PriceBreakdown.propTypes = {
  priceData: PropTypes.shape({
    base: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
    final: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
    currency: PropTypes.string,
    platformFee: PropTypes.shape({
      amount: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
      percentage: PropTypes.number,
    }),
    discounts: PropTypes.arrayOf(PropTypes.shape({
      description: PropTypes.string,
      amount: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
    })),
    vat: PropTypes.shape({
      amount: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
      rate: PropTypes.number,
      included: PropTypes.bool,
    }),
    earlyBirdPrice: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    earlyBirdDeadline: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
  }).isRequired,
  showVAT: PropTypes.bool,
  expandable: PropTypes.bool,
  initiallyExpanded: PropTypes.bool,
  className: PropTypes.string,
};

export default PriceBreakdown;