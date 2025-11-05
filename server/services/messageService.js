const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const Coach = require('../models/Coach');
const { logger } = require('../utils/logger');
const mongoose = require('mongoose');
const encryptionService = require('../utils/encryptionService');
const ConversationMember = require('../models/ConversationMember');
const SupportTicket = require('../models/SupportTicket');
const Program = require('../models/Program');
const Lesson = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');

const decryptLastMessage = (conversation) => {
  if (conversation && conversation.lastMessage && conversation.lastMessage.contentType === 'text' && conversation.lastMessage.content && conversation.encryptionKey) {
    const dek = encryptionService.decryptDEK(conversation.encryptionKey);
    if (dek) {
      const decryptedContent = encryptionService.decrypt(conversation.lastMessage.content, dek);
      conversation.lastMessage.content = decryptedContent !== null ? decryptedContent : '[Message could not be decrypted]';
    } else {
      conversation.lastMessage.content = '[Encryption key error]';
      logger.warn(`[MessageService] Could not decrypt DEK for lastMessage`, { conversationId: conversation._id });
    }
  }
  return conversation;
};

const formatConversationList = (conversations, currentUserId, coachProfilesMap) => {
  logger.debug('[MessageService] Formatting conversation list', {
    conversationCount: conversations.length,
    currentUserId,
    coachProfilesAvailable: coachProfilesMap?.size || 0,
    timestamp: new Date().toISOString(),
  });
  return conversations.map(conv => {
    if (conv.type === 'group' || conv.type === 'broadcast') {
      const unreadCountValue = conv.unreadCounts instanceof Map
        ? conv.unreadCounts.get(currentUserId.toString()) || 0
        : conv.unreadCounts?.[currentUserId.toString()] || 0;

      logger.debug('[MessageService formatConversationList] Formatting group conversation', {
        conversationId: conv._id,
        name: conv.name,
        participantCount: conv.participants?.length || 0,
      });

return {
        _id: conv._id,
        type: conv.type,
        name: conv.name,
        subtext: conv.subtext,
        context: conv.context,
        groupAvatar: conv.groupAvatar,
        participants: conv.participants,
        lastMessage: conv.lastMessage ? {
          _id: conv.lastMessage._id,
          content: conv.lastMessage.content?.substring(0, 50) + (conv.lastMessage.content?.length > 50 ? '...' : ''),
          senderId: conv.lastMessage.senderId,
          contentType: conv.lastMessage.contentType,
          createdAt: conv.lastMessage.createdAt,
        } : null,
        updatedAt: conv.updatedAt,
        unreadCount: unreadCountValue
      };
    } else {
      const otherParticipant = conv.participants.find(
        p => p && p._id && p._id.toString() !== currentUserId.toString()
      );

      let participantData = null;
      if (otherParticipant) {
          const coachProfilePicture = (otherParticipant.role === 'coach' && coachProfilesMap)
              ? coachProfilesMap.get(otherParticipant._id.toString()) || null
              : null;

          participantData = {
            _id: otherParticipant._id,
            firstName: otherParticipant.firstName || 'Unknown',
            lastName: otherParticipant.lastName || 'User',
            role: otherParticipant.role,
            profilePicture: otherParticipant.profilePicture || null,
            coachProfilePicture: coachProfilePicture,
            status: otherParticipant.status || 'offline'
          };

          logger.debug('[MessageService formatConversationList] Participant data prepared', {
              conversationId: conv._id,
              otherParticipantId: otherParticipant._id,
              role: participantData.role,
              hasUserPic: !!participantData.profilePicture?.url,
              hasCoachPic: !!participantData.coachProfilePicture?.url,
          });

      } else {
          logger.warn('[MessageService formatConversationList] Could not find other participant in conversation', {
              conversationId: conv._id,
              participantIds: conv.participants?.map(p => p?._id?.toString() || 'null') || [],
              currentUserId,
          });
      }

      const unreadCountValue = conv.unreadCounts instanceof Map
        ? conv.unreadCounts.get(currentUserId.toString()) || 0
        : conv.unreadCounts?.[currentUserId.toString()] || 0;

return {
        _id: conv._id,
        type: 'one-on-one',
        name: conv.name,
        subtext: conv.subtext,
        context: conv.context,
        participants: conv.participants,
        otherParticipant: participantData,
        lastMessage: conv.lastMessage ? {
          _id: conv.lastMessage._id,
          content: conv.lastMessage.content?.substring(0, 50) + (conv.lastMessage.content?.length > 50 ? '...' : ''),
          senderId: conv.lastMessage.senderId,
          contentType: conv.lastMessage.contentType,
          createdAt: conv.lastMessage.createdAt,
        } : null,
        updatedAt: conv.updatedAt,
        unreadCount: unreadCountValue
      };
    }
  });
};

