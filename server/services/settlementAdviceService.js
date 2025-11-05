const PDFDocument = require('pdfkit');
const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const { logger } = require('../utils/logger');
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
    ns: ['coach_dashboard', 'common', 'payments'], 
    defaultNS: 'coach_dashboard'
  });

class SettlementAdviceService {
    _generateStatementDescription(paymentRecord, t) {
        if (paymentRecord.liveSession) return t('earnings.clientPaymentForLiveSession', 'Client Payment for Live Session');
        if (paymentRecord.program?.title) return t('earnings.clientPaymentForProgram', 'Client Payment for Program: {{title}}', { title: paymentRecord.program.title });
        if (paymentRecord.booking?.title) return t('earnings.clientPaymentForSession', 'Client Payment for Session: {{title}}', { title: paymentRecord.booking.title });
        return t('earnings.clientPaymentForService', 'Client Payment for Coaching Service');
    }
    
    _generateHeader(doc, t) {
        doc.font('Helvetica-Bold').fontSize(20).text(t('earnings.earningStatementTitle', 'Abrechnung'), { align: 'right' });
        doc.moveDown(1.5);
    }
    
    _generatePartyDetails(doc, payment, t) {
        const coach = payment.recipient;
        const client = payment.payer;
        
        doc.font('Helvetica-Bold').fontSize(9).text(t('earnings.coach', 'Coach').toUpperCase(), 50, doc.y);
        doc.font('Helvetica').fontSize(10)
           .text(`${coach.firstName} ${coach.lastName}`)
           .text(coach.email);
        
        doc.font('Helvetica-Bold').fontSize(9).text(t('client', 'Client').toUpperCase(), 350, doc.y - 42);
        doc.font('Helvetica').fontSize(10)
           .text(`${client.firstName} ${client.lastName}`, 350)
           .text(client.email, 350);
        
        doc.moveDown(2);
    }

   _generateMetaInfo(doc, payment, t) {
        const locale = t('common:dateFormatLocale', { ns: 'common', defaultValue: 'en-US' });
        const issueDate = new Date(payment.createdAt).toLocaleDateString(locale);
        const serviceDate = new Date(payment.liveSession?.startTime || payment.booking?.start || payment.program?.createdAt || payment.createdAt).toLocaleDateString(locale);

        doc.font('Helvetica').fontSize(10)
           .text(`${t('earnings.statementFor', 'Auszug für')}: ${payment._id.toString()}`, { align: 'right' })
           .text(`${t('earnings.dateOfIssue', 'Date of Issue')}: ${issueDate}`, { align: 'right' })
           .text(`${t('earnings.dateOfService', 'Date of Service')}: ${serviceDate}`, { align: 'right' });

        doc.moveDown(2);
    }

