const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { logger } = require('../utils/logger');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment'); 
const User = require('../models/User');

class InvoiceService {

  async createAndFinalizeForPayment(paymentRecord) {
    const diagnosticLogContext = {
      entryPoint: '[InvoiceService.createAndFinalizeForPayment]',
      timestamp: new Date().toISOString(),
      paymentId: paymentRecord?._id?.toString(),
      programId: paymentRecord?.program?._id?.toString(),
      bookingId: paymentRecord?.booking?._id?.toString(),
    };
    
    try {
    } catch (e) {
        logger.error(`${diagnosticLogContext.entryPoint} 2. FAILED TO STRINGIFY received 'paymentRecord' argument. This might indicate circular references.`, { ...diagnosticLogContext, error: e.message });
    }
    
    const logContext = {
      paymentId: paymentRecord._id,
      bookingId: paymentRecord.booking?._id,
      programId: paymentRecord.program?._id,
    };
    console.log('[InvoiceService] Starting detailed invoice creation.', logContext);

    const existingInvoice = await Invoice.findOne({ payment: paymentRecord._id });
    if (existingInvoice) {
      console.log(`[InvoiceService] Invoice already exists for payment ${paymentRecord._id}. Skipping creation.`, { stripeInvoiceId: existingInvoice.stripeInvoiceId });
      return existingInvoice;
    }

    const { priceSnapshot, payer, _id: paymentId } = paymentRecord;
    const customer = paymentRecord.payer;

    if (!priceSnapshot || !priceSnapshot.base?.amount?.amount) {
      throw new Error(`Payment record ${paymentId} is missing the required priceSnapshot or base amount for invoice generation.`);
    }
    if (!customer) {
        throw new Error(`Payer (User) details are missing for payment ${paymentId}.`);
    }
    
    let stripeCustomerId = customer.stripe?.customerId;
    if (!stripeCustomerId) {
      logger.warn(`[InvoiceService] User ${customer._id} is missing a Stripe Customer ID. Creating one now.`);
      const stripeCustomer = await stripe.customers.create({
        email: customer.email,
        name: `${customer.firstName} ${customer.lastName}`,
        preferred_locales: [customer.settings?.language || 'en'],
        address: {
          country: customer.taxInfo?.billingAddress?.country,
          postal_code: customer.taxInfo?.billingAddress?.postalCode,
        },
      });
      stripeCustomerId = stripeCustomer.id;
      await User.findByIdAndUpdate(customer._id, { 'stripe.customerId': stripeCustomerId });
    } else {
      await stripe.customers.update(stripeCustomerId, {
        preferred_locales: [customer.settings?.language || 'de'],
      });
    }

    const currency = priceSnapshot.currency.toLowerCase();
    let taxRate;
    if (priceSnapshot.vat && typeof priceSnapshot.vat.rate === 'number' && priceSnapshot.vat.rate > 0) {
        taxRate = await this.getOrCreateTaxRate(priceSnapshot.vat);
    }
    
    const paymentDate = new Date();
    let footerText;
    if (customer.settings?.language === 'de') {
      const formattedDate = paymentDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      footerText = `RECHNUNG BEZAHLT am ${formattedDate}`;
    } else {
      const formattedDate = paymentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      footerText = `INVOICE PAID on ${formattedDate}`;
    }
    
    const draftInvoice = await stripe.invoices.create({
        customer: stripeCustomerId,
        description: `Invoice for ${this._generateDescription(paymentRecord)}`,
        collection_method: 'send_invoice',
        days_until_due: 0,
        auto_advance: false,
        default_tax_rates: taxRate ? [taxRate.id] : [],
        footer: footerText,
    });

    const baseAmountInCents = Math.round(priceSnapshot.base.amount.amount * 100);

    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: draftInvoice.id,
      amount: baseAmountInCents,
      currency: currency,
      description: this._generateDescription(paymentRecord),
    });

    if (priceSnapshot.discounts && priceSnapshot.discounts.length > 0) {
        const discount = priceSnapshot.discounts[0];
        if (discount && discount.amountDeducted > 0) {
            const discountAmountInCents = Math.round(discount.amountDeducted * 100) * -1;
            await stripe.invoiceItems.create({
                customer: stripeCustomerId,
                invoice: draftInvoice.id,
                amount: discountAmountInCents,
                currency: currency,
                description: `Discount (${discount.code || 'Promotion'})`,
            });
        }
    }

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(draftInvoice.id);

    const paidInvoice = await stripe.invoices.pay(finalizedInvoice.id, {
        paid_out_of_band: true,
    });

    const newInvoice = new Invoice({
      payment: paymentId,
      user: payer._id, 
      recipientUser: payer._id,
      invoiceParty: 'platform_to_client',
      type: 'invoice',
      stripeInvoiceId: paidInvoice.id,
      stripeHostedUrl: paidInvoice.hosted_invoice_url,
      pdfUrl: paidInvoice.invoice_pdf,
      invoiceNumber: paidInvoice.number,
      status: paidInvoice.status,
      amountPaid: paidInvoice.total / 100,
      currency: paidInvoice.currency.toUpperCase(),
    });
    
    await newInvoice.save();

    paymentRecord.invoice = newInvoice._id;
    await paymentRecord.save();

    console.log(`[InvoiceService] Successfully created and stored detailed invoice reference for payment ${paymentId}.`, { invoiceId: newInvoice._id, stripeInvoiceId: newInvoice.stripeInvoiceId, amount: newInvoice.amountPaid });
    
    return newInvoice;
  }

  async getOrCreateTaxRate(vatDetails) {
    let rateValue = vatDetails?.rate;
    if (typeof rateValue === 'string') {
        rateValue = parseFloat(rateValue);
    }

    if (!vatDetails || typeof rateValue !== 'number') {
        const defaultRate = 8.1;
        logger.warn(`[InvoiceService] Invalid or missing VAT details, creating default tax rate of ${defaultRate}%.`, { vatDetails });
        vatDetails = { rate: defaultRate, included: true };
        rateValue = defaultRate;
    }
    const percentage = parseFloat(rateValue.toFixed(4));
    const inclusive = vatDetails.included !== false;

    const taxRates = await stripe.taxRates.list({ active: true, limit: 100 });
    const existingRate = taxRates.data.find(rate => 
      Math.abs(rate.percentage - percentage) < 0.001 && rate.inclusive === inclusive
    );

    if (existingRate) return existingRate;

    console.log(`[InvoiceService] Creating new tax rate for VAT ${percentage}% (inclusive: ${inclusive}).`);
    return stripe.taxRates.create({
      display_name: 'VAT',
      percentage: percentage,
      inclusive: inclusive,
      description: `VAT ${percentage}%`,
      country: 'CH',
    });
  }

