import React from 'react';
import { useTranslation } from 'react-i18next';

const ConfirmDialog = ({ isOpen, onClose, onConfirm, message }) => {
  const { t } = useTranslation(['common', 'admin']);

  if (!isOpen) return null;

  return (
    <div className="confirm-dialog-overlay">
      <div className="confirm-dialog">
        <p>{message}</p>
        <div className="confirm-dialog-actions">
          <button onClick={onConfirm}>{t('common:confirm')}</button>
          <button onClick={onClose}>{t('common:cancel')}</button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;