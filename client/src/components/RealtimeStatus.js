
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useNotificationSocket } from '../contexts/SocketContext';
import { getUserStatus } from '../services/statusAPI'; 
import LiveStatusIndicator from './LiveStatusIndicator';

const RealtimeStatus = ({ userId }) => {
  const [status, setStatus] = useState('offline');
  const { socket } = useNotificationSocket();

 useEffect(() => {
    const fetchInitialStatus = async () => {
      try {
        const initialStatus = await getUserStatus(userId);
        setStatus(initialStatus || 'offline');
      } catch (error) {
        console.error(`Failed to fetch initial status for user ${userId}`, error);
        setStatus('offline');
      }
    };

    if (userId) {
      fetchInitialStatus();

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