_generateDescription(paymentRecord) {
    if (paymentRecord.liveSession) {
      const date = new Date(paymentRecord.liveSession.startTime).toLocaleDateString();
      return `Live Coaching Session on ${date}`;
    }
    if (paymentRecord.program && paymentRecord.program.title) {
        return `Program Enrollment: ${paymentRecord.program.title}`;
    }
    if (paymentRecord.booking && paymentRecord.booking.sessionType) {
        const sessionTypeName = paymentRecord.booking.sessionType.name || 'Session';
        const coachName = `${paymentRecord.booking.coach?.firstName || ''} ${paymentRecord.booking.coach?.lastName || ''}`.trim();
        const date = new Date(paymentRecord.booking.start).toLocaleDateString();
        return `${sessionTypeName} with ${coachName || 'Coach'} on ${date}`;
    }
    return 'Coaching Platform Service';
  }

async generateStripeCreditNoteForRefund(paymentRecord, stripeRefund, refundAmountDecimal, reason, session) {
    const logContext = { paymentId: paymentRecord._id, stripeRefundId: stripeRefund.id };
    console.log('[InvoiceService] Starting Stripe Credit Note generation.', logContext);

    const originalInvoice = await Invoice.findOne({ payment: paymentRecord._id, type: 'invoice', invoiceParty: 'platform_to_client' }).session(session);
    if (!originalInvoice || !originalInvoice.stripeInvoiceId) {
      logger.error(`CRITICAL: Cannot create credit note. Original platform_to_client invoice for payment ${paymentRecord._id} not found in DB.`, logContext);
      return; 
    }
    logContext.stripeInvoiceId = originalInvoice.stripeInvoiceId;

    try {
      // STEP 1: Fetch the full Stripe Invoice object to get its line items and total.
      const stripeInvoice = await stripe.invoices.retrieve(originalInvoice.stripeInvoiceId, {
        expand: ['lines'], // Ensure line items are always expanded
      });
      const originalTotalCents = stripeInvoice.total;

      if (originalTotalCents === 0) {
        logger.warn(`[InvoiceService] Original invoice total is 0. Skipping credit note generation.`, logContext);
        return;
      }

      // STEP 2: Calculate the refund proportion. This is key for partial refunds.
      const refundAmountCents = Math.round(refundAmountDecimal * 100);
      const refundProportion = refundAmountCents / originalTotalCents;
      console.log(`[InvoiceService] Calculated refund proportion.`, { ...logContext, originalTotalCents, refundAmountCents, refundProportion });

      // STEP 3: Build the 'lines' array for the credit note by applying the proportion to each original invoice line.
      let calculatedCreditTotalCents = 0;
      const creditNoteLines = stripeInvoice.lines.data.map(lineItem => {
        // We credit a portion of the amount of each line item.
        const creditAmountForLine = Math.round(lineItem.amount * refundProportion);
        calculatedCreditTotalCents += creditAmountForLine;
        
        return {
          type: 'invoice_line_item', 
          invoice_line_item: lineItem.id,
          amount: creditAmountForLine,
        };
      });
      
      // STEP 4: Handle potential rounding discrepancies. Adjust the largest line item to ensure the total matches exactly.
      const roundingDifference = refundAmountCents - calculatedCreditTotalCents;
      if (roundingDifference !== 0 && creditNoteLines.length > 0) {
        logger.warn(`[InvoiceService] Adjusting for rounding difference of ${roundingDifference} cents.`, logContext);
        // Find the line item with the largest absolute amount to absorb the difference
        let targetLine = creditNoteLines.reduce((prev, current) => 
            (Math.abs(prev.amount) > Math.abs(current.amount)) ? prev : current
        );
        targetLine.amount += roundingDifference;
      }
      
      const sanitizedMemo = reason ? String(reason).substring(0, 500) : 'Refund processed.';
      
      const creditNoteParams = {
        invoice: originalInvoice.stripeInvoiceId,
        memo: sanitizedMemo,
        reason: 'product_unsatisfactory', // A standard reason, our memo has the detail
        refund: stripeRefund.id,
        lines: creditNoteLines, // Use the new 'lines' array
      };

      console.log('[InvoiceService] Creating Stripe credit note with line-item based parameters.', logContext);
      const creditNote = await stripe.creditNotes.create(creditNoteParams);

      console.log(`Stripe Credit Note ${creditNote.id} created successfully.`, logContext);

      const creditNoteRecord = new Invoice({
        user: paymentRecord.payer,
        recipientUser: paymentRecord.payer,
        payment: paymentRecord._id,
        invoiceParty: 'platform_to_client',
        type: 'credit_note',
        originalInvoice: originalInvoice._id,
        reason: reason,
        stripeInvoiceId: creditNote.id,
        stripeHostedUrl: creditNote.pdf,
        pdfUrl: creditNote.pdf,
        invoiceNumber: creditNote.number,
        status: 'paid',
        amountPaid: -Math.abs(creditNote.amount / 100),
        currency: creditNote.currency.toUpperCase(),
      });

      await creditNoteRecord.save({ session });
      console.log(`Credit Note record saved to local DB.`, { ...logContext, creditNoteId: creditNoteRecord._id });
      
      return creditNoteRecord;

    } catch (stripeError) {
      logger.error(`[InvoiceService] CRITICAL: Failed to create Stripe Credit Note. Manual intervention required.`, { ...logContext, error: stripeError.message, code: stripeError.code });
      // It's important to not throw here to allow the rest of the refund flow to complete.
      // The core refund to the customer has already succeeded. This is an accounting document failure.
    }
  }
}

module.exports = new InvoiceService();