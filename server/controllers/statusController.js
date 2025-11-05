const User = require('../models/User');
const { getSocketService } = require('../services/socketService');

exports.getUserStatusById = async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[StatusController] Received request for status of user: ${userId}`);
    
    const user = await User.findById(userId).select('status').lean();

    if (!user) {
      console.warn(`[StatusController] User not found for ID: ${userId}`);
      return res.status(404).json({ message: 'User not found.' });
    }

    console.log(`[StatusController] Found user ${userId}, status: ${user.status}`);
    res.json({ status: user.status });

  } catch (error) {
    console.error(`[StatusController] Error fetching status for user ${req.params.userId}:`, error);
    res.status(500).json({ message: 'Server error while fetching status.' });
  }
};

exports.updateMyStatus = async (req, res) => {
  const { status } = req.body;
  const userId = req.user.id;

  if (!status) {
    return res.status(400).json({ message: 'Status is required.' });
  }

  try {
    const allowedStatuses = User.schema.path('status').enumValues;
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          status: status,
          lastStatusUpdate: new Date()
        }
      },
      { new: true }
    ).select('status lastStatusUpdate');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }
    
    const socketService = getSocketService();
    if (socketService) {
      socketService.broadcastUserStatus(userId, updatedUser.status);
    }

    res.json(updatedUser);

  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ message: 'Server error while updating status.' });
  }
};