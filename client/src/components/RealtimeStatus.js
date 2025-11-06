
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useNotificationSocket } from '../contexts/SocketContext';
import LiveStatusIndicator from './LiveStatusIndicator';

const RealtimeStatus = ({ userId }) => {
  const [status, setStatus] = useState('offline');
  const { socket } = useNotificationSocket();

useEffect(() => {
    if (userId) {
      const statusUpdateHandler = ({ userId: updatedUserId, status: newStatus }) => {
        if (updatedUserId === userId) {
          setStatus(newStatus);
        }
      };

      socket?.on('user_status_update', statusUpdateHandler);

      return () => {
        socket?.off('user_status_update', statusUpdateHandler);
      };
    }
  }, [userId, socket]);

  return <LiveStatusIndicator status={status} />;
};

RealtimeStatus.propTypes = {
  userId: PropTypes.string.isRequired,
};

export default RealtimeStatus;
