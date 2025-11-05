const Invoice = require('../models/Invoice');
const Coach = require('../models/Coach');
const Transaction = require('../models/Transaction');
const { logger } = require('../utils/logger');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const i18next = require('i18next');
const FsBackend = require('i18next-fs-backend');

i18next
  .use(FsBackend)
  .init({
    backend: {
      loadPath: path.resolve(__dirname, '../../src/locales/{{lng}}/{{ns}}.json'),
    },
    fallbackLng: 'en',
    ns: ['coach_dashboard', 'common'],
    defaultNS: 'coach_dashboard'
  });

const PLATFORM_USER_ID = process.env.PLATFORM_USER_ID;

class CoachInvoiceService {
_generateB2BDescription(paymentRecord, t, documentType, reason) {
    const defaultTitle = paymentRecord.liveSession ? `Live Session on ${new Date(paymentRecord.liveSession.startTime).toLocaleDateString()}` : (paymentRecord.booking?.title || paymentRecord.program?.title || 'Coaching Service');
    if (documentType === 'Invoice') {
      return t('invoices.b2bDescriptionService', 'Coaching Service: {{title}}', { title: defaultTitle });
    }
    return t('invoices.b2bDescriptionCredit', 'Credit Note for: {{reason}}', { reason: reason || defaultTitle });
  }

  async _generateAndUploadB2bPdf(invoiceData, coachProfile, documentType, lang) {
    await i18next.loadLanguages(lang);
    const t = i18next.getFixedT(lang, ['coach_dashboard', 'common']);

    return new Promise(async (resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(buffers);
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder: "b2b_documents", resource_type: "raw", format: "pdf", type: 'private', public_id: `b2b_doc_${invoiceData._id}` },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            uploadStream.end(pdfBuffer);
        });

        const platformUser = invoiceData.recipientUser;
        const coachUser = invoiceData.senderUser;

        const brandColor = '#1F2937';
        const lightGrey = '#6B7280';
        const regularFont = 'Helvetica';
        const boldFont = 'Helvetica-Bold';
        const pageMargins = { top: 50, bottom: 50, left: 50, right: 50 };
        const locale = t('common:dateFormatLocale', { ns: 'common', defaultValue: 'en-US' });
        
        const title = documentType === 'Invoice'
          ? t('invoices.selfBilledTitle', 'Rechnung (Self-Billing)')
          : t('invoices.creditNoteTitle', 'Gutschrift (Self-Billing)');
        doc.font(boldFont).fillColor(brandColor).fontSize(20).text(title, pageMargins.left, pageMargins.top, { align: 'right' });
        doc.moveDown(1);
        
        const issueDate = new Date(invoiceData.createdAt).toLocaleDateString(locale);
        const serviceDate = new Date(invoiceData.payment.liveSession?.startTime || invoiceData.payment.booking?.start || invoiceData.payment.createdAt).toLocaleDateString(locale);

        doc.font(regularFont).fontSize(10).fillColor(brandColor)
           .text(`${t('invoices.invoiceNumber', 'Rechnungsnummer')}: ${invoiceData.invoiceNumber}`, { align: 'right' })
           .text(`${t('invoices.dateOfIssue', 'Ausstellungsdatum')}: ${issueDate}`, { align: 'right' })
           .text(`${t('invoices.dateOfService', 'Leistungsdatum')}: ${serviceDate}`, { align: 'right' })
           .text(`${t('invoices.paymentStatus', 'Zahlungsstatus')}: ${t('invoices.statusPaid', 'Bezahlt')}`, { align: 'right' });
        doc.moveDown(2);

        const detailsTop = doc.y;
        const rightColumnX = 320;

        doc.font(boldFont).fontSize(9).fillColor(lightGrey).text(t('invoices.supplier', 'LIEFERANT').toUpperCase(), pageMargins.left, detailsTop);
        doc.font(regularFont).fontSize(10).fillColor(brandColor)
           .text(`${coachUser.firstName} ${coachUser.lastName}`);
        if (coachUser.billingDetails?.address) {
            const addr = coachUser.billingDetails.address;
            if (addr.street) doc.text(addr.street);
            doc.text(`${addr.postalCode || ''} ${addr.city || ''}`.trim());
            if (addr.country) doc.text(t(`common:countries.${addr.country}`, { ns: 'common', defaultValue: addr.country }));
        }
        
        if (coachProfile.settings.paymentAndBilling.isVatRegistered && coachProfile.settings.paymentAndBilling.vatNumber) {
            doc.moveDown(0.5);
            doc.font(boldFont).text(`${t('invoices.vatNumber', 'VAT Number')}: `, { continued: true })
               .font(regularFont).text(coachProfile.settings.paymentAndBilling.vatNumber);
        }

