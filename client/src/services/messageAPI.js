import api, { fileApi } from './api';
import { logger } from '../utils/logger';

/**
 * Fetches the list of conversations for the current user.
 * @param {number} page - Page number for pagination.
 * @param {number} limit - Number of items per page.
 * @returns {Promise<object>} - Promise resolving to pagination object with conversations array.
 */
export const getConversations = async (page = 1, limit = 20) => {
  //logger.info('[messageAPI] Fetching conversations', { page, limit });
  try {
    const response = await api.get('/api/messages/conversations', {
      params: { page, limit },
    });
    /*logger.debug('[messageAPI] Raw conversations response', {
      data: response.data,
      timestamp: new Date().toISOString(),
    });*/
    //logger.debug('[messageAPI] Conversations fetched successfully', { count: response.data?.conversations?.length });
    return response.data || { conversations: [], totalPages: 0, currentPage: 1 };
  } catch (error) {
    logger.error('[messageAPI] Error fetching conversations:', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error.response?.data || new Error('Failed to fetch conversations');
  }
};

/**
 * Creates a new conversation or retrieves an existing one with a recipient.
 * @param {string} recipientUserId - The ID of the user to start a conversation with.
 * @returns {Promise<object>} - Promise resolving to the conversation object.
 */
export const createOrGetConversation = async ({ recipientId, contextType, contextId }) => {
  logger.info('[messageAPI] Creating or getting conversation', { recipientId, contextType, contextId });
  if (!recipientId) {
    logger.error('[messageAPI] recipientId is required');
    throw new Error('Recipient User ID is required.');
  }
  try {
    const response = await api.post('/api/messages/conversations', { 
      recipientUserId: recipientId, 
      contextType, 
      contextId 
    });
    logger.debug('[messageAPI] createOrGetConversation successful', { conversationId: response.data?.conversation?._id });
    return response.data.conversation;
  } catch (error) {
    logger.error('[messageAPI] Error creating/getting conversation:', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error.response?.data || new Error('Failed to create or get conversation');
  }
};

/**
 * Fetches a conversation by its ID.
 * @param {string} conversationId - The ID of the conversation to fetch.
 * @returns {Promise<object>} - Promise resolving to the conversation object.
 */
export const getConversationById = async (conversationId) => {
  logger.info('[messageAPI] Fetching conversation by ID', { conversationId });
  if (!conversationId) {
    logger.error('[messageAPI] conversationId is required for getConversationById');
    throw new Error('Conversation ID is required.');
  }
  try {
    const response = await api.get(`/api/messages/conversations/${conversationId}`);
    //logger.debug('[messageAPI] Conversation fetched successfully', { conversationId });
    return response.data.conversation;
  } catch (error) {
    logger.error('[messageAPI] Error fetching conversation:', {
      error: error.response?.data || error.message,
      status: error.response?.status,
      conversationId,
    });
    throw error.response?.data || new Error('Failed to fetch conversation');
  }
};

/**
 * Marks a conversation as read for the current user.
 * @param {string} recipientUserId - The ID of the other user in the conversation.
 * @returns {Promise<object>} - Promise resolving to the response data.
 */
export const markConversationAsRead = async ({ conversationId }) => {
  logger.info('[messageAPI] Attempting to mark conversation as read', {
    conversationId,
    timestamp: new Date().toISOString(),
  });
  if (!conversationId || typeof conversationId !== 'string') {
    logger.error('[messageAPI] Cannot mark conversation as read: invalid conversationId', {
      conversationId,
      timestamp: new Date().toISOString(),
    });
    throw new Error('Conversation ID must be a valid string.');
  }
  try {
    const response = await api.post('/api/messages/conversations/read', { conversationId });
    logger.info('[messageAPI] Conversation marked as read successfully', {
      conversationId,
      timestamp: new Date().toISOString(),
    });
    return response.data;
  } catch (error) {
    logger.error('[messageAPI] Failed to mark conversation as read', {
      conversationId,
      error: error.response?.data || error.message,
      status: error.response?.status,
      timestamp: new Date().toISOString(),
    });
    throw error.response?.data || new Error('Failed to mark conversation as read');
  }
};

/**
 * Sends a new message.
 * @param {object} messageData - Message content, recipient, and type.
 * @param {string} messageData.recipientUserId - The ID of the recipient user.
 * @param {string} messageData.content - The text content (if contentType is 'text').
 * @param {string} [messageData.contentType='text'] - The type of message.
 * @param {object} [messageData.attachment=null] - Attachment details.
 * @returns {Promise<object>} - Promise resolving to the newly created message object.
 */
export const sendMessage = async ({ recipientUserId, content, contentType, attachment, conversationId, contextType, contextId }) => {
  logger.info('[messageAPI] Preparing to send message for user', {
    recipientUserId,
    contentType,
    hasContent: !!content,
    hasAttachment: !!attachment,
    conversationId,
    contextType,
    contextId,
    timestamp: new Date().toISOString(),
  });

  if (!recipientUserId && (contentType !== 'system')) {
    logger.error('[messageAPI] Cannot send message: missing recipientUserId', {
      recipientUserId,
      conversationId,
      timestamp: new Date().toISOString(),
    });
    throw new Error('Recipient User ID is required.');
  }
  if (!conversationId) {
    logger.error('[messageAPI] Cannot send message: missing conversationId', {
      recipientUserId,
      conversationId,
      timestamp: new Date().toISOString(),
    });
    throw new Error('Conversation ID is required.');
  }
  if (contentType === 'text' && !content?.trim()) {
    logger.error('[messageAPI] Cannot send message: text content empty', {
      recipientUserId,
      conversationId,
      timestamp: new Date().toISOString(),
    });
    throw new Error('Message content cannot be empty.');
  }
  if (contentType !== 'text' && contentType !== 'system' && !attachment) {
    logger.error('[messageAPI] Cannot send message: missing attachment for non-text type', {
      recipientUserId,
      contentType,
      conversationId,
      timestamp: new Date().toISOString(),
    });
    throw new Error('Attachment is required for non-text messages.');
  }


  try {
    const response = await api.post(`/api/messages/conversations/${conversationId}/messages`, {
      recipientUserId,
      content,
      contentType,
      attachment,
      contextType,
      contextId,
    });
    logger.info('[messageAPI] Message sent successfully via API', {
      messageId: response.data?.message?._id,
      conversationId,
      recipientUserId,
      timestamp: new Date().toISOString(),
    });
    return response.data.message;
  } catch (error) {
    logger.error('[messageAPI] Failed to send message', {
      recipientUserId,
      conversationId,
      error: error.response?.data || error.message,
      status: error.response?.status,
      timestamp: new Date().toISOString(),
    });
    throw error.response?.data || new Error('Failed to send message');
  }
};

/**
 * Fetches messages for a specific conversation with pagination.
 * @param {string} conversationId - The ID of the conversation.
 * @param {number} page - Page number.
 * @param {number} limit - Number of messages per page.
 * @returns {Promise<object>} - Promise resolving to pagination object with messages array.
 */
export const getMessages = async (conversationId, page = 1, limit = 50) => {
  //logger.info('[messageAPI] Fetching messages', { conversationId, page, limit });
  if (!conversationId) {
    logger.error('[messageAPI] conversationId is required for getMessages');
    throw new Error('Conversation ID is required.');
  }
  try {
    const response = await api.get(`/api/messages/conversations/${conversationId}/messages`, {
      params: { page, limit },
    });
    //logger.debug('[messageAPI] Messages fetched successfully', { conversationId, count: response.data?.messages?.length });
    return response.data || { messages: [], totalPages: 0, currentPage: 1 };
  } catch (error) {
    logger.error('[messageAPI] Error fetching messages:', {
      error: error.response?.data || error.message,
      status: error.response?.status,
      conversationId,
    });
    throw error.response?.data || new Error('Failed to fetch messages');
  }
};

/**
 * Fetches Cloudinary signature details for uploading message attachments.
 * @returns {Promise<object>} - Promise resolving to signature data.
 */
export const getMessageUploadSignature = async () => {
  //logger.info('[messageAPI] Fetching message upload signature');
  try {
    const response = await api.get('/api/messages/upload-signature');
    //logger.debug('[messageAPI] Upload signature fetched successfully');
    return response.data;
  } catch (error) {
    logger.error('[messageAPI] Error fetching upload signature:', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error.response?.data || new Error('Failed to get upload signature');
  }
};

/**
 * Searches for users eligible to be messaged by the current user.
 * Handles empty query to fetch initial list.
 * @param {string} query - The search term (name). Empty string fetches initial list.
 * @param {string} [role] - Optional role to filter by ('coach', 'client').
 * @returns {Promise<Array>} - Promise resolving to an array of user objects.
 */
export const searchMessageRecipients = async (query = '', role) => {
  logger.info('[messageAPI] Searching message recipients', {
    query: query || 'INITIAL_LIST',
    role,
    timestamp: new Date().toISOString(),
  });
  try {
    const response = await api.get('/api/users/search-messaging', {
      params: { query, role },
    });
    logger.debug('[messageAPI] Recipient search results', {
      query: query || 'INITIAL_LIST',
      count: response.data?.length,
      results: response.data?.map(user => ({
        _id: user._id,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture,
        hasProfilePicture: !!user.profilePicture?.url,
        hasCoachProfilePicture: !!user.coachProfilePicture?.url,
      })),
      timestamp: new Date().toISOString(),
    });
    return response.data || [];
  } catch (error) {
    logger.error('[messageAPI] Error searching message recipients', {
      query: query || 'INITIAL_LIST',
      role,
      error: error.response?.data || error.message,
      status: error.response?.status,
      timestamp: new Date().toISOString(),
    });
    throw error.response?.data || new Error('Failed to search users');
  }
};

/**
 * Deletes a conversation for the current user.
 * @param {string} conversationId - The ID of the conversation to delete.
 * @returns {Promise<object>} - Promise resolving to the response data.
 */
export const deleteConversation = async (conversationId) => {
  //logger.info('[messageAPI] Deleting conversation', { conversationId });
  try {
    const response = await api.delete(`/api/messages/conversations/${conversationId}`);
   // logger.debug('[messageAPI] Conversation deleted response', { status: response.status, data: response.data });
    return response.data; // e.g., { success: true }
  } catch (error) {
    logger.error('[messageAPI] Error deleting conversation:', {
      conversationId,
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error.response?.data || new Error('Failed to delete conversation');
  }
};

/**
 * Deletes a message by its ID.
 * @param {string} messageId - The ID of the message to delete.
 * @returns {Promise<object>} - Promise resolving to the response data.
 */
export const deleteMessage = async (messageId) => {
  logger.info('[messageAPI] Deleting message', { messageId, timestamp: new Date().toISOString() });
  if (!messageId) {
    logger.error('[messageAPI] messageId is required for deleteMessage');
    throw new Error('Message ID is required.');
  }
  try {
    const response = await api.delete(`/api/messages/messages/${messageId}`);
    logger.info('[messageAPI] Message deleted successfully', { messageId, status: response.data.status });
    return response.data;
  } catch (error) {
    logger.error('[messageAPI] Error deleting message:', {
      messageId,
      error: error.response?.data || error.message,
      status: error.response?.status,
      timestamp: new Date().toISOString(),
    });
    throw error.response?.data || new Error('Failed to delete message');
  }
};

/**
 * Creates a new group conversation.
 * @param {object} groupData - The data for the new group.
 * @param {string[]} groupData.memberIds - Array of user IDs for members.
 * @param {string} groupData.name - The name of the group.
 * @param {string} groupData.type - 'group' or 'broadcast'.
 * @param {object} [groupData.groupAvatar] - Optional avatar object.
 * @returns {Promise<object>} - Promise resolving to the new conversation object.
 */
export const createGroupConversation = async ({ memberIds, name, type, groupAvatar }) => {
  logger.info('[messageAPI] Creating group conversation', { memberCount: memberIds.length, name, type });
  try {
    const response = await api.post('/api/messages/conversations/group', {
      memberIds,
      name,
      type,
      groupAvatar,
    });
    logger.debug('[messageAPI] createGroupConversation successful', { conversationId: response.data?.conversation?._id });
    return response.data.conversation;
  } catch (error) {
    logger.error('[messageAPI] Error creating group conversation:', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error.response?.data || new Error('Failed to create group conversation');
  }
};

export const getSecureAttachmentUrl = async (publicId) => {
  try {
    const response = await api.post('/api/messages/attachments/secure-url', { publicId });
    return response.data;
  } catch (error) {
    logger.error('[messageAPI] Error fetching secure attachment URL:', {
      error: error.response?.data || error.message,
    });
    throw error.response?.data || new Error('Failed to fetch secure URL');
  }
};

export const downloadMessageAttachment = async ({ publicId }) => {
  logger.info('[messageAPI] Requesting attachment download', { publicId });
  if (!publicId) {
    logger.error('[messageAPI] publicId is required for downloadMessageAttachment');
    throw new Error('Attachment public ID is required.');
  }
  try {
    const response = await fileApi.get(`/api/messages/attachments/download`, {
      params: { id: publicId },
      responseType: 'blob',
    });

    const contentDisposition = response.headers['content-disposition'];
    let filename = `attachment-${publicId}.pdf`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch && filenameMatch.length === 2) {
        filename = filenameMatch[1];
      }
    }
    
    logger.debug('[messageAPI] Attachment download successful', { publicId, filename });
    return { data: response.data, filename };
  } catch (error) {
    logger.error('[messageAPI] Error downloading attachment:', {
      publicId,
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error.response?.data || new Error('Failed to download attachment');
  }
};