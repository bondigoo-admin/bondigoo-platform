import React from 'react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';

export const useToast = () => {
  const [toasts, setToasts] = useState([]);
  const toastTimeouts = useRef(new Map());

  const removeToast = useCallback((id) => {
    setToasts(currentToasts => currentToasts.filter(toast => toast.id !== id));
    if (toastTimeouts.current.has(id)) {
      clearTimeout(toastTimeouts.current.get(id));
      toastTimeouts.current.delete(id);
    }
  }, []);

  const showToast = useCallback(({ type = 'info', message, duration = 5000 }) => {
    const id = Date.now().toString();
    const newToast = { id, type, message };
    
    setToasts(currentToasts => [...currentToasts, newToast]);
    
    const timeout = setTimeout(() => {
      removeToast(id);
    }, duration);
    
    toastTimeouts.current.set(id, timeout);
    
    return id;
  }, [removeToast]);

  useEffect(() => {
    return () => {
      toastTimeouts.current.forEach(timeout => clearTimeout(timeout));
      toastTimeouts.current.clear();
    };
  }, []);

  const ToastContainer = useCallback(() => {
    return (
      <div className="fixed top-0 left-1/2 -translate-x-1/2 mt-20 z-50">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-2"
            >
              <div className={`
                flex items-center p-4 rounded-lg shadow-lg min-w-[300px] max-w-md mx-auto
                ${toast.type === 'success' && 'bg-green-100 text-green-800'}
                ${toast.type === 'error' && 'bg-red-100 text-red-800'}
                ${toast.type === 'warning' && 'bg-yellow-100 text-yellow-800'}
                ${toast.type === 'info' && 'bg-blue-100 text-blue-800'}
              `}>
                {toast.type === 'success' && <CheckCircle className="w-5 h-5 mr-3" />}
                {toast.type === 'error' && <XCircle className="w-5 h-5 mr-3" />}
                {toast.type === 'warning' && <AlertCircle className="w-5 h-5 mr-3" />}
                {toast.type === 'info' && <Info className="w-5 h-5 mr-3" />}
                <p className="flex-1">{toast.message}</p>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="ml-4 text-gray-500 hover:text-gray-700"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  }, [toasts, removeToast]);

  return { showToast, ToastContainer };
};