        doc.font(boldFont).fontSize(9).fillColor(lightGrey).text(t('invoices.billTo', 'RECHNUNG AN').toUpperCase(), rightColumnX, detailsTop);
        doc.font(regularFont).fontSize(10).fillColor(brandColor)
           .text(platformUser.billingDetails?.name || process.env.PLATFORM_LEGAL_NAME, rightColumnX)
           .text(platformUser.billingDetails?.address?.street || process.env.PLATFORM_ADDRESS, rightColumnX);
        if (platformUser.billingDetails?.address) {
           const platAddr = platformUser.billingDetails.address;
           doc.text(`${platAddr.postalCode || ''} ${platAddr.city || ''}`.trim(), rightColumnX);
           if (platAddr.country) doc.text(t(`common:countries.${platAddr.country}`, { ns: 'common', defaultValue: platAddr.country }), rightColumnX);
        }
        if (process.env.PLATFORM_VAT_ID) {
            doc.moveDown(0.5);
            doc.font(boldFont).text(`${t('invoices.vatNumber', 'VAT Number')}: `, rightColumnX, doc.y, { continued: true })
               .font(regularFont).text(process.env.PLATFORM_VAT_ID);
        }

        doc.y = Math.max(doc.y, detailsTop + 90);
        doc.moveDown(3);

        const tableTop = doc.y;
        const alignRight = { align: 'right' };
        const colWidths = {
            description: 210,
            netAmount: 95,
            vatRate: 80,
            vatAmount: 50,
            total: 60,
        };

        const colPositions = {
            description: pageMargins.left,
            netAmount: pageMargins.left + colWidths.description,
            vatRate: pageMargins.left + colWidths.description + colWidths.netAmount,
            vatAmount: pageMargins.left + colWidths.description + colWidths.netAmount + colWidths.vatRate,
            total: pageMargins.left + colWidths.description + colWidths.netAmount + colWidths.vatRate + colWidths.vatAmount,
        };

        doc.font(boldFont).fillColor(brandColor).fontSize(10)
           .text(t('invoices.description', 'BESCHREIBUNG').toUpperCase(), colPositions.description, tableTop, { width: colWidths.description })
           .text(t('invoices.netAmount', 'NETTOBETRAG').toUpperCase(), colPositions.netAmount, tableTop, { width: colWidths.netAmount, ...alignRight })
           .text(t('invoices.vatRate', 'MWST.-SATZ').toUpperCase(), colPositions.vatRate, tableTop, { width: colWidths.vatRate, ...alignRight })
           .text(t('invoices.vat', 'MWST.').toUpperCase(), colPositions.vatAmount, tableTop, { width: colWidths.vatAmount, ...alignRight })
           .text(t('invoices.total', 'GESAMT').toUpperCase(), colPositions.total, tableTop, { width: colWidths.total, ...alignRight });
        // --- END OF LAYOUT FIX ---

        doc.moveTo(pageMargins.left, doc.y + 5).lineTo(doc.page.width - pageMargins.right, doc.y + 5).strokeColor('#E5E7EB').stroke();
        doc.moveDown(1.5);
        
        const itemY = doc.y;
        const coachVatRate = coachProfile.settings.paymentAndBilling.isVatRegistered ? (coachProfile.settings.paymentAndBilling.vatRate || 8.1) : 0;
        const descriptionText = this._generateB2BDescription(invoiceData.payment, t, documentType, invoiceData.reason);

        doc.fillColor(brandColor).font(regularFont).fontSize(10)
           .text(descriptionText, colPositions.description, itemY, { width: colWidths.description })
           .text(Math.abs(invoiceData.netAmount).toFixed(2), colPositions.netAmount, itemY, { width: colWidths.netAmount, ...alignRight })
           .text(`${coachVatRate.toFixed(1)}%`, colPositions.vatRate, itemY, { width: colWidths.vatRate, ...alignRight })
           .text(Math.abs(invoiceData.vatAmount).toFixed(2), colPositions.vatAmount, itemY, { width: colWidths.vatAmount, ...alignRight })
           .font(boldFont)
           .text(Math.abs(invoiceData.amountPaid).toFixed(2), colPositions.total, itemY, { width: colWidths.total, ...alignRight });
        doc.font(regularFont);
        doc.moveDown(1.5);

        doc.moveTo(colPositions.netAmount, doc.y).lineTo(doc.page.width - pageMargins.right, doc.y).strokeColor('#E5E7EB').stroke();
        doc.moveDown(1);
        