const createOrGetConversation = async (userId1, userId2, context = {}) => {
  const { contextType, contextId } = context;
  console.log(`[MessageService] createOrGetConversation | START | User1: ${userId1}, User2: ${userId2}`, { contextType, contextId });

  if (!userId1 || !userId2 || typeof userId1 !== 'string' || typeof userId2 !== 'string' || userId1 === userId2) {
    const error = new Error('Two distinct, valid user IDs are required.');
    error.statusCode = 400;
    logger.error(`[MessageService] createOrGetConversation | FAILED | Invalid input`, { userId1, userId2 });
    throw error;
  }

  const participants = [new mongoose.Types.ObjectId(userId1), new mongoose.Types.ObjectId(userId2)];
  
  const query = {
    participants: { $all: participants, $size: 2 },
    type: 'one-on-one',
  };

  if (contextType && contextId) {
    query['context.type'] = contextType;
    query['context.id'] = contextId;
  } else {
    query.context = { $exists: false };
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let conversation = await Conversation.findOne(query).session(session);

    if (conversation) {
      console.log(`[MessageService] createOrGetConversation | Found conversation ${conversation._id}.`);

      const memberCount = await ConversationMember.countDocuments({ conversationId: conversation._id }).session(session);
      if (memberCount < 2) {
        console.log(`[MessageService] createOrGetConversation | Backfilling members for conversation ${conversation._id}. Current count: ${memberCount}`);
        await ConversationMember.deleteMany({ conversationId: conversation._id }, { session });
        const memberDocs = participants.map(pId => ({
          conversationId: conversation._id,
          userId: pId,
          role: 'member',
        }));
        await ConversationMember.insertMany(memberDocs, { session });
        console.log(`[MessageService] createOrGetConversation | Member records reset and created for conversation ${conversation._id}.`);
      }

      const isDeletedForUser1 = (conversation.deletedFor || []).some(id => id.equals(participants[0]));
      if (isDeletedForUser1) {
        console.log(`[MessageService] createOrGetConversation | Restoring conversation ${conversation._id} for user ${userId1}.`);
        conversation.deletedFor = conversation.deletedFor.filter(id => !id.equals(participants[0]));
        conversation.restorationHistory.push({ userId: participants[0], restoredAt: new Date() });
        await conversation.save({ session });
      }
    } else {
      console.log(`[MessageService] createOrGetConversation | No existing conversation found with current context. Creating new one.`);
      const newDEK = encryptionService.generateDEK();
      const encryptedDEK = encryptionService.encryptDEK(newDEK);
      
      const newConversationData = {
        participants,
        type: 'one-on-one',
        unreadCounts: { [userId1]: 0, [userId2]: 0 },
        encryptionKey: encryptedDEK,
      };

      if (contextType && contextId) {
        newConversationData.context = { type: contextType, id: contextId };
      }

      const newConversation = new Conversation(newConversationData);
      await newConversation.save({ session });
      conversation = newConversation;
      console.log(`[MessageService] createOrGetConversation | New conversation created: ${conversation._id}`);

      const memberDocs = [
        { conversationId: conversation._id, userId: participants[0], role: 'member' },
        { conversationId: conversation._id, userId: participants[1], role: 'member' },
      ];
      await ConversationMember.insertMany(memberDocs, { session });
      console.log(`[MessageService] createOrGetConversation | New member records created for conversation ${conversation._id}`);
    }

    await session.commitTransaction();

    const finalConversation = await Conversation.findById(conversation._id)
      .populate({ path: 'participants', select: 'firstName lastName profilePicture status role' })
      .populate({ path: 'lastMessage', select: 'content senderId contentType createdAt' })
      .select('+encryptionKey')
      .lean();

    decryptLastMessage(finalConversation);

    const otherParticipant = finalConversation.participants.find((p) => p._id.toString() !== userId1);
    if (otherParticipant && otherParticipant.role === 'coach') {
      const coachProfile = await Coach.findOne({ user: otherParticipant._id }).select('profilePicture').lean();
      otherParticipant.coachProfilePicture = coachProfile?.profilePicture || null;
    }
    
    console.log(`[MessageService] createOrGetConversation | SUCCESS | Returning conversation: ${finalConversation._id}`);
    return {
      ...finalConversation,
      otherParticipant,
    };

  } catch (error) {
    await session.abortTransaction();
    logger.error('[MessageService] Error in createOrGetConversation transaction', {
      userId1,
      userId2,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  } finally {
    session.endSession();
  }
};

const getUserConversations = async (userId, page = 1, limit = 20) => {
  console.log(`[MessageService] Getting group-aware conversations for user ${userId}, page ${page}, limit ${limit}`);
  const skip = (page - 1) * limit;
  const userObjectId = new mongoose.Types.ObjectId(userId);

  try {
    const userConversationMemberships = await ConversationMember.find({ userId: userObjectId }).select('conversationId').lean();
    logger.debug(`[MessageService] Step 1/5: Found ${userConversationMemberships.length} conversation memberships for user ${userId}.`);

    const conversationIds = userConversationMemberships.map(m => m.conversationId);
    if (conversationIds.length === 0) {
      console.log(`[MessageService] User ${userId} is not a member of any conversations.`);
      return { conversations: [], currentPage: 1, totalPages: 1, totalConversations: 0 };
    }
    logger.debug(`[MessageService] Step 2/5: Extracted ${conversationIds.length} conversation IDs.`);
    
    const query = { _id: { $in: conversationIds }, deletedFor: { $ne: userObjectId } };

    const conversations = await Conversation.find(query)
      .populate({
        path: 'lastMessage',
        select: 'content senderId contentType createdAt',
      })
      .select('+encryptionKey')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    console.log(`[MessageService] Step 3/5: Fetched ${conversations.length} main conversation documents for user ${userId}.`);

    conversations.forEach(conv => decryptLastMessage(conv));
    
    const totalConversations = await Conversation.countDocuments(query);

    const allConversationIds = conversations.map(c => c._id);
    const allMembers = await ConversationMember.find({ conversationId: { $in: allConversationIds } })
      .populate({ path: 'userId', select: 'firstName lastName profilePicture status role' })
      .lean();
    logger.debug(`[MessageService] Step 4/5: Fetched ${allMembers.length} member documents for the ${allConversationIds.length} conversations.`);

    const membersByConversation = allMembers.reduce((acc, member) => {
      const key = member.conversationId.toString();
      if (!acc[key]) acc[key] = [];
      if (member.userId) { 
        acc[key].push(member.userId);
      }
      return acc;
    }, {});

    conversations.forEach(conv => {
      conv.participants = membersByConversation[conv._id.toString()] || [];
    });

    const allParticipantIds = new Set(allMembers.map(m => m.userId?._id.toString()).filter(Boolean));

    let coachProfilesMap = new Map();
    if (allParticipantIds.size > 0) {
        const coachUserIds = allMembers
            .filter(m => m.userId?.role === 'coach')
            .map(m => m.userId._id.toString());

        if (coachUserIds.length > 0) {
            const coachProfiles = await Coach.find({ user: { $in: coachUserIds } })
                .select('user profilePicture')
                .lean();

            coachProfilesMap = new Map(coachProfiles.map(cp => [cp.user.toString(), cp.profilePicture]));
        }
    }

    const enrichedConversations = await enrichConversationSummaryWithContext(conversations);

    const formatted = formatConversationList(enrichedConversations, userId, coachProfilesMap);
    console.log(`[MessageService] Step 5/5: Formatted ${formatted.length} conversations for user ${userId}. Total available: ${totalConversations}.`);

    return {
      conversations: formatted,
      currentPage: page,
      totalPages: Math.ceil(totalConversations / limit),
      totalConversations,
    };

  } catch (error) {
    logger.error('[MessageService] Error getting group-aware user conversations:', error);
    throw error;
  }
};

const getMessagesForConversation = async (userId, conversationId, page, limit = 30) => {
  console.log(`[MessageService] Getting messages for conversation ${conversationId}, page ${page}, limit ${limit}`, {
    userId,
    timestamp: new Date().toISOString(),
  });

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const conversationObjectId = new mongoose.Types.ObjectId(conversationId);

  const isMember = await ConversationMember.findOne({ conversationId: conversationObjectId, userId: userObjectId }).lean();
  
  if (!isMember) {
    logger.warn(`[MessageService] User ${userId} is not a member of conversation ${conversationId}.`);
    const error = new Error('User not authorized for this conversation.');
    error.statusCode = 403;
    throw error;
  }
  
  const conversation = await Conversation.findById(conversationObjectId).select('+encryptionKey');
  if (!conversation) {
    logger.warn(`[MessageService] User ${userId} attempted to access non-existent conversation ${conversationId}`);
    const error = new Error('Conversation not found.');
    error.statusCode = 404;
    throw error;
  }
  
  const dek = encryptionService.decryptDEK(conversation.encryptionKey);
  if (!dek) {
    logger.warn(`[MessageService] Could not decrypt conversation key for ${conversationId}. Messages may not be readable.`);
  }

  try {
    const totalMessages = await Message.countDocuments({ conversationId: conversationObjectId });
    const totalPages = Math.max(1, Math.ceil(totalMessages / limit));

    const effectivePage = page === undefined ? totalPages : Math.max(1, Math.min(page, totalPages));
    const skip = (effectivePage - 1) * limit;

    let query = { 
      conversationId: conversationObjectId,
      deletedFor: { $ne: userObjectId }
    };
    const userHistory = conversation.restorationHistory?.filter(
      entry => entry.userId.toString() === userId
    ) || [];
    let latestRestoredAt = null;
    if (userHistory.length > 0) {
      const latestRestoredEntry = userHistory
        .filter(entry => entry.restoredAt)
        .sort((a, b) => b.restoredAt - a.restoredAt)[0];
      latestRestoredAt = latestRestoredEntry?.restoredAt;
      if (latestRestoredAt) {
        console.log(`[MessageService] Filtering messages after restoration for user ${userId}`, {
          conversationId,
          restoredAt: latestRestoredAt.toISOString(),
          timestamp: new Date().toISOString(),
        });
        query.createdAt = { $gte: latestRestoredAt };
      } else {
        console.log(`[MessageService] No restoration for user ${userId}, showing no messages`, {
          conversationId,
          restorationHistory: userHistory.map(entry => ({
            userId: entry.userId.toString(),
            restoredAt: entry.restoredAt?.toISOString(),
            deletedAt: entry.deletedAt?.toISOString(),
          })),
          timestamp: new Date().toISOString(),
        });
        query.createdAt = { $gte: new Date() };
      }
    } else {
      logger.debug(`[MessageService] No restoration history for user ${userId} in conversation ${conversationId}`, {
        timestamp: new Date().toISOString(),
      });
    }

     const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('senderId', 'firstName lastName profilePicture role')
      .lean();

    const senderIds = [...new Set(messages.map(m => m.senderId?._id?.toString()).filter(id => id))];
    let coachProfiles = [];
    if (senderIds.length > 0) {
      try {
        coachProfiles = await Coach.find({ user: { $in: senderIds } })
          .select('user profilePicture')
          .lean();
        logger.debug(`[MessageService] Fetched coach profiles`, {
          conversationId,
          coachCount: coachProfiles.length,
          senderIds,
          profiles: coachProfiles.map(cp => ({
            userId: cp.user.toString(),
            hasProfilePicture: !!cp.profilePicture?.url,
          })),
          timestamp: new Date().toISOString(),
        });
      } catch (coachError) {
        logger.error(`[MessageService] Failed to fetch coach profiles`, {
          conversationId,
          error: coachError.message,
          timestamp: new Date().toISOString(),
        });
        coachProfiles = [];
      }
    }
    
    const coachProfileMap = new Map(coachProfiles.map(cp => [cp.user.toString(), cp.profilePicture]));

    const transformedMessages = messages.map((message) => {
      if (dek && message.contentType === 'text' && message.content) {
        const decryptedContent = encryptionService.decrypt(message.content, dek);
        message.content = decryptedContent !== null ? decryptedContent : '[Message could not be decrypted]';
      }

      if (!message.senderId) {
        logger.warn(`[MessageService] Message missing senderId`, {
          messageId: message._id,
          conversationId,
          timestamp: new Date().toISOString(),
        });
        return message;
      }
      const senderIdStr = message.senderId._id.toString();
      message.senderId.coachProfilePicture = coachProfileMap.get(senderIdStr) || null;
      if (!message.senderId.coachProfilePicture && !message.senderId.profilePicture) {
        logger.warn(`[MessageService] Sender has no profile picture`, {
          messageId: message._id,
          senderId: senderIdStr,
          conversationId,
          timestamp: new Date().toISOString(),
        });
      }
      return message;
    });

    const filteredCount = latestRestoredAt ? await Message.countDocuments(query) : totalMessages;
    const filteredTotalPages = Math.max(1, Math.ceil(filteredCount / limit));

    console.log(`[MessageService] Fetched ${transformedMessages.length} messages for conversation ${conversationId}`, {
      userId,
      totalMessages,
      filteredCount,
      page: effectivePage,
      totalPages: filteredTotalPages,
      restorationApplied: !!latestRestoredAt,
      coachProfilePicturesIncluded: transformedMessages.filter(m => m.senderId?.coachProfilePicture?.url).length,
      timestamp: new Date().toISOString(),
    });

    return {
      messages: transformedMessages.reverse(),
      currentPage: effectivePage,
      totalPages: filteredTotalPages,
      totalMessages: filteredCount,
    };
  } catch (error) {
    logger.error(`[MessageService] Error getting messages for conversation ${conversationId}:`, {
      userId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

const createMessage = async (senderId, conversationId, content, contentType = 'text', attachment = null, contextType = null, contextId = null) => {
  console.log('[MessageService] Attempting to create message for user', {
    senderId,
    conversationId,
    contentType,
    hasContent: !!content,
    hasAttachment: !!attachment,
    resourceType: attachment?.resourceType || 'none',
    contextType: contextType || 'none',
    contextId: contextId || 'none',
    timestamp: new Date().toISOString(),
  });

  const senderObjectId = new mongoose.Types.ObjectId(senderId);
  const conversationObjectId = new mongoose.Types.ObjectId(conversationId);

  try {
    const conversation = await Conversation.findById(conversationObjectId).select('+encryptionKey');

    if (!conversation) {
      logger.error('[MessageService] Conversation not found', { conversationId });
      const error = new Error('Conversation not found.');
      error.statusCode = 404;
      throw error;
    }

    const members = await ConversationMember.find({ conversationId: conversationObjectId }).lean();
    const senderMembership = members.find(m => m.userId.equals(senderObjectId));

    if (!senderMembership) {
        logger.error('[MessageService] Sender is not a member of the conversation', { conversationId, senderId });
        const error = new Error('Sender not authorized for this conversation.');
        error.statusCode = 403;
        throw error;
    }

    if (conversation.type === 'broadcast' && senderMembership.role !== 'admin') {
        logger.error('[MessageService] Non-admin attempted to post in a broadcast channel', { conversationId, senderId });
        const error = new Error('Only admins can post in a broadcast channel.');
        error.statusCode = 403;
        throw error;
    }

    const dek = encryptionService.decryptDEK(conversation.encryptionKey);
    if (!dek) {
      logger.error('[MessageService] Failed to get decryption key for conversation. Cannot create message.', { conversationId, senderId });
      const error = new Error('Message cannot be sent due to encryption key error.');
      error.statusCode = 500;
      throw error;
    }

    if (!Array.isArray(conversation.deletedFor)) {
      conversation.deletedFor = [];
      conversation.markModified('deletedFor');
    }

if (Array.isArray(attachment) && attachment.length > 0 && contentType === 'text') {
        contentType = 'file';
    }

    if (contentType !== 'text' && contentType !== 'system' && (!attachment || attachment.length === 0)) {
        logger.error('[MessageService] Attachment required for non-text messages', { contentType, conversationId, senderId });
        const error = new Error('Attachment is required for this message type.');
        error.statusCode = 400;
        throw error;
    }

    const encryptedContent = contentType === 'text' && content ? encryptionService.encrypt(content, dek) : content;

    const message = new Message({
      conversationId,
      senderId,
      content: encryptedContent,
      contentType,
      attachment: attachment || undefined,
      deliveryStatus: 'sent',
      contextType: contextType || undefined,
      contextId: contextId || undefined,
    });

    await message.save();
    logger.debug('[MessageService] Message saved', { messageId: message._id, conversationId, senderId });

    conversation.lastMessage = message._id;
    conversation.updatedAt = new Date();

    if (!conversation.unreadCounts) {
      conversation.unreadCounts = new Map();
    }

    const updatedParticipantIds = [];
    members.forEach(member => {
      const participantIdStr = member.userId.toString();
      if (participantIdStr !== senderId) {
        const currentUnread = conversation.unreadCounts.get(participantIdStr) || 0;
        conversation.unreadCounts.set(participantIdStr, currentUnread + 1);
        updatedParticipantIds.push(participantIdStr);
        logger.debug('[MessageService] Updated unread count for member', {
          participantId: participantIdStr,
          newCount: currentUnread + 1,
          conversationId,
        });
      }
    });

    conversation.markModified('unreadCounts');

    await conversation.save();
    logger.debug('[MessageService] Conversation updated with new message and unread counts', { conversationId, messageId: message._id });

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'firstName lastName profilePicture role')
      .lean();

    if (!populatedMessage) {
      logger.error('[MessageService] Failed to populate message', { messageId: message._id, conversationId, senderId });
      throw new Error('Message created but could not be retrieved.');
    }

    try {
      const coachProfile = await Coach.findOne({ user: populatedMessage.senderId._id })
        .select('profilePicture')
        .lean();
      populatedMessage.senderId.coachProfilePicture = coachProfile?.profilePicture || null;
    } catch (coachError) {
      logger.error(`[MessageService] Failed to fetch coach profile for sender`, { messageId: message._id, senderId, error: coachError.message });
      populatedMessage.senderId.coachProfilePicture = null;
    }

    console.log('[MessageService] Message created successfully for user', {
      messageId: populatedMessage._id,
      conversationId,
      senderId,
      recipientIds: updatedParticipantIds,
      contentType,
      timestamp: new Date().toISOString(),
    });

    return { populatedMessage, updatedParticipantIds, undeletedRecipientIds: [] };

  } catch (error) {
    logger.error('[MessageService] Error creating message for user', {
      conversationId,
      senderId,
      contentType,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    if (error.name === 'ValidationError') {
      error.statusCode = 400;
    }
    throw error;
  }
};

const createGroupConversation = async ({ creatorId, memberIds, name, type, groupAvatar = null }) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
    const memberObjectIds = memberIds.map(id => new mongoose.Types.ObjectId(id));
    const allParticipantIds = [creatorObjectId, ...memberObjectIds];

    const newDEK = encryptionService.generateDEK();
    const encryptedDEK = encryptionService.encryptDEK(newDEK);

    const initialUnreadCounts = new Map(
      allParticipantIds.map(id => [id.toString(), 0])
    );

    const conversation = new Conversation({
      type,
      name,
      groupAvatar,
      creator: creatorObjectId,
      participants: [], // Do NOT populate the legacy participants array for new groups.
      encryptionKey: encryptedDEK,
      unreadCounts: initialUnreadCounts,
    });
    await conversation.save({ session });
    
    const creatorMembership = {
      conversationId: conversation._id,
      userId: creatorObjectId,
      role: 'admin',
    };

    const memberMemberships = memberObjectIds.map(userId => ({
      conversationId: conversation._id,
      userId,
      role: 'member',
    }));

    await ConversationMember.insertMany([creatorMembership, ...memberMemberships], { session });
    
    await session.commitTransaction();
    session.endSession();

    console.log('[MessageService] Group conversation created successfully', { 
      conversationId: conversation._id, 
      creatorId, 
      memberCount: memberIds.length,
      name,
      type 
    });

    const populatedConversation = await Conversation.findById(conversation._id)
      .lean();
      
    const members = await ConversationMember.find({ conversationId: conversation._id })
      .populate({
        path: 'userId',
        select: 'firstName lastName profilePicture status role'
      })
      .lean();

    populatedConversation.participants = members.map(m => m.userId).filter(Boolean);

    return populatedConversation;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error('[MessageService] Error creating group conversation', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

const markConversationAsRead = async (userId, conversationId) => {
  console.log('[MessageService] Marking conversation as read for user', {
    conversationId,
    userId,
    timestamp: new Date().toISOString(),
  });
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const conversationObjectId = new mongoose.Types.ObjectId(conversationId);
  try {
    const isMember = await ConversationMember.findOne({
      conversationId: conversationObjectId,
      userId: userObjectId,
    });

    if (!isMember) {
      logger.error('[MessageService] markConversationAsRead failed: User is not a member of the conversation.', { conversationId, userId });
      const error = new Error('Conversation not found or user not authorized.');
      error.statusCode = 404;
      throw error;
    }

    const updateResult = await Message.updateMany(
      { conversationId: conversationObjectId, senderId: { $ne: userObjectId }, readBy: { $ne: userObjectId } },
      { $addToSet: { readBy: userObjectId } }
    );
    logger.debug('[MessageService] Updated readBy for messages', {
      conversationId,
      userId,
      modifiedCount: updateResult.modifiedCount,
      timestamp: new Date().toISOString(),
    });

    const updateQuery = { $set: {} };
    updateQuery.$set[`unreadCounts.${userId}`] = 0;
    await Conversation.updateOne({ _id: conversationObjectId }, updateQuery);
    logger.debug('[MessageService] Reset unread count for user', {
      conversationId,
      userId,
      timestamp: new Date().toISOString(),
    });
    return { success: true, messagesUpdated: updateResult.modifiedCount };
  } catch (error) {
    logger.error('[MessageService] Error marking conversation as read for user', {
      conversationId,
      userId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

const getConversationSummary = async (conversationId, forUserId) => {
   try {
    logger.debug('[MessageService] Fetching conversation summary', { conversationId, forUserId });
    const conversationObjectId = new mongoose.Types.ObjectId(conversationId);
    
    const conversation = await Conversation.findById(conversationObjectId)
      .populate({
        path: 'lastMessage',
        select: 'content senderId contentType createdAt',
      })
      .select('+encryptionKey')
      .lean();

    if (!conversation) {
      logger.warn('[MessageService] Conversation not found in getConversationSummary', { conversationId });
      return null;
    }

    const members = await ConversationMember.find({ conversationId: conversationObjectId })
      .populate({ path: 'userId', select: 'firstName lastName profilePicture status role' })
      .lean();

    conversation.participants = members.map(m => m.userId).filter(Boolean);

    logger.debug('[MessageService] Raw conversation data for summary', { 
      conversationId, 
      conversation: { 
        _id: conversation._id,
        type: conversation.type, 
        participants: conversation.participants?.map(p => p._id.toString()),
        lastMessage: conversation.lastMessage?._id?.toString(),
        unreadCounts: conversation.unreadCounts
      }
    });

     decryptLastMessage(conversation);

    if (!conversation.participants || !Array.isArray(conversation.participants)) {
      logger.error('[MessageService] Participants not populated correctly for summary', { 
        conversationId, 
        participants: conversation.participants 
      });
      throw new Error('Failed to populate participants for summary');
    }

    let coachProfilesMap = new Map();
    const coachParticipants = conversation.participants.filter(p => p && p.role === 'coach');
    if (coachParticipants.length > 0) {
        const coachUserIds = coachParticipants.map(p => p._id);
        try {
            const coachProfiles = await Coach.find({ user: { $in: coachUserIds } })
                .select('user profilePicture')
                .lean();
            coachProfilesMap = new Map(coachProfiles.map(cp => [cp.user.toString(), cp.profilePicture]));
            logger.debug(`[MessageService getConversationSummary] Fetched coach profiles for summary`, {
               conversationId,
               coachUserIds: coachUserIds.map(id => id.toString()),
               profilesFound: coachProfilesMap.size,
           });
        } catch (coachError) {
             logger.error(`[MessageService getConversationSummary] Failed to fetch coach profiles`, {
                conversationId, error: coachError.message
             });
             coachProfilesMap = new Map();
        }
    }
    
    const formattedList = formatConversationList([conversation], forUserId, coachProfilesMap);
    
    console.log('[MessageService getConversationSummary] Formatted conversation summary successful', { conversationId, forUserId });
    return formattedList.length > 0 ? formattedList[0] : null;

  } catch (error) {
    logger.error('[MessageService] Error getting conversation summary', { 
      conversationId, 
      forUserId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
};

const getConversationById = async (conversationId, senderId = null) => {
  console.log(`[MessageService] Fetching conversation by ID: ${conversationId}`);
  try {
    const conversation = await Conversation.findById(conversationId)
      .populate({
        path: 'participants',
        select: 'firstName lastName profilePicture status role',
      })
      .populate({
        path: 'lastMessage',
        select: 'content senderId contentType createdAt',
      })
      .select('+encryptionKey')
      .lean();

    if (!conversation) {
      throw new Error('Conversation not found.');
    }

    const isParticipant = conversation.participants.some(p => p._id.toString() === senderId);
    if (senderId && !isParticipant) {
      throw new Error('User not authorized for this conversation.');
    }
    
    decryptLastMessage(conversation);
    
    const enrichedConversations = await enrichConversationSummaryWithContext([conversation]);
    let finalConversation = enrichedConversations[0];

    const allParticipantIds = finalConversation.participants.map(p => p._id);
    const coachProfiles = await Coach.find({ user: { $in: allParticipantIds } }).select('user profilePicture').lean();
    const coachProfileMap = new Map(coachProfiles.map(cp => [cp.user.toString(), cp.profilePicture]));

    finalConversation.participants.forEach(p => {
        if (p.role === 'coach') {
            p.coachProfilePicture = coachProfileMap.get(p._id.toString()) || null;
        }
    });

    if (finalConversation.type === 'one-on-one') {
        finalConversation.otherParticipant = finalConversation.participants.find(p => p._id.toString() !== senderId);
    }

    console.log('[DIAGNOSTIC LOG] getConversationById: Returning final enriched conversation object.', { conversationObject: finalConversation });
    return finalConversation;
  } catch (error) {
    logger.error(`[MessageService] Error fetching conversation by ID ${conversationId}:`, { error: error.message });
    throw error;
  }
};

const deleteConversationForUser = async (userId, conversationId) => {
  console.log('[MessageService] Attempting to mark conversation as deleted for user', {
    conversationId,
    userId,
    timestamp: new Date().toISOString(),
  });

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const conversationObjectId = new mongoose.Types.ObjectId(conversationId);

  try {
    const isMember = await ConversationMember.findOne({ 
      conversationId: conversationObjectId, 
      userId: userObjectId 
    });

    if (!isMember) {
      logger.warn('[MessageService] Delete failed: User is not a member of the conversation.', {
        conversationId,
        userId,
        timestamp: new Date().toISOString(),
      });
      const error = new Error('Conversation not found, user not authorized, or already deleted.');
      error.statusCode = 404;
      throw error;
    }

    const conversation = await Conversation.findOne({
      _id: conversationObjectId,
      deletedFor: { $ne: userObjectId }
    });

    if (!conversation) {
      logger.warn('[MessageService] Delete failed: Conversation already marked as deleted for user', {
        conversationId,
        userId,
        timestamp: new Date().toISOString(),
      });
      const error = new Error('Conversation not found, user not authorized, or already deleted.');
      error.statusCode = 404;
      throw error;
    }

    const deletedAt = new Date();
    const updateResult = await Conversation.updateOne(
      { _id: conversationObjectId },
      { 
        $addToSet: { deletedFor: userObjectId },
        $push: { 
          restorationHistory: { 
            userId: userObjectId, 
            restoredAt: null,
            deletedAt 
          } 
        }
      }
    );

    if (updateResult.modifiedCount > 0) {
      console.log('[MessageService] Conversation marked as deleted for user', {
        conversationId,
        userId,
        deletedAt: deletedAt.toISOString(),
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.warn('[MessageService] Conversation was not marked as deleted, likely a race condition or already deleted.', {
        conversationId,
        userId,
        timestamp: new Date().toISOString(),
      });
    }

    return { success: true };
  } catch (error) {
    logger.error('[MessageService] Error marking conversation as deleted for user', {
      conversationId,
      userId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

const deleteMessage = async (userId, messageId) => {
  console.log('[MessageService] Attempting to delete message', {
    userId,
    messageId,
    timestamp: new Date().toISOString(),
  });

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const messageObjectId = new mongoose.Types.ObjectId(messageId);

  try {
    // Find the message
    const message = await Message.findById(messageObjectId);
    if (!message) {
      logger.warn('[MessageService] Message not found', { messageId, userId });
      const error = new Error('Message not found.');
      error.statusCode = 404;
      throw error;
    }

    // Validate sender
    if (!message.senderId.equals(userObjectId)) {
      logger.error('[MessageService] User not authorized to delete message', { messageId, userId });
      const error = new Error('User not authorized to delete this message.');
      error.statusCode = 403;
      throw error;
    }

    // Check if already deleted for the sender
    if (message.deletedFor.some(id => id.equals(userObjectId))) {
      console.log('[MessageService] Message already deleted for sender', { messageId, userId });
      return { status: 'deleted_for_sender' };
    }

    // Find the conversation
    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
      logger.error('[MessageService] Conversation not found for message', { messageId, conversationId: message.conversationId, userId });
      const error = new Error('Conversation not found.');
      error.statusCode = 404;
      throw error;
    }

    // Determine if message is read by any recipient
    const recipientIds = conversation.participants.filter(id => !id.equals(userObjectId));
    const isReadByAny = message.readBy.some(readId => recipientIds.some(recipientId => recipientId.equals(readId)));

    let updatedLastMessage = false;
    if (!isReadByAny) {
      // Delete for everyone
      console.log('[MessageService] Deleting message for everyone', { messageId, userId });
      message.deletedUniversally = true;
      message.deletedFor = conversation.participants; // Add all participants to deletedFor

      // Check if this was the last message
      if (conversation.lastMessage && conversation.lastMessage.equals(messageObjectId)) {
        logger.debug('[MessageService] Deleted message was last message, finding new last message', { messageId, conversationId: conversation._id });
        const newLastMessage = await Message.findOne({
          conversationId: conversation._id,
          deletedFor: { $ne: conversation.participants[0] }, // At least not deleted for one participant
        })
          .sort({ createdAt: -1 })
          .select('_id content senderId contentType createdAt')
          .lean();

        conversation.lastMessage = newLastMessage ? newLastMessage._id : null;
        updatedLastMessage = true;
        conversation.markModified('lastMessage');
        await conversation.save();
        logger.debug('[MessageService] Updated last message', {
          conversationId: conversation._id,
          newLastMessageId: newLastMessage ? newLastMessage._id : 'null',
        });
      }

      await message.save();
      console.log('[MessageService] Message deleted for everyone successfully', { messageId, userId });
      return { status: 'deleted_for_everyone', updatedLastMessage };
    } else {
      // Delete only for sender
      console.log('[MessageService] Deleting message for sender only', { messageId, userId });
      message.deletedFor.push(userObjectId);
      await message.save();
      console.log('[MessageService] Message deleted for sender successfully', { messageId, userId });
      return { status: 'deleted_for_sender' };
    }
  } catch (error) {
    logger.error('[MessageService] Error deleting message', {
      userId,
      messageId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    if (!error.statusCode) error.statusCode = 500;
    throw error;
  }
};

const findOrCreateConversationForTicket = async (ticketId, adminId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const ticket = await SupportTicket.findById(ticketId).session(session);
    if (!ticket) {
      throw new Error('Support ticket not found.');
    }

    if (ticket.conversationId) {
      const conversation = await Conversation.findById(ticket.conversationId).session(session);
      await session.commitTransaction();
      return conversation;
    }

    const newDEK = encryptionService.generateDEK();
    const encryptedDEK = encryptionService.encryptDEK(newDEK);

    const newConversation = new Conversation({
      participants: [ticket.user, adminId],
      type: 'one-on-one',
      name: `Support: ${ticket.subject}`,
      context: { type: 'support_ticket', id: ticket._id },
      unreadCounts: { [ticket.user.toString()]: 0, [adminId.toString()]: 0 },
      encryptionKey: encryptedDEK,
      creator: adminId,
    });
    await newConversation.save({ session });

    const memberDocs = [
      { conversationId: newConversation._id, userId: ticket.user, role: 'member' },
      { conversationId: newConversation._id, userId: adminId, role: 'member' },
    ];
    await ConversationMember.insertMany(memberDocs, { session });
    
    ticket.conversationId = newConversation._id;
    await ticket.save({ session });

    await session.commitTransaction();

    const finalConversation = await Conversation.findById(newConversation._id)
      .populate({ path: 'participants', select: 'firstName lastName profilePicture status role' })
      .lean();

    return finalConversation;
  } catch (error) {
    await session.abortTransaction();
    logger.error('[MessageService] Error in findOrCreateConversationForTicket', {
      ticketId,
      adminId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  } finally {
    session.endSession();
  }
};

const findOrCreateConversationForAssignment = async ({ enrollmentId, lessonId, coachId, studentId }) => {
    const existingConversation = await Conversation.findOne({
        'context.enrollmentId': enrollmentId,
        'context.lessonId': lessonId
    }).populate('participants', 'firstName lastName profilePicture role');

    if (existingConversation) {
        return existingConversation;
    }

    const enrollment = await Enrollment.findById(enrollmentId).populate({
        path: 'program',
        select: 'coach'
    });

    if (!enrollment || enrollment.program.coach.toString() !== coachId) {
        const error = new Error('Unauthorized or invalid enrollment.');
        error.statusCode = 403;
        throw error;
    }

    if (enrollment.user.toString() !== studentId) {
        const error = new Error('Student ID does not match enrollment.');
        error.statusCode = 400;
        throw error;
    }

    const newDEK = encryptionService.generateDEK();
    const encryptedDEK = encryptionService.encryptDEK(newDEK);

    const newConversation = new Conversation({
        type: 'one-on-one',
        participants: [coachId, studentId],
        context: {
            type: 'program_assignment_submission',
            enrollmentId,
            lessonId
        },
        encryptionKey: encryptedDEK,
        unreadCounts: { [coachId]: 0, [studentId]: 0 },
    });
    
    await newConversation.save();

    const memberDocs = [
        { conversationId: newConversation._id, userId: coachId, role: 'member' },
        { conversationId: newConversation._id, userId: studentId, role: 'member' },
    ];
    await ConversationMember.insertMany(memberDocs);
    
    return await Conversation.findById(newConversation._id).populate('participants', 'firstName lastName profilePicture role');
};

const enrichConversationSummaryWithContext = async (conversations) => {
    console.log('[DIAGNOSTIC LOG] enrichConversationSummaryWithContext: STARTING. Received conversations.', { count: conversations.length, ids: conversations.map(c => c._id) });

    const assignmentContextConversations = conversations.filter(
        c => c.context?.type === 'program_assignment_submission' && c.context.lessonId
    );
    const supportTicketContextConversations = conversations.filter(
        c => c.context?.type === 'support_ticket' && c.context.id
    );

    if (assignmentContextConversations.length === 0 && supportTicketContextConversations.length === 0) {
        console.log('[DIAGNOSTIC LOG] enrichConversationSummaryWithContext: No contextual conversations found. Returning original data.');
        return conversations;
    }

    const lessonMap = new Map();
    if (assignmentContextConversations.length > 0) {
        const lessonIds = assignmentContextConversations.map(c => c.context.lessonId);
        const lessons = await Lesson.find({ _id: { $in: lessonIds } })
            .select('title program')
            .populate({ path: 'program', select: 'title coach' })
            .lean();
        lessons.forEach(l => lessonMap.set(l._id.toString(), l));
        console.log('[DIAGNOSTIC LOG] enrichConversationSummaryWithContext: Built lessonMap.', { size: lessonMap.size });
    }
    
    const ticketMap = new Map();
    if (supportTicketContextConversations.length > 0) {
        const ticketIds = supportTicketContextConversations.map(c => c.context.id);
        const tickets = await SupportTicket.find({ _id: { $in: ticketIds } }).select('subject').lean();
        tickets.forEach(t => ticketMap.set(t._id.toString(), t));
        console.log('[DIAGNOSTIC LOG] enrichConversationSummaryWithContext: Built ticketMap.', { size: ticketMap.size });
    }

    const finalConversations = conversations.map(convo => {
        if (convo.context?.type === 'program_assignment_submission' && convo.context.lessonId) {
            const lesson = lessonMap.get(convo.context.lessonId.toString());
            if (lesson && lesson.program) {
                convo.name = `Feedback: ${lesson.title}`;
                convo.subtext = `In program: ${lesson.program.title}`;
                convo.context.programId = lesson.program._id.toString();
                if (lesson.program.coach) {
                    convo.context.programAuthorId = lesson.program.coach.toString();
                }
            }
        } else if (convo.context?.type === 'support_ticket' && convo.context.id) {
            const ticket = ticketMap.get(convo.context.id.toString());
            if (ticket) {
                convo.name = `Support: ${ticket.subject}`;
            }
        }
        return convo;
    });

    console.log('[DIAGNOSTIC LOG] enrichConversationSummaryWithContext: FINISHED.', { finalConversationCount: finalConversations.length });
    return finalConversations;
};

module.exports = {
  createOrGetConversation,
  getUserConversations,
  getMessagesForConversation,
  createMessage,
  markConversationAsRead,
  getConversationSummary,
  getConversationById,
  deleteConversationForUser,
  deleteMessage,
  createGroupConversation,
  findOrCreateConversationForTicket,
  findOrCreateConversationForAssignment,
  enrichConversationSummaryWithContext,
};