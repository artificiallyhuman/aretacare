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

        // Get or create primary session (one long-running session per user)
        const response = await sessionAPI.getPrimary();
        const primarySessionId = response.data.id;
        localStorage.setItem('aretacare_session_id', primarySessionId);
        setSessionId(primarySessionId);
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
        // Delete the entire session (conversations + journal entries)
        await sessionAPI.delete(sessionId);
        // Clear session ID from localStorage
        localStorage.removeItem('aretacare_session_id');
        // Reload to create a fresh new session
        window.location.reload();
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

  return { sessionId, user, setUser, loading, error, clearSession, logout };
};
