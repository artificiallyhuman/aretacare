import { useState, useEffect } from 'react';
import { sessionAPI, authAPI } from '../services/api';

export const useSession = () => {
  const [sessionId, setSessionId] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initSession = async () => {
      try {
        // Check if user is authenticated
        const token = localStorage.getItem('auth_token');
        if (!token) {
          setLoading(false);
          return;
        }

        // Get user info
        try {
          const userResponse = await authAPI.getMe();
          setUser(userResponse.data);
        } catch (err) {
          // Token invalid, clear auth data
          authAPI.logout();
          setLoading(false);
          return;
        }

        // Check for existing session in localStorage
        const existingSessionId = localStorage.getItem('aretacare_session_id');

        if (existingSessionId) {
          // Verify session is still valid
          try {
            await sessionAPI.get(existingSessionId);
            setSessionId(existingSessionId);
          } catch (err) {
            // Session invalid, create new one
            const response = await sessionAPI.create();
            const newSessionId = response.data.id;
            localStorage.setItem('aretacare_session_id', newSessionId);
            setSessionId(newSessionId);
          }
        } else {
          // Create new session
          const response = await sessionAPI.create();
          const newSessionId = response.data.id;
          localStorage.setItem('aretacare_session_id', newSessionId);
          setSessionId(newSessionId);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initSession();
  }, []);

  const clearSession = async () => {
    if (sessionId) {
      try {
        await sessionAPI.cleanup(sessionId);
        localStorage.removeItem('aretacare_session_id');

        // Create new session
        const response = await sessionAPI.create();
        const newSessionId = response.data.id;
        localStorage.setItem('aretacare_session_id', newSessionId);
        setSessionId(newSessionId);
      } catch (err) {
        setError(err.message);
      }
    }
  };

  const logout = () => {
    authAPI.logout();
    setUser(null);
    setSessionId(null);
  };

  return { sessionId, user, loading, error, clearSession, logout };
};
