import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { setGlobalErrorHandler } from '../services/api';
import { isAbortError } from '../utils/requestUtils';

const NetworkContext = createContext();

export const useNetworkStatus = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetworkStatus must be used within a NetworkProvider');
  }
  return context;
};

export const NetworkProvider = ({ children }) => {
  // Default to online for hydration stability — the actual navigator.onLine
  // is checked in the effect below. Prerendered HTML and the first client
  // render both start at "online"; any offline state arrives after mount.
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState(null);
  const [showError, setShowError] = useState(false);

  // Mirrors `error` so the online/offline effect can read the latest value
  // without depending on it — depending on it re-registered the window
  // listeners on every error change
  const errorRef = useRef(null);
  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  // Auto-hide/clear timers. Cancelled before each new error so a second error
  // raised 4s after the first shows for its full 5s instead of 1s, and on
  // unmount so a timer can't fire on a gone component.
  const hideTimerRef = useRef(null);
  const clearTimerRef = useRef(null);
  const cancelTimers = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    clearTimeout(clearTimerRef.current);
  }, []);
  useEffect(() => cancelTimers, [cancelTimers]);

  // Clear error
  const clearError = useCallback(() => {
    cancelTimers();
    setShowError(false);
    clearTimerRef.current = setTimeout(() => setError(null), 300);
  }, [cancelTimers]);

  // Handle online/offline events
  useEffect(() => {
    // Sync to the real value after mount (was deferred for hydration safety).
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsOnline(false);
    }

    const handleOnline = () => {
      setIsOnline(true);
      // Clear error when back online
      if (errorRef.current?.type === 'network') {
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
  }, [clearError]);

  // Show an error message
  const showErrorMessage = useCallback((message, type = 'error', persistent = false) => {
    cancelTimers();
    setError({ message, type, persistent });
    setShowError(true);

    // Auto-hide non-persistent errors after 5 seconds
    if (!persistent) {
      hideTimerRef.current = setTimeout(() => {
        setShowError(false);
        clearTimerRef.current = setTimeout(() => setError(null), 300); // Clear after fade out
      }, 5000);
    }
  }, [cancelTimers]);

  // Handle API errors (called from axios interceptor)
  const handleApiError = useCallback((error) => {
    // Ignore cancelled/aborted requests - these are intentional user actions
    if (isAbortError(error)) {
      return;
    }

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

  const value = useMemo(() => ({
    isOnline,
    error,
    showError,
    showErrorMessage,
    clearError,
    handleApiError,
  }), [isOnline, error, showError, showErrorMessage, clearError, handleApiError]);

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
};
