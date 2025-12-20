import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSessionContext } from '../contexts/SessionContext';

// Idle timeout configuration
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_MS = 60 * 1000; // Show warning 1 minute before timeout

/**
 * IdleTimeout Component
 *
 * Monitors user activity and logs out after 30 minutes of inactivity.
 * Shows a warning modal 1 minute before automatic logout.
 *
 * Activity events tracked: mouse movement, keyboard, clicks, touch, scroll
 */
function IdleTimeout() {
  const { user, logout } = useSessionContext();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const countdownRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const logoutRef = useRef(logout);

  // Keep logout ref current to avoid stale closures in setTimeout
  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  // Handle logout - defined before resetTimer to avoid hoisting issues
  const handleLogout = useCallback(async () => {
    // Clear all timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    setShowWarning(false);

    // Perform logout using ref to ensure we have the latest function
    await logoutRef.current();
    window.location.replace('/login?idle=true');
  }, []);

  // Reset the idle timer
  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    // Clear existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    // Hide warning if showing
    setShowWarning(false);
    setSecondsRemaining(60);

    // Set warning timer (fires 1 minute before logout)
    warningTimeoutRef.current = setTimeout(() => {
      setShowWarning(true);
      setSecondsRemaining(60);

      // Start countdown
      countdownRef.current = setInterval(() => {
        setSecondsRemaining(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);

    // Set logout timer
    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, IDLE_TIMEOUT_MS);
  }, [handleLogout]);

  // Handle "Stay Logged In" click
  const handleStayLoggedIn = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  // Set up activity listeners
  useEffect(() => {
    if (!user) return;

    // Activity events to monitor
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];

    // Throttle activity detection to avoid excessive resets
    let lastReset = 0;
    const throttleMs = 1000; // Only reset once per second max

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastReset > throttleMs) {
        lastReset = now;
        resetTimer();
      }
    };

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Start initial timer
    resetTimer();

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [user, resetTimer]);

  // Don't render anything if user is not logged in or warning not showing
  if (!user || !showWarning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="text-center">
          {/* Warning Icon */}
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900 mb-4">
            <svg className="h-6 w-6 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Session Timeout Warning
          </h3>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            You've been inactive for a while. For your security, you'll be logged out in{' '}
            <span className="font-bold text-yellow-600 dark:text-yellow-400">
              {secondsRemaining} second{secondsRemaining !== 1 ? 's' : ''}
            </span>.
          </p>

          <div className="flex gap-3 justify-center">
            <button
              onClick={handleStayLoggedIn}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
            >
              Stay Logged In
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Log Out Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IdleTimeout;
