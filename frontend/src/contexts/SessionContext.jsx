import React, { createContext, useContext, useState, useEffect } from 'react';
import { sessionAPI, authAPI } from '../services/api';

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
        // Check if user is authenticated
        const token = localStorage.getItem('auth_token');
        if (!token) {
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
          authAPI.logout();
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

        // Check if user's last active session exists
        if (userData.last_active_session_id && userSessions.find(s => s.id === userData.last_active_session_id)) {
          sessionToActivate = userData.last_active_session_id;
        } else {
          // Try localStorage as fallback
          const savedSessionId = localStorage.getItem('active_session_id');
          if (savedSessionId && userSessions.find(s => s.id === savedSessionId)) {
            sessionToActivate = savedSessionId;
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
        } else if (userSessions.length === 0) {
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

  const createSession = async (name = null) => {
    try {
      const response = await sessionAPI.create(name);
      const newSession = response.data;

      // Add to sessions list
      setSessions(prev => [newSession, ...prev]);

      // Switch to the new session
      setActiveSessionId(newSession.id);
      localStorage.setItem('active_session_id', newSession.id);

      return newSession;
    } catch (err) {
      // Check if it's the 3-session limit error
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

      // If we deleted the active session, switch to another one or null
      if (sessionId === activeSessionId) {
        if (remainingSessions.length > 0) {
          // Switch to the most recent remaining session
          const mostRecent = remainingSessions.reduce((latest, session) => {
            return new Date(session.last_activity) > new Date(latest.last_activity)
              ? session
              : latest;
          }, remainingSessions[0]);

          setActiveSessionId(mostRecent.id);
          localStorage.setItem('active_session_id', mostRecent.id);
        } else {
          // No sessions left
          setActiveSessionId(null);
          localStorage.removeItem('active_session_id');
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

  const logout = () => {
    authAPI.logout();
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
    logout,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};
