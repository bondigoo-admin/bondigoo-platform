import React, { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../contexts/AuthContext';
import { useNotificationSocket } from '../contexts/SocketContext';
import { emitEvent } from '../services/socketService';
import { updateUserStatus } from '../services/statusAPI';
import { cn } from '../lib/utils';
import { DropdownMenuItem, DropdownMenuLabel } from './ui/dropdown-menu.tsx';
import { Check } from 'lucide-react';

const StatusControlMenu = () => {
  const { t } = useTranslation(['common', 'availability']);
  const { user, updateUser } = useContext(AuthContext);
  const { socket } = useNotificationSocket();
  const [selectedStatus, setSelectedStatus] = useState(user?.status || 'offline');

  useEffect(() => {
    if (user?.status) {
      setSelectedStatus(user.status);
    }
  }, [user?.status]);

  const handleStatusChange = async (newStatus) => {
    setSelectedStatus(newStatus);
    if (!user || user.status === newStatus) return;

    try {
      const updatedUser = await updateUserStatus(user._id, newStatus);
      emitEvent(socket, 'status_update', { userId: user._id, status: newStatus });
      if (updateUser) {
        updateUser({ ...user, status: newStatus });
      }
    } catch (error) {
      console.error('Error updating status:', error);
      setSelectedStatus(user.status);
    }
  };

  const statuses = {
    online: { label: t('availability:online'), classes: 'bg-green-500' },
    on_break: { label: t('availability:on_break', 'On a Break'), classes: 'bg-yellow-500' },
    busy: { label: t('availability:busy'), classes: 'bg-red-500' },
    offline: { label: t('availability:offline'), classes: 'bg-gray-500' },
  };

  return (
    <>
      <DropdownMenuLabel>{t('availability:status', 'Status')}</DropdownMenuLabel>
      {Object.entries(statuses).map(([statusKey, statusValue]) => (
        <DropdownMenuItem key={statusKey} onSelect={(e) => { e.preventDefault(); handleStatusChange(statusKey); }} className="cursor-pointer">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <div className={cn('w-2 h-2 rounded-full', statusValue.classes)} />
              <span>{statusValue.label}</span>
            </div>
            {selectedStatus === statusKey && <Check className="h-4 w-4" />}
          </div>
        </DropdownMenuItem>
      ))}
    </>
  );
};

export default StatusControlMenu;