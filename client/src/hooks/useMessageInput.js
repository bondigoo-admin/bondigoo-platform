import { useState, useCallback } from 'react';

export const useMessageInput = () => {
  const [showMessage, setShowMessage] = useState(false);
  const [message, setMessage] = useState('');

  const toggleMessageInput = useCallback(() => {
    setShowMessage(prev => !prev);
  }, []);

  const handleMessageChange = useCallback((e) => {
    setMessage(e.target.value);
  }, []);

  return {
    showMessage,
    message,
    toggleMessageInput,
    handleMessageChange,
    setShowMessage
  };
};