        const totalY = doc.y;
        const totalLabelWidth = colPositions.total - colPositions.netAmount - 10;
        doc.font(boldFont).fontSize(12).text(`${t('invoices.total', 'GESAMT')}:`, colPositions.netAmount, totalY, { width: totalLabelWidth, align: 'right' });
        doc.font(boldFont).fontSize(12).text(`${Math.abs(invoiceData.amountPaid).toFixed(2)} ${invoiceData.currency}`, colPositions.total, totalY, { width: colWidths.total, ...alignRight });

        let footerText = t('invoices.selfBillingFooter', 'This is a self-billed invoice issued under a self-billing agreement.');
        if (!coachProfile.settings.paymentAndBilling.isVatRegistered) {
            footerText += `\n${t('invoices.vatExemptionClause', 'No VAT is shown as the service provider is classified as a small business under local tax regulations.')}`;
        }

        doc.fontSize(8).fillColor(lightGrey).text(
            footerText,
            pageMargins.left,
            doc.page.height - pageMargins.bottom - 25,
            { align: 'center', width: doc.page.width - (pageMargins.left + pageMargins.right) }
        );

        doc.end();
    });
  }

  async generateForPayout(paymentRecord, session) {
    const logContext = { paymentId: paymentRecord._id, coachId: paymentRecord.recipient._id };
    console.log('[CoachInvoiceService] Generating B2B self-billed invoice.', logContext);

    const coach = await Coach.findOne({ user: paymentRecord.recipient._id })
      .populate({ 
          path: 'user', 
          populate: { path: 'billingDetails' }
      })
      .session(session);

    if (!coach?.user?.billingDetails?.address?.country) {
      logger.error(`[CoachInvoiceService] Coach ${coach.user._id} is missing billing address in user profile. Cannot generate B2B invoice.`, logContext);
      throw new Error('Coach billing address is not configured.');
    }

    const { priceSnapshot } = paymentRecord;
    const stripeFeeTx = await Transaction.findOne({ payment: paymentRecord._id, type: 'fee' }).session(session);
    const stripeFee = stripeFeeTx?.amount.value || 0;

    // --- START OF FIX ---
    // The previous logic incorrectly added coach's VAT on top of their net earnings,
    // which could inflate the payout amount beyond the original transaction value.
    // The correct approach is to calculate the total payout amount (coach's gross earning)
    // and then, for invoicing purposes, deconstruct that amount into its net and VAT components if applicable.

    // 1. Calculate the final, total amount to be paid out to the coach. This is their gross earning.
    const finalPayoutAmount = priceSnapshot.final.amount.amount - (priceSnapshot.vat?.amount || 0) - priceSnapshot.platformFee.amount - stripeFee;
    console.log('[CoachInvoiceService] Calculated Final Payout Amount (Gross for Coach).', { ...logContext, finalPayoutAmount, finalAmount: priceSnapshot.final.amount.amount, platformVat: (priceSnapshot.vat?.amount || 0), platformFee: priceSnapshot.platformFee.amount, stripeFee });

    let b2bNetPrice;
    let coachVatAmount = 0;

    // 2. For invoicing, deconstruct the final payout amount into net and VAT components if the coach is VAT registered.
    if (coach.settings.paymentAndBilling.isVatRegistered) {
      // The finalPayoutAmount is VAT-inclusive. We must extract the net and VAT from it.
      const coachVatRateDecimal = (coach.settings.paymentAndBilling.vatRate || 8.1) / 100;
      b2bNetPrice = finalPayoutAmount / (1 + coachVatRateDecimal);
      coachVatAmount = finalPayoutAmount - b2bNetPrice;
    } else {
      // If not VAT registered, the entire payout is the net amount.
      b2bNetPrice = finalPayoutAmount;
    }

    // The totalAmount for the B2B invoice is the finalPayoutAmount. This ensures we never pay out more than intended.
    const totalAmount = finalPayoutAmount;
    // --- END OF FIX ---

    const b2bInvoice = new Invoice({
      payment: paymentRecord._id,
      invoiceParty: 'coach_to_platform',
      type: 'invoice',
      senderUser: coach.user._id,
      recipientUser: PLATFORM_USER_ID,
      invoiceNumber: `B2B-${paymentRecord._id.toString().slice(-8).toUpperCase()}`,
      status: 'paid',
      pdfUrl: '',
      stripeHostedUrl: '',
      amountPaid: totalAmount,
      netAmount: b2bNetPrice,
      vatAmount: coachVatAmount,
      currency: paymentRecord.amount.currency,
    });

    await b2bInvoice.save({ session });
    console.log('[CoachInvoiceService] B2B self-billed invoice record created.', { ...logContext, invoiceId: b2bInvoice._id, totalAmount });
    
    try {
      const populatedInvoice = await Invoice.findById(b2bInvoice._id).populate([
          { path: 'senderUser', populate: 'billingDetails' },
          { path: 'recipientUser', populate: { path: 'billingDetails' } },
          { path: 'payment', populate: ['booking', 'program'] }
      ]).session(session);

      const lang = coach.user.preferredLanguage || 'en';
      const uploadResult = await this._generateAndUploadB2bPdf(populatedInvoice, coach, 'Invoice', lang);
      b2bInvoice.pdfUrl = uploadResult.secure_url;
      await b2bInvoice.save({ session });
      console.log('[CoachInvoiceService] B2B Invoice PDF generated and linked.', { ...logContext, invoiceId: b2bInvoice._id });
    } catch (pdfError) {
        logger.error('[CoachInvoiceService] Failed to generate or upload B2B Invoice PDF.', { ...logContext, invoiceId: b2bInvoice._id, error: pdfError.message });
    }
    
    return { b2bNetPrice, coachVatAmount, finalPayoutAmount: totalAmount, invoice: b2bInvoice };
  }

  async generateCreditNoteForRefund(paymentRecord, refundAmountDecimal, reason, session) {

    const logContext = { paymentId: paymentRecord._id };
    console.log('[CoachInvoiceService] Generating B2B self-billed credit note.', logContext);

    const originalB2BInvoice = await Invoice.findOne({ payment: paymentRecord._id, invoiceParty: 'coach_to_platform', type: 'invoice' }).session(session);
    if (!originalB2BInvoice) {
      logger.warn('[CoachInvoiceService] Original B2B invoice not found. Skipping B2B credit note creation.', logContext);
      return;
    }

    const coach = await Coach.findOne({ user: originalB2BInvoice.senderUser })
        .populate({ path: 'user', select: 'preferredLanguage' })
        .session(session);

    if (!coach) {
        logger.error('[CoachInvoiceService] Could not find coach profile for credit note generation.', { ...logContext, coachUserId: originalB2BInvoice.senderUser });
        return;
    }

    const refundPercentage = refundAmountDecimal / paymentRecord.amount.total;
    const creditedAmount = originalB2BInvoice.amountPaid * refundPercentage;
    const creditedNetAmount = (originalB2BInvoice.netAmount || 0) * refundPercentage;
    const creditedVatAmount = (originalB2BInvoice.vatAmount || 0) * refundPercentage;

    const b2bCreditNote = new Invoice({
      payment: paymentRecord._id,
      invoiceParty: 'coach_to_platform',
      type: 'credit_note',
      originalInvoice: originalB2BInvoice._id,
      senderUser: originalB2BInvoice.senderUser,
      recipientUser: originalB2BInvoice.recipientUser,
      reason,
      invoiceNumber: `B2BCN-${paymentRecord._id.toString().slice(-8).toUpperCase()}`,
      status: 'paid',
      pdfUrl: '',
      stripeHostedUrl: '',
      amountPaid: -Math.abs(creditedAmount),
      netAmount: -Math.abs(creditedNetAmount),
      vatAmount: -Math.abs(creditedVatAmount),
      currency: originalB2BInvoice.currency,
    });

    await b2bCreditNote.save({ session });
    console.log('[CoachInvoiceService] B2B self-billed credit note record created.', { ...logContext, creditNoteId: b2bCreditNote._id });

    try {
        const populatedCreditNote = await Invoice.findById(b2bCreditNote._id).populate([
          { path: 'senderUser', populate: 'billingDetails' },
          { path: 'recipientUser', populate: 'billingDetails' },
          { path: 'payment', populate: ['booking', 'program'] }
        ]).session(session);
        
        const lang = coach.user.preferredLanguage || 'en';
        const uploadResult = await this._generateAndUploadB2bPdf(populatedCreditNote, coach, 'Credit Note', lang);
        b2bCreditNote.pdfUrl = uploadResult.secure_url;
        await b2bCreditNote.save({ session });
        console.log('[CoachInvoiceService] B2B Credit Note PDF generated and linked.', { ...logContext, creditNoteId: b2bCreditNote._id });
    } catch (pdfError) {
        logger.error('[CoachInvoiceService] Failed to generate or upload B2B Credit Note PDF.', { ...logContext, creditNoteId: b2bCreditNote._id, error: pdfError.message });
    }

    return b2bCreditNote;
  }
}

module.exports = new CoachInvoiceService();