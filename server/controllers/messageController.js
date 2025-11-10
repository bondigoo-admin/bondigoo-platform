const messageService = require('../services/messageService');
const { logger } = require('../utils/logger');
const { initializeSocketService, getSocketService } = require('../services/socketService');
const Message = require('../models/Message');
const { SOCKET_EVENTS } = require ('../utils/socket_events');
const Conversation = require('../models/Conversation');
const ConversationMember = require('../models/ConversationMember');
const Coach = require('../models/Coach');
const User = require('../models/User');
const encryptionService = require('../utils/encryptionService');
const mongoose = require('mongoose');
const assetCleanupService = require('../services/assetCleanupService');
const cloudinary = require('../utils/cloudinaryConfig');
const axios = require('axios');

/**
 * Sends a new message in a conversation.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.sendMessage = async (req, res) => {
  const { recipientUserId, content, contentType = 'text', attachment, contextType, contextId } = req.body;
  const conversationId = req.params.conversationId;
  const userId = req.user._id.toString();
  const io = req.io;

  console.log('[DIAGNOSTIC LOG] sendMessage controller ENTRY', { controller_senderId: userId, controller_conversationId: conversationId, controller_recipientUserId: recipientUserId });

  console.log('[MessageController] Attempting to send message', {
    conversationId,
    userId,
    recipientUserId,
    contentType,
    hasContent: !!content,
    hasAttachment: !!attachment,
    contextType: contextType || 'none',
    contextId: contextId || 'none',
    timestamp: new Date().toISOString(),
  });

  try {
    if (!conversationId) {
      logger.error('[MessageController] Missing required field: conversationId', { conversationId, userId });
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    // Fetch conversation to determine type for validation
    const conversationForValidation = await Conversation.findById(conversationId).lean();
    if (!conversationForValidation) {
        logger.error('[MessageController] sendMessage failed: Conversation not found.', { conversationId });
        return res.status(404).json({ error: 'Conversation not found.' });
    }

    // Apply specific validation ONLY for one-on-one chats
    if (conversationForValidation.type === 'one-on-one') {
      if (!recipientUserId) {
        logger.error('[MessageController] Missing recipientUserId for one-on-one chat', { conversationId, userId });
        return res.status(400).json({ error: 'Recipient user ID is required for one-on-one chats' });
      }

      if (recipientUserId === userId) {
        logger.error('[MessageController] Cannot send message to self in one-on-one chat', { userId, conversationId });
        return res.status(400).json({ error: 'Cannot send message to self' });
      }

      const [senderUser, recipientUser] = await Promise.all([
          User.findById(userId).select('blockedUsers').lean(),
          User.findById(recipientUserId).select('blockedUsers').lean()
      ]);

      if (!senderUser || !recipientUser) {
          logger.error('[MessageController] One or more users not found for sending one-on-one message.', { senderId: userId, recipientId: recipientUserId });
          return res.status(404).json({ error: 'One or more users not found.' });
      }

      const isBlockedBySender = (senderUser.blockedUsers || []).some(b => b.user.equals(recipientUser._id));
      const isBlockedByRecipient = (recipientUser.blockedUsers || []).some(b => b.user.equals(senderUser._id));

      if (isBlockedBySender || isBlockedByRecipient) {
          logger.warn('[MessageController] Blocked user interaction attempt in sendMessage', { userId, recipientUserId });
          return res.status(403).json({ error: 'You are not allowed to interact with this user.' });
      }
    }

    // General validation for all conversation types
    if (contentType === 'text' && (!content || !content.trim())) {
      logger.error('[MessageController] Text content cannot be empty', { conversationId, userId });
      return res.status(400).json({ error: 'Text content cannot be empty' });
    }

    if (contentType !== 'text' && !attachment) {
      logger.error('[MessageController] Attachment required for non-text messages', { conversationId, userId, contentType });
      return res.status(400).json({ error: 'Attachment is required for non-text messages' });
    }

    // Call createMessage service function (this is now fixed to handle groups correctly)
    const { populatedMessage, updatedParticipantIds, undeletedRecipientIds } = await messageService.createMessage(
      userId,
      conversationId,
      content,
      contentType,
      attachment,
      contextType,
      contextId
    );

    // Decrypt message content for response if needed
    if (populatedMessage.contentType === 'text' && populatedMessage.content) {
      try {
        const conversation = await Conversation.findById(conversationId).select('+encryptionKey').lean();
        if (conversation && conversation.encryptionKey) {
            const dek = encryptionService.decryptDEK(conversation.encryptionKey);
            if (dek) {
                const decryptedContent = encryptionService.decrypt(populatedMessage.content, dek);
                populatedMessage.content = decryptedContent !== null ? decryptedContent : '[Decryption Error]';
            } else {
                logger.warn('[MessageController] Failed to decrypt DEK for sending message response', { conversationId });
            }
        }
      } catch(e) {
        logger.error('[MessageController] Error during post-creation decryption', { error: e.message, conversationId });
      }
    }

    // Format message object for socket events and API response
    const messageObject = {
      _id: populatedMessage._id,
      conversationId: populatedMessage.conversationId,
      senderId: populatedMessage.senderId._id.toString(),
      content: populatedMessage.content,
      contentType: populatedMessage.contentType,
      attachment: populatedMessage.attachment || null,
      createdAt: populatedMessage.createdAt,
      deliveryStatus: populatedMessage.deliveryStatus || 'sent',
      contextType: populatedMessage.contextType || null,
      contextId: populatedMessage.contextId || null,
      sender: {
        _id: populatedMessage.senderId._id,
        firstName: populatedMessage.senderId.firstName,
        lastName: populatedMessage.senderId.lastName,
        profilePicture: populatedMessage.senderId.profilePicture,
        role: populatedMessage.senderId.role,
        coachProfilePicture: populatedMessage.senderId.coachProfilePicture,
      },
    };

    const NEW_MESSAGE_EVENT = SOCKET_EVENTS?.MESSAGING?.NEW_MESSAGE || 'new_message';
    const MESSAGE_SENT_CONFIRMATION_EVENT = 'messageSentConfirmation';

    // This is the corrected broadcasting logic. It works for both groups and one-on-one.
    const allParticipantIds = new Set([
      userId,
      ...updatedParticipantIds,
      ...undeletedRecipientIds,
    ]);

    console.log('[MessageController] Broadcasting NEW_MESSAGE to all relevant participants', {
      messageId: populatedMessage._id,
      conversationId,
      participantCount: allParticipantIds.size,
      participants: Array.from(allParticipantIds),
    });

    allParticipantIds.forEach(participantId => {
      io.to(participantId).emit(NEW_MESSAGE_EVENT, { messageObject });
    });

    // Emit messageSentConfirmation only to the original sender's socket
    io.to(userId).emit(MESSAGE_SENT_CONFIRMATION_EVENT, { messageObject, tempId: req.body.tempId || null });

    console.log('[MessageController] Message sent successfully', {
      messageId: populatedMessage._id,
      conversationId,
      userId,
      updatedParticipants: updatedParticipantIds,
      undeletedRecipients: undeletedRecipientIds,
      timestamp: new Date().toISOString(),
    });
    return res.status(201).json({ message: populatedMessage });
  } catch (error) {
    logger.error('[MessageController] Failed to send message', {
      conversationId,
      userId,
      recipientUserId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to send message' });
  }
};

exports.createGroupConversation = async (req, res) => {
  const { memberIds, name, type, groupAvatar } = req.body;
  const creatorId = req.user._id.toString();
  const io = req.io;

  try {
    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'At least one member is required to start a group.' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required.' });
    }
    if (!['group', 'broadcast'].includes(type)) {
      return res.status(400).json({ error: 'Invalid conversation type specified.' });
    }

    const newConversation = await messageService.createGroupConversation({
      creatorId,
      memberIds,
      name,
      type,
      groupAvatar,
    });

    const allParticipantIds = [creatorId, ...memberIds];
    const NEW_CONVERSATION_EVENT = SOCKET_EVENTS?.MESSAGING?.NEW_CONVERSATION || 'new_conversation';

    // Fetch and format the conversation summary for each participant before emitting
    for (const participantId of allParticipantIds) {
      try {
        const conversationForUser = await messageService.getConversationSummary(newConversation._id, participantId);
        if (conversationForUser) {
          io.to(participantId.toString()).emit(NEW_CONVERSATION_EVENT, { conversation: conversationForUser });
          console.log('[MessageController] Emitted formatted NEW_CONVERSATION to participant', {
            conversationId: newConversation._id,
            participantId,
          });
        }
      } catch (error) {
        logger.error('[MessageController] Failed to get/emit conversation summary for participant', {
          conversationId: newConversation._id,
          participantId,
          error: error.message,
        });
      }
    }

    return res.status(201).json({ conversation: newConversation });
  } catch (error) {
    logger.error('[MessageController] Error creating group conversation', {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: 'Failed to create group conversation.' });
  }
};

/**
 * Creates a new conversation or retrieves an existing one.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.createOrGetConversation = async (req, res) => {
  const { recipientUserId, contextType, contextId } = req.body;
  const userId = req.user._id.toString();

  try {
    if (contextType === 'support_ticket' && contextId) {
      logger.info('[MessageController] Handling support ticket conversation creation', {
        userId,
        contextId,
        timestamp: new Date().toISOString(),
      });
      const conversation = await messageService.findOrCreateConversationForTicket(contextId, userId);
      return res.status(200).json({ conversation });
    }

    if (contextType === 'program_assignment_submission' && contextId) {
        const { enrollmentId, lessonId } = contextId;
        if (!enrollmentId || !lessonId) {
            return res.status(400).json({ error: 'Enrollment ID and Lesson ID are required for this context.' });
        }
        const conversation = await messageService.findOrCreateConversationForAssignment({
            enrollmentId,
            lessonId,
            coachId: userId,
            studentId: recipientUserId
        });
        return res.status(200).json({ conversation });
    }

    if (!recipientUserId || typeof recipientUserId !== 'string') {
      logger.error('[MessageController] Invalid recipientUserId', {
        userId,
        recipientUserId,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({ error: 'Recipient user ID is required and must be a string' });
    }

    if (recipientUserId === userId) {
      logger.error('[MessageController] Cannot create conversation with same user', {
        userId,
        recipientUserId,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({ error: 'Cannot create conversation with same user' });
    }

    const [currentUser, recipientUser] = await Promise.all([
        User.findById(userId).select('blockedUsers').lean(),
        User.findById(recipientUserId).select('blockedUsers').lean()
    ]);

    if (!currentUser || !recipientUser) {
        logger.error('[MessageController] One or more users not found.', { userId, recipientUserId });
        return res.status(404).json({ error: 'One or more users not found.' });
    }

    const isBlockedByCurrentUser = (currentUser.blockedUsers || []).some(b => b.user.equals(recipientUser._id));
    const isBlockedByRecipient = (recipientUser.blockedUsers || []).some(b => b.user.equals(currentUser._id));

    if (isBlockedByCurrentUser || isBlockedByRecipient) {
        logger.warn('[MessageController] Blocked user interaction attempt in createOrGetConversation', { userId, recipientUserId });
        return res.status(403).json({ error: 'You are not allowed to interact with this user.' });
    }

    const conversation = await messageService.createOrGetConversation(userId, recipientUserId, { contextType, contextId });
    const isNewConversation = !conversation.createdAt || new Date(conversation.createdAt).getTime() === new Date().getTime();

    if (isNewConversation) {
      const io = req.io;
      const participants = [userId, recipientUserId];
      const conversationData = {
        _id: conversation._id,
        participants: conversation.participants,
        otherParticipant: {
          _id: recipientUserId,
          firstName: conversation.participants.find(p => p._id.toString() === recipientUserId)?.firstName,
          lastName: conversation.participants.find(p => p._id.toString() === recipientUserId)?.lastName,
          role: conversation.participants.find(p => p._id.toString() === recipientUserId)?.role,
          profilePicture: conversation.participants.find(p => p._id.toString() === recipientUserId)?.profilePicture,
          coachProfilePicture: conversation.participants.find(p => p._id.toString() === recipientUserId)?.coachProfilePicture,
        },
        lastMessage: null,
        updatedAt: conversation.updatedAt,
        unreadCount: 0,
      };

      const NEW_CONVERSATION_EVENT = SOCKET_EVENTS?.MESSAGING?.NEW_CONVERSATION || 'new_conversation';

      participants.forEach(participantId => {
        io.to(participantId).emit(NEW_CONVERSATION_EVENT, { conversation: conversationData });
        console.log('[MessageController] Emitted NEW_CONVERSATION', {
          conversationId: conversation._id,
          participantId,
          event: NEW_CONVERSATION_EVENT,
          timestamp: new Date().toISOString(),
        });
      });
    }

    return res.status(200).json({ conversation });
  } catch (error) {
    logger.error('[MessageController] Error creating/getting conversation', {
      userId,
      recipientUserId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create or get conversation' });
  }
};

/**
 * Retrieves all conversations for the authenticated user.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getConversations = async (req, res) => {
  const userId = req.user._id.toString();
  const { page = 1, limit = 20 } = req.query;

  console.log('[MessageController] Fetching conversations', {
    userId,
    page,
    limit,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await messageService.getUserConversations(userId, parseInt(page), parseInt(limit));

    const currentUser = await User.findById(userId).select('blockedUsers.user').lean();
    const blockedByUserIds = (currentUser.blockedUsers || []).map(b => b.user.toString());

    const usersWhoBlockedCurrentUser = await User.find({ 'blockedUsers.user': userId }).select('_id').lean();
    const blockedByOtherUserIds = usersWhoBlockedCurrentUser.map(u => u._id.toString());

    const allBlockedIds = new Set([...blockedByUserIds, ...blockedByOtherUserIds]);

    if (allBlockedIds.size > 0) {
        const originalCount = result.conversations.length;
        result.conversations = result.conversations.filter(convo => {
            if (convo.type === 'group' || convo.type === 'broadcast') {
              return true;
            }
            const otherParticipantId = convo.otherParticipant?._id?.toString();
            return otherParticipantId && !allBlockedIds.has(otherParticipantId);
        });
        const filteredCount = result.conversations.length;
        console.log('[MessageController] Filtered conversations for blocked users', {
            userId, originalCount, filteredCount, blockedCount: originalCount - filteredCount
        });
    }

    
    console.log('[MessageController] Conversations fetched', {
      userId,
      conversationCount: result.conversations.length,
      timestamp: new Date().toISOString(),
    });
    return res.status(200).json(result);
  } catch (error) {
    logger.error('[MessageController] Error fetching conversations', {
      userId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch conversations' });
  }
};

/**
 * Retrieves a conversation by its ID.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getConversationById = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id.toString();

  console.log('[MessageController] Fetching conversation', {
    conversationId,
    userId,
    timestamp: new Date().toISOString(),
  });

  try {
    const conversation = await messageService.getConversationById(conversationId, userId);
    console.log('[MessageController] Conversation fetched', {
      conversationId,
      userId,
      timestamp: new Date().toISOString(),
    });
    return res.status(200).json({ conversation });
  } catch (error) {
    logger.error('[MessageController] Error fetching conversation', {
      conversationId,
      userId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch conversation' });
  }
};

/**
 * Retrieves messages for a conversation.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getMessages = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id.toString();
  const { page = 1, limit = 50 } = req.query;

  console.log('[MessageController] Fetching messages', {
    conversationId,
    userId,
    page,
    limit,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await messageService.getMessagesForConversation(
      userId,
      conversationId,
      parseInt(page),
      parseInt(limit)
    );
    console.log('[MessageController] Messages fetched', {
      conversationId,
      userId,
      messageCount: result.messages.length,
      timestamp: new Date().toISOString(),
    });
    return res.status(200).json(result);
  } catch (error) {
    logger.error('[MessageController] Error fetching messages', {
      conversationId,
      userId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch messages' });
  }
};

/**
 * Marks a conversation as read for the authenticated user.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.markConversationAsRead = async (req, res) => {
  const { conversationId } = req.body;
  const userId = req.user._id.toString();

  console.log('[MessageController] Attempting to mark conversation as read', {
    userId,
    conversationId,
    timestamp: new Date().toISOString(),
  });

  try {
    if (!conversationId) {
      logger.error('[MessageController] Conversation ID is required for marking as read.', {
        userId,
        conversationId,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    const result = await messageService.markConversationAsRead(userId, conversationId);

    const conversation = await Conversation.findById(conversationId).select('participants').lean();
    if (!conversation) {
        logger.warn('[MessageController] Conversation not found after marking as read, cannot emit socket event.', { conversationId });
        return res.status(200).json(result);
    }
    
    const otherParticipantIds = conversation.participants
      .map(p => p.toString())
      .filter(pId => pId !== userId);

    if (otherParticipantIds.length > 0) {
      const io = req.io;
      const CONVERSATION_READ_EVENT = SOCKET_EVENTS?.MESSAGING?.CONVERSATION_READ || 'conversation_read';
      
      otherParticipantIds.forEach(participantId => {
        io.to(participantId).emit(CONVERSATION_READ_EVENT, {
          conversationId: conversation._id,
          readerUserId: userId,
        });
        logger.debug('[MessageController] Emitted CONVERSATION_READ', {
          conversationId: conversation._id,
          readerUserId: userId,
          recipientId: participantId,
          event: CONVERSATION_READ_EVENT,
          timestamp: new Date().toISOString(),
        });
      });
    }

    console.log('[MessageController] Conversation marked as read', {
      conversationId: conversation._id,
      userId,
      messagesUpdated: result.messagesUpdated,
      timestamp: new Date().toISOString(),
    });
    return res.status(200).json(result);
  } catch (error) {
    logger.error('[MessageController] Error marking conversation as read', {
      userId,
      conversationId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to mark conversation as read' });
  }
};

/**
 * Deletes a conversation for the authenticated user (marks as hidden).
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deleteConversation = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id.toString(); // Assuming user ID is attached by auth middleware

  console.log('[MessageController] Attempting to delete conversation for user', {
    conversationId,
    userId,
    timestamp: new Date().toISOString(),
  });

  if (!conversationId) {
    logger.warn('[MessageController] Delete failed: Missing conversationId parameter', { userId });
    return res.status(400).json({ error: 'Conversation ID parameter is required.' });
  }

  try {
    const result = await messageService.deleteConversationForUser(userId, conversationId);

    // Optional: Emit an event via socket to potentially update other clients of the same user
    // req.io.to(userId).emit('conversation_deleted', { conversationId });

    console.log('[MessageController] Conversation deleted successfully for user', {
      conversationId,
      userId,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({ message: 'Conversation deleted successfully.', ...result });
  } catch (error) {
    logger.error('[MessageController] Error deleting conversation for user', {
      conversationId,
      userId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete conversation' });
  }
};

/**
 * Deletes a message for the authenticated user.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deleteMessage = async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user._id.toString();

  console.log('[MessageController] Attempting to delete message', {
    messageId,
    userId,
    timestamp: new Date().toISOString(),
  });

  try {
    const messageToDelete = await Message.findById(messageId).select('attachment').lean();
    const attachmentPublicId = messageToDelete?.attachment?.publicId;
    const attachmentResourceType = messageToDelete?.attachment?.resourceType;

    const result = await messageService.deleteMessage(userId, messageId);

    if (attachmentPublicId && result.status === 'deleted_for_everyone') {
        assetCleanupService.queueAssetDeletion(attachmentPublicId, attachmentResourceType || 'auto');
    }

    // Emit MESSAGE_DELETED to recipients if deleted for everyone
    if (result.status === 'deleted_for_everyone') {
      const message = await Message.findById(messageId).select('conversationId');
      const conversation = await Conversation.findById(message.conversationId).select('participants');
      const recipientIds = conversation.participants
        .filter(id => id.toString() !== userId)
        .map(id => id.toString());

      const io = req.io;
      recipientIds.forEach(recipientId => {
        io.to(recipientId).emit(SOCKET_EVENTS.MESSAGE_DELETED, {
          conversationId: message.conversationId,
          messageId,
        });
        logger.debug('[MessageController] Emitted MESSAGE_DELETED', {
          messageId,
          recipientId,
          conversationId: message.conversationId,
          timestamp: new Date().toISOString(),
        });
      });

      // If last message was updated, emit CONVERSATION_UPDATED
      if (result.updatedLastMessage) {
        recipientIds.forEach(recipientId => {
          io.to(recipientId).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
            conversationId: message.conversationId,
          });
          logger.debug('[MessageController] Emitted CONVERSATION_UPDATED', {
            conversationId: message.conversationId,
            recipientId,
            timestamp: new Date().toISOString(),
          });
        });
      }
    }

    console.log('[MessageController] Message deleted successfully', {
      messageId,
      userId,
      status: result.status,
      updatedLastMessage: result.updatedLastMessage || false,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error('[MessageController] Error deleting message', {
      messageId,
      userId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete message' });
  }
};

exports.getSecureAttachmentUrl = async (req, res) => {
  const { publicId } = req.body;
  const userId = req.user._id;

  try {
    const message = await Message.findOne({ 'attachment.publicId': publicId }).select('conversationId attachment').lean();
    if (!message) {
      return res.status(404).json({ message: 'Attachment not found.' });
    }

    const attachment = message.attachment.find(att => att.publicId === publicId);
    if (!attachment) {
      return res.status(404).json({ message: 'Attachment details not found within message.' });
    }

    const isMember = await ConversationMember.findOne({
      conversationId: message.conversationId,
      userId: userId,
    }).lean();

    if (!isMember) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const secureUrl = cloudinary.url(publicId, {
      resource_type: attachment.resourceType || 'auto',
      type: 'private',
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiration
    });

    res.json({ secureUrl });

  } catch (error) {
    logger.error('[getSecureAttachmentUrl] Failed to generate secure URL', { publicId, userId, error: error.message });
    res.status(500).json({ message: 'Could not generate secure URL.' });
  }
};

exports.downloadAttachment = async (req, res) => {
  const { id: publicId } = req.query;
  const userId = req.user._id;

  try {
    const message = await Message.findOne({ 'attachment.publicId': publicId }).select('conversationId attachment').lean();
    if (!message) {
      return res.status(404).json({ message: 'Attachment not found.' });
    }

    const attachment = message.attachment.find(att => att.publicId === publicId);
    if (!attachment) {
      return res.status(404).json({ message: 'Attachment details not found within message.' });
    }

    const isMember = await ConversationMember.findOne({
      conversationId: message.conversationId,
      userId: userId,
    }).lean();

    if (!isMember) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const secureUrl = cloudinary.url(publicId, {
      resource_type: attachment.resourceType || 'auto',
      type: 'private',
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 60 // Short expiration for server-side use
    });

    const response = await axios({
      method: 'get',
      url: secureUrl,
      responseType: 'stream'
    });
    
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.originalFilename}"`);

    response.data.pipe(res);

  } catch (error) {
    logger.error('[downloadAttachment] Failed to proxy attachment', { publicId, userId, error: error.message });
    res.status(500).json({ message: 'Could not retrieve attachment.' });
  }
};