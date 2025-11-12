const SupportTicket = require('../models/SupportTicket');
const Booking = require('../models/Booking');
const AdminFinancialService = require('./adminFinancialService');
const unifiedNotificationService = require('./unifiedNotificationService');
const { NotificationTypes } = require('../utils/notificationHelpers');
const { logger } = require('../utils/logger');
const mongoose = require('mongoose');
const User = require('../models/User');

class RefundRequestService {
async createRefundRequest({ client, bookingId, reason, requestedAmount, currency, escalate = false }) {
        const booking = await Booking.findById(bookingId).populate('payment coach user disputeTicket');
        if (!booking || booking.user._id.toString() !== client._id.toString()) throw new Error("Booking not found or access denied.");
        
        let ticket = booking.disputeTicket;

        if (ticket && !['closed', 'resolved_by_coach'].includes(ticket.status)) {
            throw new Error("An active dispute is already open for this booking.");
        }

        const message = { sender: client._id, content: reason, createdAt: new Date() };
        const requestedRefund = { amount: requestedAmount, currency };

        if (ticket) { // Re-opening a closed or coach-resolved ticket
            ticket.messages.push(message);
            ticket.status = escalate ? 'escalated_to_admin' : 'awaiting_coach_response';
            ticket.requestedRefundAmount = requestedRefund; 
            ticket.resolution = undefined; 
        } else { // Creating a new ticket
            ticket = new SupportTicket({
                user: client._id,
                subject: `Refund Request for Booking: ${booking._id}`,
                messages: [message],
                ticketType: 'refund_request',
                booking: booking._id,
                payment: booking.payment.paymentRecord,
                status: escalate ? 'escalated_to_admin' : 'awaiting_coach_response',
                requestedRefundAmount: requestedRefund,
            });
        }
        
        await ticket.save();

        if (!booking.disputeTicket || booking.disputeTicket._id.toString() !== ticket._id.toString()) {
            booking.disputeTicket = ticket._id;
            await booking.save();
        }
        
        if (escalate) {
            console.log(`Ticket ${ticket._id} for booking ${bookingId} was directly escalated by client ${client._id}.`);
            await unifiedNotificationService.sendNotification({
                type: NotificationTypes.REFUND_REQUEST_CLIENT_ESCALATED,
                // This would typically go to an admin group, but for now, we log it.
                recipient: booking.coach._id, // Notifying coach as a proxy for now.
                metadata: { bookingId: booking._id, clientName: `${client.firstName} ${client.lastName}` }
            }, booking);
        } else {
             await unifiedNotificationService.sendNotification({
                type: NotificationTypes.REFUND_REQUESTED_FOR_COACH,
                recipient: booking.coach._id,
                metadata: { bookingId: booking._id, clientName: `${client.firstName} ${client.lastName}` }
            }, booking);
        }

        return ticket;
    }

    async respondToRequest({ coachId, ticketId, decision, clientMessage, adminNote, approvedAmount }) {
        console.log(`[RefundRequestService] Coach ${coachId} responded to Ticket ${ticketId} with decision: ${decision}`);
        const ticket = await SupportTicket.findById(ticketId).populate({
            path: 'booking',
            populate: [
                { path: 'coach', model: 'User' },
                { path: 'user', model: 'User' },
                { path: 'sessionType' },
                { path: 'payment', populate: { path: 'paymentRecord' }}
            ]
        });

        if (!ticket || ticket.booking.coach._id.toString() !== coachId.toString()) throw new Error("Ticket not found or access denied.");
        if (ticket.status !== 'awaiting_coach_response') throw new Error("This request is no longer awaiting a response.");

        if (clientMessage && clientMessage.trim() !== '') {
            ticket.messages.push({ sender: new mongoose.Types.ObjectId(coachId), content: clientMessage, createdAt: new Date() });
        }
        
        if (adminNote && adminNote.trim() !== '') {
            if (!ticket.resolution) ticket.resolution = {};
            ticket.resolution.adminNotes = `Coach's private note: ${adminNote}`;
        }

        if (decision === 'approve') {
            const paymentRecord = ticket.booking.payment.paymentRecord;
            if (!paymentRecord) {
                throw new Error("Could not find the associated payment record for this booking.");
            }
            
            await paymentService.processRefund({
                paymentIntentId: paymentRecord.stripe.paymentIntentId,
                amount: approvedAmount,
                currency: paymentRecord.amount.currency,
                reason: `Coach approved refund. Message: ${clientMessage || 'No comment provided.'}`,
                metadata: {
                    initiatorId: coachId.toString(),
                    policyType: 'standard',
                    ticketId: ticketId.toString()
                }
            });

            const maxRefundable = paymentRecord.amount.total - (paymentRecord.amount.refunded || 0);
            const isFullRefund = approvedAmount >= maxRefundable;

            ticket.status = isFullRefund ? 'closed' : 'resolved_by_coach';
            ticket.resolution = {
                ...ticket.resolution,
                action: 'refund_approved',
                resolvedBy: new mongoose.Types.ObjectId(coachId),
                resolvedAt: new Date(),
                finalRefundAmount: approvedAmount
            };
            await ticket.save();

        } else { // Decline
            ticket.status = 'escalated_to_admin';
            await ticket.save();
            console.log(`Ticket ${ticketId} escalated to admin by coach ${coachId}.`);

            await unifiedNotificationService.sendNotification({
                type: NotificationTypes.REFUND_REQUEST_ESCALATED,
                recipient: ticket.user,
                metadata: { bookingId: ticket.booking._id, sessionTitle: ticket.booking.title || ticket.booking.sessionType?.name }
            }, ticket.booking);
            
            await this.notifyAdminsOfEscalation(ticket, 'coach');
        }
        return ticket;
    }


