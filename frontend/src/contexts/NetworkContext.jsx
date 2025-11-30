import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setGlobalErrorHandler } from '../services/api';

const NetworkContext = createContext();

export const useNetworkStatus = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetworkStatus must be used within a NetworkProvider');
  }
  return context;
};

export const NetworkProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState(null);
  const [showError, setShowError] = useState(false);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Clear error when back online
      if (error?.type === 'network') {
        clearError();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setError({
        type: 'network',
        message: 'You are offline. Please check your internet connection.',
        persistent: true
      });
      setShowError(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [error]);

  // Show an error message
  const showErrorMessage = useCallback((message, type = 'error', persistent = false) => {
    setError({ message, type, persistent });
    setShowError(true);

    // Auto-hide non-persistent errors after 5 seconds
    if (!persistent) {
      setTimeout(() => {
        setShowError(false);
        setTimeout(() => setError(null), 300); // Clear after fade out
      }, 5000);
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setShowError(false);
    setTimeout(() => setError(null), 300);
  }, []);

  // Handle API errors (called from axios interceptor)
  const handleApiError = useCallback((error) => {
    if (!error.response) {
      // Network error - no response received
      showErrorMessage(
        'Unable to connect to the server. Please check your internet connection.',
        'network',
        true
      );
    } else if (error.response.status >= 500) {
      // Server error
      showErrorMessage(
        'Server error. Please try again in a moment.',
        'server',
        false
      );
    } else if (error.response.status === 401) {
      // Unauthorized - token expired or invalid
      // Don't show error, let the auth flow handle it
      return;
    } else if (error.response.status === 403) {
      // Forbidden - only show for user-initiated actions, not background requests
      // Background requests like daily-plans/check should fail silently
      const url = error.config?.url || '';
      const isBackgroundRequest = url.includes('/check') ||
                                   url.includes('/latest') ||
                                   url.includes('/admin/');
      if (!isBackgroundRequest) {
        showErrorMessage(
          'You do not have permission to perform this action.',
          'permission',
          false
        );
      }
    }
    // For other errors (4xx), let the component handle it
  }, [showErrorMessage]);

  // Register the error handler with axios
  useEffect(() => {
    setGlobalErrorHandler(handleApiError);
    return () => setGlobalErrorHandler(null);
  }, [handleApiError]);

  const value = {
    isOnline,
    error,
    showError,
    showErrorMessage,
    clearError,
    handleApiError,
  };

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
};
