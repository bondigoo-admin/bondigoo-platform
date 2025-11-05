
import React, { createContext, useContext } from 'react';
import { useLiveSessionManager } from '../hooks/useLiveSessionManager';

const LiveSessionContext = createContext(null);

export const LiveSessionProvider = ({ children }) => {
  const liveSessionManager = useLiveSessionManager();

  return (
    <LiveSessionContext.Provider value={liveSessionManager}>
      {children}
    </LiveSessionContext.Provider>
  );
};

export const useLiveSession = () => {
  const context = useContext(LiveSessionContext);
  if (!context) {
    throw new Error('useLiveSession must be used within a LiveSessionProvider');
  }
  return context;
};
