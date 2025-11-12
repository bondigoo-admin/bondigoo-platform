const Payment = require('../models/Payment');
const { logger } = require('../utils/logger');
const mongoose = require('mongoose');
const settlementAdviceService = require('../services/settlementAdviceService');
const Invoice = require('../models/Invoice');
const cloudinary = require('../utils/cloudinaryConfig');

exports.getDashboardStats = async (req, res) => {
    try {
        const coachObjectId = new mongoose.Types.ObjectId(req.user._id);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const pipeline = [
            { 
                $match: { 
                    recipient: coachObjectId, 
                    status: { $in: ['completed', 'succeeded', 'refunded', 'partially_refunded'] } 
                } 
            },
            {
              $lookup: {
                from: 'transactions',
                let: { paymentId: '$_id' },
                pipeline: [
                  { $match: { $expr: { $and: [ { $eq: ['$payment', '$$paymentId'] }, { $eq: ['$type', 'fee'] } ] } } }
                ],
                as: 'feeTransaction'
              }
            },
            {
                $addFields: {
                    gross_val: { $ifNull: ['$amount.total', 0] },
                    refunded_val: { $ifNull: ['$amount.refunded', 0] },
                    fee_val: { $ifNull: ['$amount.platformFee', 0] },
                    vat_val: { $ifNull: ['$amount.vat.amount', 0] },
                    stripe_fee_val: { $ifNull: [{ $first: '$feeTransaction.amount.value' }, 0] }
                }
            },
             {
                $project: {
                    createdAt: 1,
                    effectiveGross: { $subtract: ['$gross_val', '$refunded_val'] },
                    effectiveNet: {
                         $subtract: [
                            { $subtract: ['$gross_val', '$refunded_val'] },
                            { $add: ['$fee_val', '$vat_val', '$stripe_fee_val'] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    allTimeGross: { $sum: '$effectiveGross' },
                    allTimeNet: { $sum: '$effectiveNet' },
                    last30DaysGross: {
                        $sum: { $cond: [{ $gte: ['$createdAt', thirtyDaysAgo] }, '$effectiveGross', 0] }
                    },
                    last30DaysNet: {
                        $sum: { $cond: [{ $gte: ['$createdAt', thirtyDaysAgo] }, '$effectiveNet', 0] }
                    }
                }
            }
        ];
        
        const stats = await Payment.aggregate(pipeline);
        const result = stats[0] || { allTimeGross: 0, allTimeNet: 0, last30DaysGross: 0, last30DaysNet: 0 };
        
        res.json(result);
    } catch (error) {
        logger.error('[earningsController] CRITICAL Error fetching dashboard stats', { error: error.message, stack: error.stack });
        res.status(500).send('Server Error');
    }
};

exports.getTransactions = async (req, res) => {
    try {
        const coachId = new mongoose.Types.ObjectId(req.user._id);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const matchStage = { recipient: coachId, status: { $in: ['completed', 'succeeded', 'refunded', 'partially_refunded', 'disputed'] } };
        
        const totalDocs = await Payment.countDocuments(matchStage);

const pipeline = [
            { $match: matchStage },
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
                $lookup: {
                    from: 'transactions',
                    let: { paymentId: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ['$payment', '$$paymentId'] }, { $eq: ['$type', 'fee'] }] } } }
                    ],
                    as: 'feeTransaction'
                }
            },
            { $lookup: { from: 'users', localField: 'payer', foreignField: '_id', as: 'payerDoc' } },
            { $unwind: { path: '$payerDoc', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'bookings', localField: 'booking', foreignField: '_id', as: 'bookingDoc' } },
            { $unwind: { path: '$bookingDoc', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'programs', localField: 'program', foreignField: '_id', as: 'programDoc' } },
            { $unwind: { path: '$programDoc', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'invoices',
                    let: { paymentId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$payment', '$$paymentId'] },
                                        { $eq: ['$invoiceParty', 'coach_to_platform'] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'b2bDocuments'
                }
            },
            {
                $addFields: {
                    b2bDocument: { $first: '$b2bDocuments' }
                }
            },
            {
                $addFields: {
                    "calculated": {
                        gross: { $ifNull: ['$amount.total', 0] },
                        platformFee: { $ifNull: ['$amount.platformFee', 0] },
                        vatWithheld: { $ifNull: ['$amount.vat.amount', 0] },
                        processingFee: { $ifNull: [{ $first: '$feeTransaction.amount.value' }, 0] },
                        refundedAmount: { $ifNull: ['$amount.refunded', 0] },
                        coachB2bVat: { $ifNull: ['$b2bDocument.vatAmount', 0] },
                        rates: {
                            platformFee: { $ifNull: ['$priceSnapshot.platformFee.percentage', 0] },
                            vatWithheld: { $ifNull: ['$priceSnapshot.vat.rate', 0] },
                            processingFee: {
                                $cond: {
                                    if: { $gt: [{ $ifNull: ['$amount.total', 0] }, 0] },
                                    then: {
                                        $round: [
                                            {
                                                $multiply: [
                                                    {
                                                        $divide: [
                                                            { $ifNull: [{ $first: '$feeTransaction.amount.value' }, 0] },
                                                            { $ifNull: ['$amount.total', 0] }
                                                        ]
                                                    },
                                                    100
                                                ]
                                            },
                                            2
                                        ]
                                    },
                                    else: 0
                                }
                            }
                        },
                        totalDeductions: {
                            $add: [
                                { $ifNull: ['$amount.platformFee', 0] },
                                { $ifNull: ['$amount.vat.amount', 0] },
                                { $ifNull: [{ $first: '$feeTransaction.amount.value' }, 0] }
                            ]
                        },
                        netEarning: {
                            $max: [
                                0,
                                {
                                    $subtract: [
                                        { $subtract: [ { $ifNull: ['$amount.total', 0] }, { $ifNull: ['$amount.refunded', 0] } ] },
                                        {
                                            $add: [
                                                { $ifNull: ['$amount.platformFee', 0] },
                                                { $ifNull: ['$amount.vat.amount', 0] },
                                                { $ifNull: [{ $first: '$feeTransaction.amount.value' }, 0] }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                        finalPayout: {
                            $let: {
                                vars: {
                                    netEarning: {
                                        $max: [
                                            0,
                                            {
                                                $subtract: [
                                                    { $subtract: [ { $ifNull: ['$amount.total', 0] }, { $ifNull: ['$amount.refunded', 0] } ] },
                                                    {
                                                        $add: [
                                                            { $ifNull: ['$amount.platformFee', 0] },
                                                            { $ifNull: ['$amount.vat.amount', 0] },
                                                            { $ifNull: [{ $first: '$feeTransaction.amount.value' }, 0] }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    },
                                    coachVat: { $ifNull: ['$b2bDocument.vatAmount', 0] }
                                },
                                in: '$$netEarning'
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    createdAt: 1,
                    status: 1,
                    priceSnapshot: 1,
                    amount: 1,
                    b2bDocument: 1,
                    calculated: 1,
                    payer: {
                        _id: '$payerDoc._id',
                        firstName: '$payerDoc.firstName',
                        lastName: '$payerDoc.lastName',
                    },
                    booking: {
                        _id: '$bookingDoc._id',
                        title: '$bookingDoc.title',
                    },
                    program: {
                        _id: '$programDoc._id',
                        title: '$programDoc.title',
                    }
                }
            }
        ];

        const transactions = await Payment.aggregate(pipeline);
        

        res.json({
            docs: transactions,
            totalDocs,
            limit,
            page,
            totalPages: Math.ceil(totalDocs / limit),
        });
    } catch (error) {
        logger.error('[earningsController] Error fetching transactions', { error: error.message, stack: error.stack });
        res.status(500).send('Server Error');
    }
};

exports.downloadTransactionStatement = async (req, res) => {
    const logContext = { paymentId: req.params.paymentId, coachId: req.user._id };
    
    try {
        logger.info('[earningsController] Request to generate statement PDF received.', { ...logContext });

        const payment = await Payment.findOne({ _id: req.params.paymentId, recipient: req.user._id })
            .populate('recipient', 'firstName lastName email preferredLanguage')
            .populate('booking', 'title')
            .populate('program', 'title');

        if (!payment) {
            logger.warn('[earningsController] Payment not found or access denied for statement generation.', logContext);
            return res.status(404).json({ message: 'Transaction statement data not found.' });
        }
        
        const lang = payment.recipient.preferredLanguage || 'de';
        const { pdfBuffer, filename } = await settlementAdviceService.generatePdf(payment, lang);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        res.send(pdfBuffer);
        
    } catch (error) {
        logger.error('[earningsController] CRITICAL: Failed to generate statement PDF.', { ...logContext, error: error.message, stack: error.stack });
        if (!res.headersSent) {
            if (error.message.includes('not found')) {
                 return res.status(404).json({ message: 'Transaction statement data not found.' });
            }
            res.status(500).send('Server Error: Could not generate your statement.');
        }
    }
};

exports.getB2bDocumentUrl = async (req, res) => {
    const { invoiceId } = req.params;
    const coachId = req.user._id;
    const logContext = { invoiceId, coachId };

    try {
        const b2bDocument = await Invoice.findOne({
            _id: invoiceId,
            senderUser: coachId,
            invoiceParty: 'coach_to_platform'
        }).lean();

        if (!b2bDocument) {
            logger.warn('[earningsController] B2B document not found or access denied.', logContext);
            return res.status(404).json({ message: 'Document not found or access denied.' });
        }

        const publicId = `b2b_documents/b2b_doc_${invoiceId}`;
        
        const signedUrl = cloudinary.url(publicId, {
            resource_type: 'raw',
            type: 'private',
            sign_url: true,
            expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiration
        });

        res.json({ pdfUrl: signedUrl });

    } catch (error) {
        logger.error('[earningsController] Error fetching B2B document URL.', { ...logContext, error: error.message });
        res.status(500).send('Server Error');
    }
};

exports.getAdjustments = async (req, res) => {
    try {
        const coachId = new mongoose.Types.ObjectId(req.user._id);
        const adjustments = await Payment.aggregate([
            {
                $match: {
                    recipient: coachId,
                    type: 'adjustment',
                    status: 'pending_deduction'
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $lookup: {
                    from: 'payments',
                    let: { originalPaymentIdStr: '$metadata.originalPaymentId' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$_id', { $toObjectId: '$$originalPaymentIdStr' }] } } },
                        {
                            $lookup: {
                                from: 'bookings',
                                localField: 'booking',
                                foreignField: 'id',
                                as: 'bookingInfo'
                            }
                        },
                        { $unwind: { path: '$bookingInfo', preserveNullAndEmptyArrays: true } },
                        { $project: { _id: 1, createdAt: 1, 'bookingInfo.title': 1, 'bookingInfo.start': 1 } }
                    ],
                    as: 'originalPaymentInfo'
                }
            },
            { $unwind: { path: '$originalPaymentInfo', preserveNullAndEmptyArrays: true } }
        ]);
        res.json(adjustments);
    } catch (error) {
        logger.error('[earningsController] Error fetching adjustments', { error: error.message, stack: error.stack });
        res.status(500).send('Server Error');
    }
};

module.exports = exports;