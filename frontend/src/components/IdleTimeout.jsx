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
// Cross-tab coordination. Only a timestamp and a logout marker are stored; no
// user data. Storage can be unavailable (private modes), so every access is guarded
// and the component then behaves as a single-tab timer.
const ACTIVITY_KEY = 'idle_last_activity';
const LOGOUT_KEY = 'idle_logout_at';

const readNumber = (key) => {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

const writeNumber = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage unavailable: fall back to per-tab behaviour.
  }
};

function IdleTimeout() {
  const { user, logout } = useSessionContext();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const countdownRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const logoutRef = useRef(logout);
  const loggingOutRef = useRef(false);

  // Keep logout ref current to avoid stale closures in setTimeout
  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  // Handle logout - defined before the scheduler to avoid hoisting issues.
  // `broadcast` is false when this tab is reacting to another tab's logout, which
  // has already ended the server session.
  const handleLogout = useCallback(async (broadcast = true) => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    clearTimers();
    setShowWarning(false);

    if (broadcast) writeNumber(LOGOUT_KEY, Date.now());

    // Perform logout using ref to ensure we have the latest function
    await logoutRef.current();
    window.location.replace('/login?idle=true');
  }, [clearTimers]);

  // (Re)arm the warning and logout timers from the most recent activity in ANY tab.
  // Timers are scheduled against the wall clock rather than a fixed 30 minutes, so
  // activity elsewhere pushes this tab's deadline out, and a deadline that already
  // passed (laptop asleep, throttled background tab) logs out immediately.
  const schedule = useCallback(() => {
    clearTimers();

    const lastActivity = Math.max(lastActivityRef.current, readNumber(ACTIVITY_KEY) || 0);
    lastActivityRef.current = lastActivity;
    const idleFor = Date.now() - lastActivity;
    const untilLogout = IDLE_TIMEOUT_MS - idleFor;

    if (untilLogout <= 0) {
      handleLogout();
      return;
    }

    const startCountdown = (seconds) => {
      setShowWarning(true);
      setSecondsRemaining(seconds);
      countdownRef.current = setInterval(() => {
        setSecondsRemaining(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const untilWarning = untilLogout - WARNING_BEFORE_MS;
    if (untilWarning <= 0) {
      startCountdown(Math.max(1, Math.ceil(untilLogout / 1000)));
    } else {
      setShowWarning(false);
      setSecondsRemaining(60);
      // Set warning timer (fires 1 minute before logout)
      warningTimeoutRef.current = setTimeout(() => startCountdown(60), untilWarning);
    }

    // Set logout timer. Re-check on firing: another tab may have been active since.
    timeoutRef.current = setTimeout(() => schedule(), untilLogout);
  }, [clearTimers, handleLogout]);

  // Record activity in this tab and tell the other tabs.
  const resetTimer = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    writeNumber(ACTIVITY_KEY, now);
    schedule();
  }, [schedule]);

  // Handle "Stay Logged In" click
  const handleStayLoggedIn = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  // Set up activity listeners
  useEffect(() => {
    if (!user) return;

    loggingOutRef.current = false;

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

    // Another tab was active, or logged out.
    const handleStorage = (event) => {
      if (event.key === ACTIVITY_KEY) {
        schedule();
      } else if (event.key === LOGOUT_KEY && event.newValue) {
        handleLogout(false);
      }
    };

    // Timers do not run reliably while a tab is hidden or the machine is asleep.
    // When the tab is looked at again, measure the idle time against the clock.
    const handleVisible = () => {
      if (document.visibilityState === 'visible') schedule();
    };

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);

    // Start initial timer. Loading the page counts as activity.
    resetTimer();

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
      clearTimers();
    };
  }, [user, resetTimer, schedule, handleLogout, clearTimers]);

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
              onClick={() => handleLogout()}
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
