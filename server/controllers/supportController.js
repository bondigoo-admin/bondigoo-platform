const SupportTicket = require('../models/SupportTicket');
const SupportMessage = require('../models/SupportMessage');
const User = require('../models/User');
const { logger } = require('../utils/logger');
const AuditLog = require('../models/AuditLog');

exports.getSupportTickets = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, assignee, priority, sortField = 'updatedAt', sortOrder = 'desc' } = req.query;
        const query = {};

        if (status) query.status = status;
        if (assignee) query.assignee = assignee;
        if (priority) query.priority = priority;

        const tickets = await SupportTicket.find(query)
            .populate('user', 'firstName lastName email')
            .populate('assignee', 'firstName lastName')
            .sort({ [sortField]: sortOrder === 'asc' ? 1 : -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const count = await SupportTicket.countDocuments(query);

        res.json({
            tickets,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalTickets: count,
        });
    } catch (error) {
        logger.error('Error fetching support tickets:', { error: error.message });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getTicketDetails = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const ticket = await SupportTicket.findById(ticketId)
            .populate('user')
            .populate('assignee', 'firstName lastName')
            .populate('booking')
            .populate('payment')
            .lean();

        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found.' });
        }

        const internalNotes = await SupportMessage.find({ ticketId: ticket._id })
            .populate('author', 'firstName lastName role profilePicture')
            .sort({ createdAt: 'asc' })
            .lean();
        
        const userLTV = await User.findById(ticket.user._id).select('ltv trustScore createdAt moderation').lean();
        if (userLTV) {
            ticket.user.ltv = userLTV.ltv;
            ticket.user.trustScore = userLTV.trustScore;
            ticket.user.createdAt = userLTV.createdAt;
            ticket.user.moderation = userLTV.moderation;
        }

        res.json({ ticket, internalNotes });
    } catch (error) {
        logger.error('Error fetching ticket details:', { ticketId: req.params.ticketId, error: error.message });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.addInternalNote = async (req, res) => {
    const { ticketId } = req.params;
    const { content } = req.body;
    const adminUserId = req.user._id;

    try {
        const ticket = await SupportTicket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found.' });
        }

        const note = new SupportMessage({
            ticketId,
            author: adminUserId,
            content,
            isInternalNote: true,
        });
        await note.save();

        ticket.updatedAt = new Date();
        if (ticket.status === 'open') {
             ticket.status = 'in_progress';
        }
        await ticket.save();

        const populatedNote = await note.populate('author', 'firstName lastName role profilePicture');

        const io = req.io;
        if (io) {
            io.to('admin_room').emit('TICKET_UPDATED', { ticketId });
        }

        res.status(201).json(populatedNote);
    } catch (error) {
        logger.error('Error adding internal note to ticket:', { ticketId, adminUserId, error: error.message });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.addMessageToTicket = async (req, res) => {
    const { ticketId } = req.params;
    const { content, isInternalNote } = req.body;
    const adminUserId = req.user._id;

    try {
        const ticket = await SupportTicket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found.' });
        }

        const message = await SupportMessage.create({
            ticketId,
            author: adminUserId,
            content,
            isInternalNote: !!isInternalNote,
        });
        
        ticket.updatedAt = new Date();
        if (ticket.status === 'open') {
             ticket.status = 'in_progress';
        }
        await ticket.save();

        const populatedMessage = await message.populate('author', 'firstName lastName role');

        // TODO: Add socket event emission to notify user of new public message
        // TODO: Add email notification to user for public message

        res.status(201).json(populatedMessage);
    } catch (error) {
        logger.error('Error adding message to ticket:', { ticketId, adminUserId, error: error.message });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updateTicket = async (req, res) => {
    const { ticketId } = req.params;
    const { status, assignee, priority } = req.body;
    const adminUserId = req.user._id;

    try {
        const ticket = await SupportTicket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found.' });
        }

        const updates = {};
        const auditChanges = [];
        let isResolving = false;

        if (status && ticket.status !== status) {
            updates.status = status;
            auditChanges.push(`Status changed from '${ticket.status}' to '${status}'`);
            if (status === 'resolved') {
                isResolving = true;
                updates.resolution = {
                    resolvedBy: adminUserId,
                    resolvedAt: new Date(),
                };
            }
        }
        if (assignee && (!ticket.assignee || ticket.assignee.toString() !== assignee)) {
            updates.assignee = assignee;
            auditChanges.push(`Assignee changed to ${assignee}`);
        }
        if (priority && ticket.priority !== priority) {
            updates.priority = priority;
            auditChanges.push(`Priority changed to ${priority}`);
        }

        if (Object.keys(updates).length > 0) {
            const updatedTicket = await SupportTicket.findByIdAndUpdate(ticketId, { $set: updates }, { new: true })
                .populate('user')
                .populate('assignee', 'firstName lastName');
            
            await AuditLog.create({
                adminUserId,
                targetEntity: 'support_ticket',
                targetEntityId: ticketId,
                action: isResolving ? 'resolve_ticket' : 'update_ticket',
                reason: isResolving ? `Admin resolved support ticket.` : `Admin updated ticket properties.`,
                metadata: { changes: auditChanges.join(', ') }
            });

            res.json(updatedTicket);
        } else {
            await ticket.populate(['user', { path: 'assignee', select: 'firstName lastName' }]);
            res.json(ticket);
        }
    } catch (error) {
        logger.error('Error updating ticket:', { ticketId, adminUserId, error: error.message });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.createSupportTicket = async (req, res) => {
    const { subject, initialMessage, ticketType, relatedAuditLog } = req.body;
    const userId = req.user.id;

    if (!subject || !initialMessage) {
        return res.status(400).json({ message: 'Subject and message are required.' });
    }

    try {
        const ticketData = {
            user: userId,
            subject,
            ticketType,
        };

        if (ticketType === 'appeal') {
            if (!relatedAuditLog) {
                return res.status(400).json({ message: 'Audit ID is required for appeal tickets.' });
            }
            const auditLog = await AuditLog.findById(relatedAuditLog);
            if (!auditLog || auditLog.targetUserId.toString() !== userId) {
                return res.status(403).json({ message: 'You are not authorized to appeal this action.' });
            }
            ticketData.auditLog = relatedAuditLog;
        }

        const newTicket = new SupportTicket(ticketData);
        await newTicket.save();

        const newMessage = new SupportMessage({
            ticketId: newTicket._id,
            author: userId,
            content: initialMessage,
        });
        await newMessage.save();

        const responsePayload = {
            ticket: newTicket,
            message: newMessage,
        };

        res.status(201).json(responsePayload);

    } catch (error) {
        logger.error('Error creating support ticket:', { error: error.message, userId });
        res.status(500).json({ message: 'Server Error' });
    }
};