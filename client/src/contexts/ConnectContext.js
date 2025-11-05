import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { logger } from '../utils/logger';

const ConnectContext = createContext(null);

const initialState = {
  accountStatus: null,
  isLoading: false,
  error: null,
  lastChecked: null,
  dashboardLink: null
};

const connectReducer = (state, action) => {
  switch (action.type) {
    case 'FETCH_STATUS_START':
      return { ...state, isLoading: true, error: null };
    
    case 'FETCH_STATUS_SUCCESS':
      return {
        ...state,
        isLoading: false,
        accountStatus: action.payload,
        lastChecked: new Date().toISOString(),
        error: null
      };

      case 'FETCH_DASHBOARD_LINK_START':
  return {
    ...state,
    isLoading: true,
    error: null
  };
case 'FETCH_DASHBOARD_LINK_SUCCESS':
  return {
    ...state,
    isLoading: false,
    dashboardLink: action.payload
  };
case 'FETCH_DASHBOARD_LINK_ERROR':
  return {
    ...state,
    isLoading: false,
    error: action.payload
  };
    
    case 'FETCH_STATUS_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload
      };
    
    case 'CLEAR_ERROR':
      return { ...state, error: null };

      case 'CREATE_ACCOUNT_START':
  return { ...state, isLoading: true, error: null };

case 'CREATE_ACCOUNT_SUCCESS':
  return {
    ...state,
    isLoading: false,
    redirectUrl: action.payload.redirectUrl,
    error: null
  };

case 'CREATE_ACCOUNT_ERROR':
  return {
    ...state,
    isLoading: false,
    error: action.payload
  };
    
    default:
      return state;
  }
};

export const ConnectProvider = ({ children }) => {
  const [state, dispatch] = useReducer(connectReducer, initialState);

  logger.debug('[ConnectContext] Current state:', {
    hasAccount: !!state.accountStatus,
    isLoading: state.isLoading,
    hasError: !!state.error,
    lastChecked: state.lastChecked
  });

  return (
    <ConnectContext.Provider value={[state, dispatch]}>
      {children}
    </ConnectContext.Provider>
  );
};

export const useConnectContext = () => {
  const context = useContext(ConnectContext);
  if (!context) {
    throw new Error('useConnectContext must be used within a ConnectProvider');
  }
  return context;
};