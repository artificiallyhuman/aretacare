import React from 'react';
import { useNetworkStatus } from '../contexts/NetworkContext';

const NetworkStatusBanner = () => {
  const { error, showError, clearError, isOnline } = useNetworkStatus();

  if (!showError || !error) return null;

  const getIcon = () => {
    switch (error.type) {
      case 'network':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
        );
      case 'server':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        );
      case 'permission':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
    }
  };

  const getBgColor = () => {
    switch (error.type) {
      case 'network':
        return 'bg-yellow-500';
      case 'server':
        return 'bg-red-500';
      case 'permission':
        return 'bg-orange-500';
      default:
        return 'bg-red-500';
    }
  };

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 ${getBgColor()} text-white px-4 py-3 shadow-lg transform transition-transform duration-300 ${
        showError ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {getIcon()}
          <span className="font-medium">{error.message}</span>
          {error.type === 'network' && !isOnline && (
            <span className="text-sm opacity-90">(Waiting for connection...)</span>
          )}
        </div>
        {!error.persistent && (
          <button
            onClick={clearError}
            className="p-1 hover:bg-white/20 rounded transition"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {error.persistent && isOnline && (
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
};

export default NetworkStatusBanner;
