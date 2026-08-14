import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { adminAPI } from '../services/api';
import { useSessionContext } from './SessionContext';

const AdminContext = createContext(null);

export function AdminProvider({ children }) {
  const { user } = useSessionContext();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Always verify admin status with server - no client-side caching
      // Admin authorization must be verified server-side on every check
      try {
        const response = await adminAPI.checkAdmin();
        setIsAdmin(response.data.is_admin);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [user]);

  const value = useMemo(() => ({ isAdmin, loading }), [isAdmin, loading]);

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}