    async escalateDisputeByClient({ clientId, ticketId, reason }) {
        const ticket = await SupportTicket.findById(ticketId).populate('booking');
        if (!ticket || ticket.user.toString() !== clientId.toString()) {
            throw new Error("Ticket not found or access denied.");
        }
        if (ticket.status !== 'resolved_by_coach') {
            throw new Error("This dispute cannot be escalated from its current state.");
        }

        ticket.status = 'escalated_to_admin';
        ticket.messages.push({ sender: new mongoose.Types.ObjectId(clientId), content: `Client Escalation: ${reason}`, createdAt: new Date() });
        await ticket.save();

        console.log(`Ticket ${ticketId} was escalated to admin by client ${clientId}.`);
        await this.notifyAdminsOfEscalation(ticket, 'client');

        return ticket;
    }

async resolveDisputeByAdmin({ adminId, ticketId, finalAmount, policy, notes, decision }) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const ticket = await SupportTicket.findById(ticketId)
                .populate('booking') 
                .session(session);

            if (!ticket) {
                throw new Error("Ticket not found.");
            }
            if (ticket.status !== 'escalated_to_admin') {
                throw new Error("This ticket is not currently escalated to admin.");
            }

            if (decision === 'approve' && finalAmount > 0) {
                 console.log(`[RefundRequestService] Calling processRefund for ${finalAmount} CHF with policy '${policy}'`);
                await AdminFinancialService.processRefund({
                    paymentId: ticket.payment,
                    amount: finalAmount,
                    reason: `Admin resolution for dispute ${ticketId}. Notes: ${notes}`,
                    policyType: policy,
                    initiatorId: adminId,
                    bookingContext: ticket.booking 
                }, { session });
            }

            console.log(`[RefundRequestService] ==> resolveDisputeByAdmin START | Admin: ${adminId}, Ticket: ${ticketId}, Decision: ${decision}`);

            ticket.status = 'closed';
            ticket.resolution = {
                action: decision === 'approve' ? 'refund_approved' : 'refund_denied',
                resolvedBy: new mongoose.Types.ObjectId(adminId),
                resolvedAt: new Date(),
                finalRefundAmount: finalAmount,
                adminNotes: notes,
                policyApplied: policy
            };

            await ticket.save({ session });
            
            await session.commitTransaction();

            console.log(`Admin ${adminId} resolved ticket ${ticketId} with decision: ${decision}.`);
            
            const finalTicket = await SupportTicket.findById(ticket._id)
                .populate('user', 'firstName lastName email profilePicture')
                .populate({
                    path: 'booking',
                    populate: { path: 'coach', select: 'firstName lastName email profilePicture' }
                })
                .populate({
                    path: 'payment',
                    select: 'amount status payoutStatus refunds',
                    populate: {
                        path: 'refunds.processedBy',
                        model: 'User',
                        select: 'firstName lastName role'
                    }
                });

            return finalTicket;

        } catch (error) {
            await session.abortTransaction();
            logger.error(`[RefundRequestService] Failed to resolve dispute for ticket ${ticketId}`, { error: error.message });
            throw error;
        } finally {
            session.endSession();
        }
    }

    async notifyAdminsOfEscalation(ticket, escalatorRole) {
        const admins = await User.find({ role: 'admin' }).lean();
        if (admins.length === 0) {
            logger.warn(`No admin users found to notify for escalated ticket ${ticket._id}`);
            return;
        }

        for (const admin of admins) {
            await unifiedNotificationService.sendNotification({
                type: NotificationTypes.REFUND_REQUEST_ESCALATED_ADMIN,
                recipient: admin._id,
                metadata: {
                    bookingId: ticket.booking._id,
                    ticketId: ticket._id,
                    escalatorRole: escalatorRole
                }
            }, ticket.booking);
        }
    }
}

module.exports = new RefundRequestService();