const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { logger } = require('../utils/logger');

class TaxService {
    constructor() {
        logger.info('[TaxService] Initialized for dynamic tax calculation.');
    }

     async calculateTaxForTransaction({ totalAmount, currency, customerLocation, vatNumber = null }) {
        logger.debug('[TaxService] Received deconstruction request', { totalAmount, currency, customerLocation, vatNumber });
        
        if (totalAmount == null || typeof totalAmount !== 'number' || isNaN(totalAmount)) {
            logger.error('[TaxService] Calculation failed: a valid totalAmount must be provided.');
            throw new Error('A valid total amount must be provided for tax calculation.');
        }

        try {
            if (!customerLocation || !customerLocation.country) {
                logger.warn('[TaxService] Customer country not provided. Falling back to default Swiss VAT deconstruction.');
                const swissVatRateDecimal = 0.081;
                const netAmount = totalAmount / (1 + swissVatRateDecimal);
                const taxAmount = totalAmount - netAmount;

                return {
                    netAmount: parseFloat(netAmount.toFixed(2)),
                    taxAmount: parseFloat(taxAmount.toFixed(2)),
                    taxRate: swissVatRateDecimal * 100,
                    totalAmount: parseFloat(totalAmount.toFixed(2)),
                    isCustomerExempt: false,
                    source: 'fallback_ch_vat'
                };
            }

            const calculation = await stripe.tax.calculations.create({
                currency: currency.toLowerCase(),
                line_items: [{
                    amount: Math.round(totalAmount * 100),
                    reference: 'digital-service-item', 
                    tax_behavior: 'inclusive',
                    tax_code: 'txcd_20030000',
                }],
                customer_details: {
                    address: {
                        country: customerLocation.country,
                        postal_code: customerLocation.postalCode,
                    },
                    address_source: 'billing',
                    ip_address: customerLocation.ipAddress,
                    tax_ids: vatNumber ? [{ type: 'eu_vat', value: vatNumber }] : [],
                }
            });

             const taxDetails = calculation.tax_breakdown[0];

            const totalAmountInCents = calculation.amount_total;
            const taxAmountInCents = calculation.tax_amount_inclusive;
            const netAmountInCents = totalAmountInCents - taxAmountInCents;

            return {
                netAmount: parseFloat((netAmountInCents / 100).toFixed(2)),
                taxAmount: parseFloat((taxAmountInCents / 100).toFixed(2)),
                taxRate: taxDetails?.taxability_reason === 'customer_exempt' ? 0 : parseFloat(taxDetails.tax_rate_details.percentage_decimal),
                totalAmount: parseFloat((totalAmountInCents / 100).toFixed(2)),
                isCustomerExempt: taxDetails?.taxability_reason === 'customer_exempt',
                source: 'stripe_tax'
            };

        } catch (error) {
            logger.error('[TaxService] Stripe Tax calculation failed. Falling back to zero tax.', { error: error.message, totalAmount, customerLocation });
            return { 
                netAmount: parseFloat(totalAmount.toFixed(2)), 
                taxAmount: 0, 
                taxRate: 0, 
                totalAmount: parseFloat(totalAmount.toFixed(2)), 
                isCustomerExempt: false, 
                source: 'fallback_error' 
            };
        }
    }

    getVatRate() {
        logger.warn('[TaxService.getVatRate] This method is deprecated. Use calculateTaxForTransaction for dynamic rates.');
        return 0.081;
    }
}

module.exports = TaxService;