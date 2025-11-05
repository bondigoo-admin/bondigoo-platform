const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const invoiceSchema = new mongoose.Schema({
  payment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Payment', 
    required: true, 
    index: true 
  },
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    index: true 
  },
  recipientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  stripeInvoiceId: { 
    type: String, 
    index: true 
  },
  stripeHostedUrl: { 
    type: String 
  },
  pdfUrl: { 
    type: String 
  },
  invoiceNumber: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    index: true, 
    enum: ['draft', 'open', 'paid', 'void', 'uncollectible'],
    required: true
  },
  amountPaid: { 
    type: Number, 
    required: true 
  },
  netAmount: {
    type: Number,
  },
  vatAmount: {
    type: Number,
  },
  currency: { 
    type: String, 
    required: true 
  },
  invoiceParty: {
  type: String,
  enum: ['platform_to_client', 'coach_to_platform'],
  required: true
  },
  type: { 
    type: String, 
    enum: ['invoice', 'credit_note'], 
    default: 'invoice', 
    required: true 
  },
  originalInvoice: { // Link a credit note back to its original invoice
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Invoice',
    default: null 
  },
  reason: { type: String }
}, { timestamps: true });

invoiceSchema.post('save', function(doc) {
  logger.info('[InvoiceModel] Invoice record saved successfully', { 
    invoiceId: doc._id,
    paymentId: doc.payment, 
    stripeInvoiceId: doc.stripeInvoiceId 
  });
});

module.exports = mongoose.model('Invoice', invoiceSchema);