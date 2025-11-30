import React, { createContext, useContext, useState, useEffect } from 'react';
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

      // Use user-specific cache key to avoid stale values across accounts
      const cacheKey = `isAdmin_${user.id}`;

      // Check sessionStorage first for cached admin status
      const cachedStatus = sessionStorage.getItem(cacheKey);
      if (cachedStatus !== null) {
        setIsAdmin(cachedStatus === 'true');
        setLoading(false);
        // Still check in background to catch config changes
        adminAPI.checkAdmin().then(response => {
          const adminStatus = response.data.is_admin;
          if (adminStatus !== (cachedStatus === 'true')) {
            setIsAdmin(adminStatus);
            sessionStorage.setItem(cacheKey, adminStatus.toString());
          }
        }).catch(() => {});
        return;
      }

      try {
        const response = await adminAPI.checkAdmin();
        const adminStatus = response.data.is_admin;
        setIsAdmin(adminStatus);
        sessionStorage.setItem(cacheKey, adminStatus.toString());
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [user]);

  // Clear cached admin status on logout
  useEffect(() => {
    if (!user) {
      // Clear all isAdmin cache keys
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('isAdmin')) {
          sessionStorage.removeItem(key);
        }
      });
    }
  }, [user]);

  return (
    <AdminContext.Provider value={{ isAdmin, loading }}>
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
