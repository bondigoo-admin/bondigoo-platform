const express = require('express');
const messageController = require('../controllers/messageController');
const { auth } = require('../middleware/auth');
const cloudinaryUtils = require('cloudinary').v2; // Ensure Cloudinary is imported
const { logger } = require('../utils/logger');

const router = express.Router();

// -- Conversation Routes --

// Get all conversations for the logged-in user (paginated)
router.get('/conversations', auth, messageController.getConversations);

// Create a new conversation or get existing one with a specific user
router.post('/conversations', auth, messageController.createOrGetConversation);

router.post('/conversations/group', auth, messageController.createGroupConversation);

// Mark a conversation as read by the logged-in user
router.post('/conversations/read', auth, messageController.markConversationAsRead);

// -- Message Routes --

// Get messages for a specific conversation (paginated)
router.get('/conversations/:conversationId/messages', auth, messageController.getMessages);

// Send a new message in a specific conversation
router.post('/conversations/:conversationId/messages', auth, messageController.sendMessage);

// Cloudinary upload signature for message attachments
router.get('/upload-signature', auth, (req, res) => {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const uploadPreset = process.env.CLOUDINARY_MESSAGE_UPLOAD_PRESET || 'message_attachments';
    const folder = `user_messages/${req.user._id}`;

    const signature = cloudinaryUtils.utils.api_sign_request(
      {
        timestamp,
        upload_preset: uploadPreset,
        folder,
      },
      process.env.CLOUDINARY_API_SECRET
    );

    logger.info(`[Cloudinary] Generated upload signature for user ${req.user._id}`);
    res.json({
      signature,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      uploadPreset,
      folder,
    });
  } catch (error) {
    logger.error('[Cloudinary] Error generating upload signature:', error);
    res.status(500).json({ success: false, message: 'Error generating upload signature' });
  }
});

router.post('/attachments/secure-url', auth, messageController.getSecureAttachmentUrl);

router.delete('/conversations/:conversationId', auth, messageController.deleteConversation);
// Delete a specific message
router.delete('/messages/:messageId', auth, messageController.deleteMessage);

module.exports = router;