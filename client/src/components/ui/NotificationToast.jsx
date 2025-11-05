import React from 'react';
import { X, Bell, Calendar, MessageCircle, Video, Clock, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const NotificationToast = ({ notification, onAction, onDismiss }) => {
  const { t } = useTranslation(['notifications']);

  const getIcon = () => {
    switch (notification.type) {
      case 'booking_request':
        return <Calendar className="text-blue-500" size={20} />;
      case 'message':
        return <MessageCircle className="text-green-500" size={20} />;
      case 'live_session':
        return <Video className="text-purple-500" size={20} />;
      case 'instant_session':
        return <Clock className="text-orange-500" size={20} />;
      default:
        return <Bell className="text-gray-500" size={20} />;
    }
  };

  const getPriorityStyles = () => {
    switch (notification.priority) {
      case 'high':
        return 'border-l-4 border-red-500 bg-red-50';
      case 'medium':
        return 'border-l-4 border-yellow-500 bg-yellow-50';
      default:
        return 'border-l-4 border-blue-500 bg-blue-50';
    }
  };

  const handleAction = (action) => {
    if (onAction) {
      onAction(notification._id, action);
    }
  };

  return (
    <div className={`relative rounded-lg p-4 shadow-md ${getPriorityStyles()}`}>
      <button
        onClick={() => onDismiss(notification._id)}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>

      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {getIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {notification.content.title}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {notification.content.message}
          </p>

          {notification.actions && notification.actions.length > 0 && (
            <div className="mt-3 flex space-x-2">
              {notification.actions.map((action) => (
                <button
                  key={action.type}
                  onClick={() => handleAction(action)}
                  className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium
                    ${action.type === 'approve' ? 
                      'bg-green-100 text-green-800 hover:bg-green-200' : 
                      'bg-red-100 text-red-800 hover:bg-red-200'}`}
                >
                  {action.type === 'approve' ? <Check size={16} className="mr-1" /> : <X size={16} className="mr-1" />}
                  {action.label || t(`notifications:actions.${action.type}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {notification.timestamp && (
        <p className="mt-1 text-xs text-gray-400">
          {new Date(notification.timestamp).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
};

export default NotificationToast;