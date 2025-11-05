import { toast } from 'react-hot-toast';
import socketService from './socketService';

class NotificationManager {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.socket = null;
    this.initialize();
  }

  async initialize() {
    try {
      this.socket = socketService.initSocket();
      this.setupSocketListeners();
    } catch (error) {
      console.error('[NotificationManager] Initialization error:', error);
    }
  }

  setupSocketListeners() {
    this.socket.on('notification', (data) => {
      this.handleIncomingNotification(data);
    });

    this.socket.on('notification_update', (data) => {
      this.handleNotificationUpdate(data);
    });
  }

  async handleIncomingNotification(notification) {
    try {
      // Add to queue
      this.queue.push(notification);
      
      // Show toast for high priority notifications
      if (notification.priority === 'high') {
        this.showToastNotification(notification);
      }

      // Process queue if not already processing
      if (!this.isProcessing) {
        await this.processQueue();
      }
    } catch (error) {
      console.error('[NotificationManager] Error handling notification:', error);
    }
  }

  showToastNotification(notification) {
    const toastId = `notification-${notification._id}`;
    
    // Custom toast component based on notification type
    const toastContent = (
      <div className="notification-toast">
        <h4>{notification.content.title}</h4>
        <p>{notification.content.message}</p>
        {notification.actions && notification.actions.length > 0 && (
          <div className="notification-actions">
            {notification.actions.map(action => (
              <button
                key={action.type}
                onClick={() => this.handleNotificationAction(notification._id, action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );

    // Show toast with appropriate duration based on priority
    const duration = notification.priority === 'high' ? 10000 : 5000;
    
    toast(toastContent, {
      id: toastId,
      duration: duration,
      style: {
        background: this.getNotificationColor(notification.type),
        color: '#fff',
      }
    });
  }

  getNotificationColor(type) {
    switch (type) {
      case 'booking_request':
        return '#4CAF50';
      case 'booking_cancelled':
        return '#f44336';
      case 'booking_updated':
        return '#2196F3';
      default:
        return '#333';
    }
  }

  async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const notification = this.queue.shift();

    try {
      await this.markAsDelivered(notification._id);
      this.updateNotificationsList(notification);
    } catch (error) {
      console.error('[NotificationManager] Error processing notification:', error);
      // Requeue failed notifications with retry limit
      if ((notification.delivery?.attempts || 0) < 3) {
        this.queue.push({
          ...notification,
          delivery: {
            ...notification.delivery,
            attempts: (notification.delivery?.attempts || 0) + 1
          }
        });
      }
    }

    // Process next notification
    await this.processQueue();
  }

  updateNotificationsList(notification) {
    // Emit event for UI components to update
    window.dispatchEvent(new CustomEvent('notificationUpdate', {
      detail: notification
    }));
  }

  async markAsDelivered(notificationId) {
    try {
      await fetch(`/api/notifications/${notificationId}/delivered`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('[NotificationManager] Error marking as delivered:', error);
      throw error;
    }
  }

  async handleNotificationAction(notificationId, action) {
    try {
      const response = await fetch(`/api/notifications/${notificationId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action })
      });

      const result = await response.json();
      
      // Handle specific actions
      switch (action.type) {
        case 'approve':
        case 'reject':
          this.handleBookingResponse(result);
          break;
        // Add other action type handlers
      }

      return result;
    } catch (error) {
      console.error('[NotificationManager] Error handling action:', error);
      toast.error('Failed to process action');
      throw error;
    }
  }

  handleBookingResponse(result) {
    // Update UI components
    window.dispatchEvent(new CustomEvent('bookingUpdate', {
      detail: result
    }));
  }
}

export default new NotificationManager();