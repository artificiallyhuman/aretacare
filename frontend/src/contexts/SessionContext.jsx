import React, { createContext, useContext, useState, useEffect } from 'react';
import { sessionAPI, authAPI, initAuth, clearAccessToken } from '../services/api';

const SessionContext = createContext();

export const useSessionContext = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return context;
};

export const SessionProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize user and sessions
  useEffect(() => {
    const initializeSession = async () => {
      try {
        // Try to restore auth from HttpOnly refresh token cookie
        const isLoggedIn = await initAuth();
        if (!isLoggedIn) {
          setLoading(false);
          return;
        }

        // Get user info
        let userData;
        try {
          const userResponse = await authAPI.getMe();
          userData = userResponse.data;
          setUser(userData);
        } catch (err) {
          // Token invalid, clear auth data
          await authAPI.logout();
          setLoading(false);
          return;
        }

        // Get all sessions for user
        const sessionsResponse = await sessionAPI.list();
        const userSessions = sessionsResponse.data;
        setSessions(userSessions);

        // Priority order for determining active session:
        // 1. User's last_active_session_id (persisted on backend)
        // 2. localStorage saved session (client-side cache)
        // 3. Most recent session by last_activity
        let sessionToActivate = null;

        // Clean up any stale session ID from localStorage if it's not in the user's sessions
        const savedSessionId = localStorage.getItem('active_session_id');
        if (savedSessionId && !userSessions.find(s => s.id === savedSessionId)) {
          localStorage.removeItem('active_session_id');
        }

        // Check if user's last active session exists
        if (userData.last_active_session_id && userSessions.find(s => s.id === userData.last_active_session_id)) {
          sessionToActivate = userData.last_active_session_id;
        } else {
          // Try localStorage as fallback (only if it wasn't just removed as stale)
          const currentSavedId = localStorage.getItem('active_session_id');
          if (currentSavedId && userSessions.find(s => s.id === currentSavedId)) {
            sessionToActivate = currentSavedId;
          } else if (userSessions.length > 0) {
            // Use the most recent session
            const mostRecent = userSessions.reduce((latest, session) => {
              return new Date(session.last_activity) > new Date(latest.last_activity)
                ? session
                : latest;
            }, userSessions[0]);
            sessionToActivate = mostRecent.id;
          }
        }

        if (sessionToActivate) {
          setActiveSessionId(sessionToActivate);
          localStorage.setItem('active_session_id', sessionToActivate);
        }

        // Auto-assign colors if user has 2+ sessions and any lack a color_key
        if (userSessions.length >= 2) {
          const needsColors = userSessions.some(s => !s.color_key);
          if (needsColors) {
            try {
              const colorResponse = await sessionAPI.autoAssignColors();
              const colorMap = colorResponse.data.colors;
              if (colorMap && Object.keys(colorMap).length > 0) {
                // Update sessions with assigned colors
                const updatedSessions = userSessions.map(s => ({
                  ...s,
                  color_key: colorMap[s.id] || s.color_key
                }));
                setSessions(updatedSessions);
              }
            } catch (err) {
              console.error('Failed to auto-assign session colors:', err);
              // Non-critical, don't block loading
            }
          }
        }

        if (!sessionToActivate && userSessions.length === 0) {
          // No sessions exist - auto-create one for the user
          // This handles users who registered before auto-session creation was added
          try {
            const response = await sessionAPI.create('Session 1');
            const newSession = response.data;
            setSessions([newSession]);
            setActiveSessionId(newSession.id);
            localStorage.setItem('active_session_id', newSession.id);
          } catch (err) {
            console.error('Failed to auto-create session:', err);
            setError('Failed to create initial session');
          }
        }
      } catch (err) {
        console.error('Failed to initialize session:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initializeSession();
  }, []);

  // Note: Cross-tab logout is handled via periodic session validation
  // since access tokens are now stored in memory (not localStorage)

  // Periodic session validation to detect "logout everywhere" from other devices
  useEffect(() => {
    if (!user) return;

    const SESSION_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes

    const checkSession = async () => {
      try {
        const response = await authAPI.checkSessionValid();
        if (response.data.valid === false) {
          // Session has been revoked (e.g., via "logout everywhere" on another device)
          setUser(null);
          setSessions([]);
          setActiveSessionId(null);
          clearAccessToken();
          localStorage.removeItem('active_session_id');
          window.location.replace('/login');
        }
      } catch (err) {
        // If we get a 401, the access token is invalid - the interceptor will handle it
        // For other errors, just log and continue - don't log user out on network issues
        if (err.response?.status !== 401) {
          console.error('Session validation failed:', err);
        }
      }
    };

    // Run immediately on mount
    checkSession();

    // Then run periodically
    const intervalId = setInterval(checkSession, SESSION_CHECK_INTERVAL);

    return () => clearInterval(intervalId);
  }, [user]);

  const createSession = async (name = null) => {
    try {
      const response = await sessionAPI.create(name);
      const newSession = response.data;

      // Add to sessions list
      const updatedSessions = [newSession, ...sessions];
      setSessions(updatedSessions);

      // Switch to the new session
      setActiveSessionId(newSession.id);
      localStorage.setItem('active_session_id', newSession.id);

      // Auto-assign colors if user now has 2+ sessions
      if (updatedSessions.length >= 2) {
        try {
          const colorResponse = await sessionAPI.autoAssignColors();
          const colorMap = colorResponse.data.colors;
          if (colorMap && Object.keys(colorMap).length > 0) {
            setSessions(prev => prev.map(s => ({
              ...s,
              color_key: colorMap[s.id] || s.color_key
            })));
          }
        } catch (err) {
          console.error('Failed to auto-assign session colors:', err);
        }
      }

      return newSession;
    } catch (err) {
      // Check if it's the 5-session limit error
      if (err.response?.status === 400) {
        throw new Error(err.response.data.detail || 'Failed to create session');
      }
      throw err;
    }
  };

  const switchSession = async (sessionId) => {
    setActiveSessionId(sessionId);
    localStorage.setItem('active_session_id', sessionId);

    // Notify backend to update user's last_active_session_id
    try {
      await sessionAPI.get(sessionId);
    } catch (err) {
      console.error('Failed to update last active session on backend:', err);
      // Non-critical error, don't throw
    }
  };

  const renameSession = async (sessionId, newName) => {
    try {
      const response = await sessionAPI.rename(sessionId, newName);
      const updatedSession = response.data;

      // Update in sessions list
      setSessions(prev =>
        prev.map(s => (s.id === sessionId ? updatedSession : s))
      );

      return updatedSession;
    } catch (err) {
      throw err;
    }
  };

  const deleteSession = async (sessionId) => {
    try {
      await sessionAPI.delete(sessionId);

      // Remove from sessions list
      const remainingSessions = sessions.filter(s => s.id !== sessionId);
      setSessions(remainingSessions);

      // If we deleted the active session, switch to another one or create new
      if (sessionId === activeSessionId) {
        if (remainingSessions.length > 0) {
          // Prefer owned sessions over collaboration sessions
          const ownedSessions = remainingSessions.filter(s => s.is_owner);
          const sessionsToChooseFrom = ownedSessions.length > 0 ? ownedSessions : remainingSessions;

          // Switch to the most recent session (preferring owned)
          const mostRecent = sessionsToChooseFrom.reduce((latest, session) => {
            return new Date(session.last_activity) > new Date(latest.last_activity)
              ? session
              : latest;
          }, sessionsToChooseFrom[0]);

          setActiveSessionId(mostRecent.id);
          localStorage.setItem('active_session_id', mostRecent.id);
        } else {
          // No sessions left - auto-create a new one
          try {
            const response = await sessionAPI.create('Session 1');
            const newSession = response.data;
            setSessions([newSession]);
            setActiveSessionId(newSession.id);
            localStorage.setItem('active_session_id', newSession.id);
          } catch (createErr) {
            console.error('Failed to auto-create session after deletion:', createErr);
            setActiveSessionId(null);
            localStorage.removeItem('active_session_id');
          }
        }
      }
    } catch (err) {
      throw err;
    }
  };

  const refreshSessions = async () => {
    try {
      const response = await sessionAPI.list();
      setSessions(response.data);
    } catch (err) {
      console.error('Failed to refresh sessions:', err);
    }
  };

  const setSessionColor = async (sessionId, colorKey, swapWithSessionId = null) => {
    const response = await sessionAPI.setColor(sessionId, colorKey, swapWithSessionId);
    // Refresh sessions to get updated color data
    await refreshSessions();
    return response;
  };

  const logout = async () => {
    await authAPI.logout();
    setUser(null);
    setSessions([]);
    setActiveSessionId(null);
    localStorage.removeItem('active_session_id');
  };

  const value = {
    user,
    setUser,
    sessions,
    activeSessionId,
    activeSession: sessions.find(s => s.id === activeSessionId) || null,
    loading,
    error,
    createSession,
    switchSession,
    renameSession,
    deleteSession,
    refreshSessions,
    setSessionColor,
    logout,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};