    async generatePdf(payment, lang) {
        const logContext = { paymentId: payment._id, coachId: payment.recipient._id, lang };
        logger.info('[SettlementAdviceService] Generating enriched earning statement PDF.', logContext);
        
        await i18next.loadLanguages(lang);
        const t = i18next.getFixedT(lang, ['coach_dashboard', 'common', 'payments']);
        
        await payment.populate([
            { path: 'recipient', select: 'firstName lastName email' },
            { path: 'payer', select: 'firstName lastName email' },
            { path: 'booking', select: 'title start' },
            { path: 'program', select: 'title createdAt' }
        ]);

        if (!payment.priceSnapshot) {
            logger.error('[SettlementAdviceService] Payment record is missing Price Snapshot.', logContext);
            throw new Error('Transaction statement data not found.');
        }
        
        const feeTransaction = await Transaction.findOne({ payment: payment._id, type: 'fee' });

        const { priceSnapshot } = payment;
        const currency = priceSnapshot.currency.toUpperCase();
        
        const grossAmount = priceSnapshot.final.amount.amount;
        const platformFee = priceSnapshot.platformFee?.amount || 0;
        const platformFeePercent = priceSnapshot.platformFee?.percentage;
        const vatWithheld = priceSnapshot.vat?.amount || 0;
        const vatRate = priceSnapshot.vat?.rate;
        const processingFee = feeTransaction?.amount.value || 0;
        const netEarning = grossAmount - platformFee - vatWithheld - processingFee;

        const finalFilename = `${t('earnings.statement', 'Statement')}-${payment._id.toString().slice(-8)}.pdf`;
        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        const brandColor = '#1F2937';
        const lightGrey = '#6B7280';
        const regularFont = 'Helvetica';
        const boldFont = 'Helvetica-Bold';
        const pageMargins = { top: 50, bottom: 50, left: 50, right: 50 };

        this._generateHeader(doc, t);
        this._generatePartyDetails(doc, payment, t);
        this._generateMetaInfo(doc, payment, t);

        const tableTop = doc.y;
        doc.font(boldFont).fillColor(lightGrey).fontSize(10)
           .text(t('earnings.description', 'Description').toUpperCase(), pageMargins.left, tableTop, { width: 380 })
           .text(t('earnings.amount', 'Amount').toUpperCase(), 0, tableTop, { align: 'right' });

        doc.moveTo(pageMargins.left, doc.y + 5).lineTo(doc.page.width - pageMargins.right, doc.y + 5).strokeColor('#E5E7EB').stroke();
        doc.moveDown(1.5);

        doc.font(regularFont).fillColor(brandColor).fontSize(10).text(this._generateStatementDescription(payment, t), pageMargins.left, doc.y, { width: 380 });
        doc.font(boldFont).text(`${grossAmount.toFixed(2)} ${currency}`, 0, doc.y - 12, { align: 'right' });
        doc.moveDown(1.5);
        
        const platformFeeText = platformFeePercent 
            ? t('payments:platformFeeWithPercent', { ns: 'payments', defaultValue: 'Platform Fee ({{percentage}}%)', percentage: platformFeePercent })
            : t('earnings.platformFee', 'Platform Fee');
        doc.font(regularFont).text(platformFeeText, pageMargins.left, doc.y, { width: 380 });
        doc.text(`-${platformFee.toFixed(2)}`, 0, doc.y - 12, { align: 'right' });
        doc.moveDown(1.2);
        
        const vatWithheldText = vatRate
            ? `${t('earnings.vatWithheld', 'VAT Withheld')} (${vatRate}%)`
            : t('earnings.vatWithheld', 'VAT Withheld');
        doc.font(regularFont).text(vatWithheldText, pageMargins.left, doc.y, { width: 380 });
        doc.text(`-${vatWithheld.toFixed(2)}`, 0, doc.y - 12, { align: 'right' });
        doc.moveDown(1.2);

        if (processingFee > 0) {
            doc.font(regularFont).text(t('earnings.paymentProcessingFee', 'Payment Processing Fee'), pageMargins.left, doc.y, { width: 380 });
            doc.text(`-${processingFee.toFixed(2)}`, 0, doc.y - 12, { align: 'right' });
            doc.moveDown(1.5);
        }
        
        doc.moveTo(350, doc.y).lineTo(doc.page.width - pageMargins.right, doc.y).strokeColor('#E5E7EB').stroke();
        doc.moveDown(1);
        
        const totalY = doc.y;
        doc.font(boldFont).fontSize(14).text(`${t('earnings.payout', 'Payout')}:`, 350, totalY, { width: 100, align: 'left' });
        doc.text(`${netEarning.toFixed(2)} ${currency}`, 0, totalY, { align: 'right' });
        doc.moveDown(3);

        const disclaimerText = t('earnings.settlementAdviceDisclaimer', 'This document is a settlement advice for your records. It is not a tax invoice. A formal, tax-compliant B2B self-billed invoice will be generated and made available to you upon the successful completion of the payout for this transaction.');
        doc.font(regularFont).fontSize(8).fillColor(lightGrey).text(
            disclaimerText,
            pageMargins.left,
            doc.page.height - pageMargins.bottom - 40,
            { align: 'center', width: doc.page.width - (pageMargins.left + pageMargins.right) }
        );

        doc.end();

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        
        return new Promise((resolve) => {
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(buffers);
                logger.info('[SettlementAdviceService] Earning statement PDF buffer created successfully.', logContext);
                resolve({ pdfBuffer, filename: finalFilename });
            });
        });
    }
}

module.exports = new SettlementAdviceService();