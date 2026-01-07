import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI, sessionAPI, mfaAPI } from '../services/api';
import { useSessionContext } from '../contexts/SessionContext';
import { formatLocalDate } from '../utils/dateUtils';
import SensitiveActionModal from '../components/mfa/SensitiveActionModal';

export default function Settings() {
  const navigate = useNavigate();
  const { user, setUser, sessions, activeSessionId, deleteSession, renameSession, refreshSessions } = useSessionContext();

  // Session statistics - map of sessionId to statistics
  const [sessionStatistics, setSessionStatistics] = useState({});
  const [loadingStats, setLoadingStats] = useState({});
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editingSessionName, setEditingSessionName] = useState('');

  // Form states
  const [nameForm, setNameForm] = useState({
    name: user?.name || '',
    password: '',
  });
  const [emailForm, setEmailForm] = useState({
    email: user?.email || '',
    password: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [deleteForm, setDeleteForm] = useState({
    password: '',
    confirmText: '',
  });

  // Password visibility states
  const [showPasswords, setShowPasswords] = useState({
    namePassword: false,
    emailPassword: false,
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
    deletePassword: false,
  });

  // Loading and error states
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState({});

  // Section expansion states
  const [expandedSection, setExpandedSection] = useState(null);
  const [expandedSessionId, setExpandedSessionId] = useState(null);

  // Confirmation modals
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [accountDeleteConfirm, setAccountDeleteConfirm] = useState(false);

  // MFA status
  const [mfaStatus, setMfaStatus] = useState(null);
  const [mfaLoading, setMfaLoading] = useState(true);

  // MFA verification for sensitive actions
  const [mfaActionModal, setMfaActionModal] = useState(null); // 'password_change', 'email_change', 'account_delete'
  const [mfaActionToken, setMfaActionToken] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  // Active devices count
  const [devicesCount, setDevicesCount] = useState(null);

  // Fetch all session statistics on mount
  useEffect(() => {
    const fetchAllStatistics = async () => {
      for (const session of sessions) {
        setLoadingStats((prev) => ({ ...prev, [session.id]: true }));
        try {
          const response = await sessionAPI.getStatistics(session.id);
          setSessionStatistics((prev) => ({ ...prev, [session.id]: response.data }));
        } catch (error) {
          console.error(`Failed to fetch statistics for session ${session.id}:`, error);
        } finally {
          setLoadingStats((prev) => ({ ...prev, [session.id]: false }));
        }
      }
    };

    if (sessions.length > 0) {
      fetchAllStatistics();
    }
  }, [sessions]);

  // Fetch MFA status on mount
  useEffect(() => {
    const fetchMfaStatus = async () => {
      try {
        const response = await mfaAPI.getStatus();
        setMfaStatus(response.data);
      } catch (error) {
        console.error('Failed to fetch MFA status:', error);
      } finally {
        setMfaLoading(false);
      }
    };
    fetchMfaStatus();
  }, []);

  // Fetch active devices count on mount
  useEffect(() => {
    const fetchDevicesCount = async () => {
      try {
        const response = await authAPI.getDevicesCount();
        setDevicesCount(response.data.count);
      } catch (error) {
        console.error('Failed to fetch devices count:', error);
      }
    };
    fetchDevicesCount();
  }, []);

  const clearMessages = (section) => {
    setErrors((prev) => ({ ...prev, [section]: null }));
    setSuccess((prev) => ({ ...prev, [section]: null }));
  };

  const handleUpdateName = async (e) => {
    e.preventDefault();
    clearMessages('name');
    setLoading((prev) => ({ ...prev, name: true }));

    try {
      const response = await authAPI.updateName(nameForm.name, nameForm.password);
      const updatedUser = response.data;
      setUser(updatedUser);
      setSuccess((prev) => ({ ...prev, name: 'Name updated successfully' }));
      setNameForm({ ...nameForm, password: '' });
      // Refresh page to update name in header
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        name: error.response?.data?.detail || 'Failed to update name',
      }));
    } finally {
      setLoading((prev) => ({ ...prev, name: false }));
    }
  };

  const handleUpdateEmail = async (e, actionToken = null) => {
    e?.preventDefault();
    clearMessages('email');

    // If MFA is enabled and we don't have an action token, show the MFA modal
    if (mfaStatus?.mfa_enabled && !actionToken) {
      setPendingAction({ type: 'email' });
      setMfaActionModal('email_change');
      return;
    }

    setLoading((prev) => ({ ...prev, email: true }));

    try {
      // Create config with action token header if provided
      const config = actionToken ? { headers: { 'X-MFA-Action-Token': actionToken } } : {};

      const response = await authAPI.updateEmail(emailForm.email, emailForm.password, config);
      // Email change now requires verification - show pending message
      setSuccess((prev) => ({
        ...prev,
        email: response.data.message || 'Verification email sent. Please check your new email to complete the change.'
      }));
      setEmailForm({ email: '', password: '' });
      setMfaActionToken(null);

      // Log out user after showing success message for security
      if (response.data.logout) {
        setTimeout(async () => {
          await authAPI.logout();
          window.location.href = '/login';
        }, 3000);
      }
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        email: error.response?.data?.detail || 'Failed to request email change',
      }));
    } finally {
      setLoading((prev) => ({ ...prev, email: false }));
    }
  };

  const handleUpdatePassword = async (e, actionToken = null) => {
    e?.preventDefault();
    clearMessages('password');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setErrors((prev) => ({ ...prev, password: 'New passwords do not match' }));
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setErrors((prev) => ({ ...prev, password: 'Password must be at least 8 characters' }));
      return;
    }

    // If MFA is enabled and we don't have an action token, show the MFA modal
    if (mfaStatus?.mfa_enabled && !actionToken) {
      setPendingAction({ type: 'password' });
      setMfaActionModal('password_change');
      return;
    }

    setLoading((prev) => ({ ...prev, password: true }));

    try {
      // Create config with action token header if provided
      const config = actionToken ? { headers: { 'X-MFA-Action-Token': actionToken } } : {};

      const response = await authAPI.updatePassword(passwordForm.currentPassword, passwordForm.newPassword, config);
      setSuccess((prev) => ({ ...prev, password: response.data.message || 'Password updated successfully' }));
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMfaActionToken(null);

      // Log out user after password change for security
      if (response.data.logout) {
        setTimeout(async () => {
          await authAPI.logout();
          window.location.href = '/login';
        }, 2000);
      }
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        password: error.response?.data?.detail || 'Failed to update password',
      }));
    } finally {
      setLoading((prev) => ({ ...prev, password: false }));
    }
  };

  const handleLogoutEverywhere = async () => {
    setLoading((prev) => ({ ...prev, security: true }));
    clearMessages('security');

    try {
      const response = await authAPI.logoutEverywhere();
      setSuccess((prev) => ({ ...prev, security: response.data.message || 'Logged out of all sign-ins' }));

      // Log out current session after a short delay
      setTimeout(async () => {
        await authAPI.logout();
        window.location.href = '/login';
      }, 2000);
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        security: error.response?.data?.detail || 'Failed to logout everywhere',
      }));
    } finally {
      setLoading((prev) => ({ ...prev, security: false }));
    }
  };

  const handleDeleteSession = (sessionId) => {
    const session = sessions.find(s => s.id === sessionId);
    const stats = sessionStatistics[sessionId];
    setSessionToDelete({ session, stats });
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return;

    const sessionId = sessionToDelete.session.id;
    clearMessages(`session-${sessionId}`);
    setLoading((prev) => ({ ...prev, [`session-${sessionId}`]: true }));

    try {
      await deleteSession(sessionId);
      setSuccess((prev) => ({ ...prev, sessions: 'Session deleted successfully' }));
      setSessionToDelete(null);
      // Refresh sessions and redirect if necessary
      await refreshSessions();
      if (sessionId === activeSessionId) {
        navigate('/');
      }
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        [`session-${sessionId}`]: error.response?.data?.detail || 'Failed to delete session',
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [`session-${sessionId}`]: false }));
    }
  };

  const handleRenameSession = async (sessionId) => {
    if (!editingSessionName.trim()) {
      setErrors((prev) => ({ ...prev, [`rename-${sessionId}`]: 'Session name cannot be empty' }));
      return;
    }

    clearMessages(`rename-${sessionId}`);
    setLoading((prev) => ({ ...prev, [`rename-${sessionId}`]: true }));

    try {
      await renameSession(sessionId, editingSessionName);
      setSuccess((prev) => ({ ...prev, [`rename-${sessionId}`]: 'Session renamed successfully' }));
      setEditingSessionId(null);
      setEditingSessionName('');
      setTimeout(() => clearMessages(`rename-${sessionId}`), 2000);
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        [`rename-${sessionId}`]: error.response?.data?.detail || 'Failed to rename session',
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [`rename-${sessionId}`]: false }));
    }
  };

  const handleDeleteAccount = (e) => {
    e.preventDefault();
    clearMessages('delete');

    if (deleteForm.confirmText !== 'DELETE') {
      setErrors((prev) => ({ ...prev, delete: 'Please type DELETE to confirm' }));
      return;
    }

    setAccountDeleteConfirm(true);
  };

  const confirmDeleteAccount = async (actionToken = null) => {
    // If MFA is enabled and we don't have an action token, show the MFA modal
    if (mfaStatus?.mfa_enabled && !actionToken) {
      setPendingAction({ type: 'delete' });
      setMfaActionModal('account_delete');
      return;
    }

    setLoading((prev) => ({ ...prev, delete: true }));

    try {
      // Create config with action token header if provided
      const config = actionToken ? { headers: { 'X-MFA-Action-Token': actionToken } } : {};

      await authAPI.deleteAccount(deleteForm.password, config);
      await authAPI.logout();
      window.location.href = '/login';
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        delete: error.response?.data?.detail || 'Failed to delete account',
      }));
      setLoading((prev) => ({ ...prev, delete: false }));
      setAccountDeleteConfirm(false);
    }
  };

  // Handler for MFA verification success
  const handleMfaActionSuccess = (actionToken) => {
    setMfaActionModal(null);

    // Execute the pending action with the token
    if (pendingAction?.type === 'password') {
      handleUpdatePassword(null, actionToken);
    } else if (pendingAction?.type === 'email') {
      handleUpdateEmail(null, actionToken);
    } else if (pendingAction?.type === 'delete') {
      confirmDeleteAccount(actionToken);
    }

    setPendingAction(null);
  };

  const handleMfaActionCancel = () => {
    setMfaActionModal(null);
    setPendingAction(null);
  };

  const toggleSection = (section) => {
    if (expandedSection === section) {
      setExpandedSection(null);
    } else {
      setExpandedSection(section);
      clearMessages(section);
    }
  };

  const toggleSessionDetails = (sessionId) => {
    setExpandedSessionId(expandedSessionId === sessionId ? null : sessionId);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8 lg:py-12 transition-colors duration-200">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Manage your account information and preferences
          </p>
        </div>

        <div className="space-y-4">
          {/* Update Name */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors duration-200">
            <button
              onClick={() => toggleSection('name')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Update Name</h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Change your display name</p>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedSection === 'name' ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedSection === 'name' && (
              <form onSubmit={handleUpdateName} className="px-4 sm:px-6 pb-4 border-t border-gray-100 dark:border-gray-700">
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      New Name
                    </label>
                    <input
                      type="text"
                      value={nameForm.name}
                      onChange={(e) => setNameForm({ ...nameForm, name: e.target.value })}
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Current Password (required for security)
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords.namePassword ? 'text' : 'password'}
                        value={nameForm.password}
                        onChange={(e) => setNameForm({ ...nameForm, password: e.target.value })}
                        className="input w-full pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, namePassword: !showPasswords.namePassword })}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        tabIndex={-1}
                      >
                        {showPasswords.namePassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {errors.name && (
                    <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded">
                      {errors.name}
                    </div>
                  )}
                  {success.name && (
                    <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded">
                      {success.name}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading.name}
                    className="btn-primary w-full sm:w-auto"
                  >
                    {loading.name ? 'Updating...' : 'Update Name'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Update Email */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors duration-200">
            <button
              onClick={() => toggleSection('email')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Update Email</h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Change your email address</p>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedSection === 'email' ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedSection === 'email' && (
              <form onSubmit={handleUpdateEmail} className="px-4 sm:px-6 pb-4 border-t border-gray-100 dark:border-gray-700">
                <div className="mt-4 space-y-4">
                  {user?.pending_email && (
                    <div className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 rounded border border-amber-200 dark:border-amber-800">
                      <strong>Pending change:</strong> A verification email was sent to <strong>{user.pending_email}</strong>.
                      Submitting a new request will cancel the pending change.
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      New Email
                    </label>
                    <input
                      type="email"
                      value={emailForm.email}
                      onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Current Password (required for security)
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords.emailPassword ? 'text' : 'password'}
                        value={emailForm.password}
                        onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                        className="input w-full pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, emailPassword: !showPasswords.emailPassword })}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        tabIndex={-1}
                      >
                        {showPasswords.emailPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {errors.email && (
                    <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded">
                      {errors.email}
                    </div>
                  )}
                  {success.email && (
                    <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded">
                      {success.email}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading.email}
                    className="btn-primary w-full sm:w-auto"
                  >
                    {loading.email ? 'Updating...' : 'Update Email'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Update Password */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors duration-200">
            <button
              onClick={() => toggleSection('password')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Change Password</h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Update your account password</p>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedSection === 'password' ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedSection === 'password' && (
              <form onSubmit={handleUpdatePassword} className="px-4 sm:px-6 pb-4 border-t border-gray-100 dark:border-gray-700">
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords.currentPassword ? 'text' : 'password'}
                        value={passwordForm.currentPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                        }
                        className="input w-full pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, currentPassword: !showPasswords.currentPassword })}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        tabIndex={-1}
                      >
                        {showPasswords.currentPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      New Password (8+ characters)
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords.newPassword ? 'text' : 'password'}
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                        }
                        className="input w-full pr-10"
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, newPassword: !showPasswords.newPassword })}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        tabIndex={-1}
                      >
                        {showPasswords.newPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords.confirmPassword ? 'text' : 'password'}
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                        }
                        className="input w-full pr-10"
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, confirmPassword: !showPasswords.confirmPassword })}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        tabIndex={-1}
                      >
                        {showPasswords.confirmPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {errors.password && (
                    <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded">
                      {errors.password}
                    </div>
                  )}
                  {success.password && (
                    <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded">
                      {success.password}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading.password}
                    className="btn-primary w-full sm:w-auto"
                  >
                    {loading.password ? 'Updating...' : 'Change Password'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Manage Sessions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors duration-200">
            <button
              onClick={() => toggleSection('sessions')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Manage Sessions</h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  View, rename, and delete your sessions
                </p>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedSection === 'sessions' ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedSection === 'sessions' && (
              <div className="px-4 sm:px-6 pb-4 border-t border-gray-100 dark:border-gray-700">
                <div className="mt-4 space-y-4">
                  {success.sessions && (
                    <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded">
                      {success.sessions}
                    </div>
                  )}

                  {/* Owned Sessions */}
                  {sessions.filter(s => s.is_owner).length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Your Sessions ({sessions.filter(s => s.is_owner).length} of 3)
                      </h3>
                      {sessions.filter(s => s.is_owner).map((session) => (
                        <div key={session.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                          <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 flex items-center justify-between">
                            <div className="flex-1">
                              {editingSessionId === session.id ? (
                                <div className="space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <div className="flex-1">
                                      <input
                                        type="text"
                                        value={editingSessionName}
                                        onChange={(e) => setEditingSessionName(e.target.value)}
                                        className="input text-sm w-full"
                                        maxLength={15}
                                        placeholder="Session name"
                                      />
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {editingSessionName.length}/15 characters
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleRenameSession(session.id)}
                                      disabled={loading[`rename-${session.id}`]}
                                      className="px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 text-sm disabled:opacity-50"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingSessionId(null);
                                        setEditingSessionName('');
                                        clearMessages(`rename-${session.id}`);
                                      }}
                                      className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-sm"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white flex items-center space-x-2 flex-wrap">
                                      <span>{session.name}</span>
                                      {session.id === activeSessionId && (
                                        <span className="text-xs bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded">
                                          Active
                                        </span>
                                      )}
                                    </h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      Created {formatLocalDate(session.created_at)}
                                    </p>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    {session.is_owner && (
                                      <button
                                        onClick={() => {
                                          setEditingSessionId(session.id);
                                          setEditingSessionName(session.name);
                                        }}
                                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                      >
                                        Rename
                                      </button>
                                    )}
                                    <button
                                      onClick={() => toggleSessionDetails(session.id)}
                                      className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                                    >
                                      {expandedSessionId === session.id ? 'Hide' : 'View'}
                                    </button>
                                  </div>
                                </div>
                              )}

                              {errors[`rename-${session.id}`] && (
                                <div className="text-sm text-red-600 mt-2">
                                  {errors[`rename-${session.id}`]}
                                </div>
                              )}
                              {success[`rename-${session.id}`] && (
                                <div className="text-sm text-green-600 mt-2">
                                  {success[`rename-${session.id}`]}
                                </div>
                              )}
                            </div>
                          </div>

                          {expandedSessionId === session.id && (
                            <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                              {loadingStats[session.id] ? (
                                <div className="text-xs text-gray-600 dark:text-gray-400">Loading statistics...</div>
                              ) : sessionStatistics[session.id] ? (
                                <>
                                  <div className="space-y-1.5 mb-3">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-gray-700 dark:text-gray-300">Conversations</span>
                                      <span className="font-semibold text-gray-900 dark:text-white">
                                        {sessionStatistics[session.id].conversations}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-gray-700 dark:text-gray-300">Journal Entries</span>
                                      <span className="font-semibold text-gray-900 dark:text-white">
                                        {sessionStatistics[session.id].journal_entries}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-gray-700 dark:text-gray-300">Documents</span>
                                      <span className="font-semibold text-gray-900 dark:text-white">
                                        {sessionStatistics[session.id].documents}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-gray-700 dark:text-gray-300">Audio Recordings</span>
                                      <span className="font-semibold text-gray-900 dark:text-white">
                                        {sessionStatistics[session.id].audio_recordings}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-gray-700 dark:text-gray-300">Collaborators</span>
                                      <span className="font-semibold text-gray-900 dark:text-white">
                                        {session.collaborators?.length || 0}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Warning Box */}
                                  <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-3 py-3 mb-3">
                                    <div className="flex items-start gap-2">
                                      <div className="flex-shrink-0">
                                        <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                      </div>
                                      <div className="flex-1">
                                        <p className="text-xs text-orange-900 dark:text-orange-200 font-medium mb-1">
                                          Warning: Permanent Data Deletion
                                        </p>
                                        <p className="text-xs text-orange-800 dark:text-orange-300">
                                          Deleting this session will permanently delete all data shown above. <strong>This action cannot be undone.</strong>
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  {errors[`session-${session.id}`] && (
                                    <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded mb-3">
                                      {errors[`session-${session.id}`]}
                                    </div>
                                  )}

                                  <button
                                    onClick={() => handleDeleteSession(session.id)}
                                    disabled={loading[`session-${session.id}`]}
                                    className="w-full px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-sm transition-colors"
                                  >
                                    {loading[`session-${session.id}`] ? 'Deleting...' : 'Delete This Session'}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Control Access */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors duration-200">
            <button
              onClick={() => toggleSection('security')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Control Access</h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Configure advanced security features</p>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedSection === 'security' ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedSection === 'security' && (
              <div className="px-4 sm:px-6 pb-4 border-t border-gray-100 dark:border-gray-700">
                <div className="mt-4 space-y-6">
                  {/* Two-Factor Authentication Section */}
                  <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                            Two-Factor Authentication
                          </h3>
                          {mfaLoading ? (
                            <span className="text-xs text-gray-500 dark:text-gray-400">Loading...</span>
                          ) : mfaStatus?.mfa_enabled ? (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Enabled
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500 dark:text-gray-400">Not enabled</span>
                          )}
                        </div>
                      </div>
                      <Link
                        to="/mfa-setup"
                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                      >
                        {mfaStatus?.mfa_enabled ? 'Manage' : 'Enable'}
                      </Link>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 ml-13">
                      Add an extra layer of security with passkeys or authenticator app.
                    </p>
                  </div>

                  {/* Sign Out All Devices Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                            Sign Out Everywhere
                          </h3>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {devicesCount !== null ? (
                              <>{devicesCount} active {devicesCount === 1 ? 'sign-in' : 'sign-ins'} in last 24h</>
                            ) : (
                              'Loading...'
                            )}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={handleLogoutEverywhere}
                        disabled={loading.security}
                        className="text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 disabled:opacity-50"
                      >
                        {loading.security ? 'Signing Out...' : 'Sign Out'}
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 ml-13">
                      End all active sign-ins, including this one. Use this if you've lost a device or suspect unauthorized access. You'll need to sign back in.
                    </p>

                    {errors.security && (
                      <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded mt-3 ml-13">
                        {errors.security}
                      </div>
                    )}
                    {success.security && (
                      <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded mt-3 ml-13">
                        {success.security}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Delete Account */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-red-300 dark:border-red-700 transition-colors duration-200">
            <button
              onClick={() => toggleSection('delete')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-red-600 dark:text-red-400">Delete Account</h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  Permanently delete your account and all data
                </p>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedSection === 'delete' ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedSection === 'delete' && (
              <form onSubmit={handleDeleteAccount} className="px-4 sm:px-6 pb-4 border-t border-red-100 dark:border-red-900/30">
                <div className="mt-4 space-y-4">
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-red-900 dark:text-red-200 font-bold mb-2">
                          Warning: Permanent Account & Data Deletion
                        </p>
                        <p className="text-sm text-red-800 dark:text-red-300">
                          This action is permanent and cannot be undone. Your account AND all data from your owned sessions will be permanently deleted. Sessions shared with you by others will remain accessible to the owners.
                        </p>
                        <p className="text-sm text-red-900 dark:text-red-200 font-bold mt-2">
                          You will need to create a new account to use AretaCare again.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Type <span className="font-mono font-bold">DELETE</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={deleteForm.confirmText}
                      onChange={(e) => setDeleteForm({ ...deleteForm, confirmText: e.target.value })}
                      className="input w-full"
                      required
                      placeholder="DELETE"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Your Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords.deletePassword ? 'text' : 'password'}
                        value={deleteForm.password}
                        onChange={(e) => setDeleteForm({ ...deleteForm, password: e.target.value })}
                        className="input w-full pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, deletePassword: !showPasswords.deletePassword })}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        tabIndex={-1}
                      >
                        {showPasswords.deletePassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {errors.delete && (
                    <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded">
                      {errors.delete}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading.delete}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-sm sm:text-base transition-colors"
                  >
                    {loading.delete ? 'Deleting...' : 'Delete My Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Session Deletion Confirmation Modal */}
      {sessionToDelete && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Delete Session</h2>
                <button
                  onClick={() => setSessionToDelete(null)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Delete "{sessionToDelete.session.name}"?
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This will permanently delete all data in this session
                  </p>
                </div>
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3">
                <p className="text-sm text-orange-900 dark:text-orange-200 mb-2 font-medium">
                  This will permanently delete:
                </p>
                <ul className="text-sm text-orange-800 dark:text-orange-300 space-y-1.5">
                  <li>• {sessionToDelete.stats?.conversations || 0} conversations and messages</li>
                  <li>• {sessionToDelete.stats?.journal_entries || 0} journal entries</li>
                  <li>• {sessionToDelete.stats?.documents || 0} uploaded documents</li>
                  <li>• {sessionToDelete.stats?.audio_recordings || 0} audio recordings</li>
                  <li>• All daily digests</li>
                </ul>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-4 py-3">
                <p className="text-sm text-red-900 dark:text-red-200 font-bold">
                  This action cannot be undone. Your data is NOT recoverable after deletion.
                </p>
                <p className="text-sm text-red-800 dark:text-red-300 mt-2">
                  Your account will remain active.
                </p>
              </div>

              {errors[`session-${sessionToDelete.session.id}`] && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded">
                  {errors[`session-${sessionToDelete.session.id}`]}
                </div>
              )}

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setSessionToDelete(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteSession}
                  disabled={loading[`session-${sessionToDelete.session.id}`]}
                  className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 disabled:opacity-50 font-medium"
                >
                  {loading[`session-${sessionToDelete.session.id}`] ? 'Deleting...' : 'Delete Session'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Account Deletion Confirmation Modal */}
      {accountDeleteConfirm && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Delete Account</h2>
                <button
                  onClick={() => setAccountDeleteConfirm(false)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Final Warning: Delete Your Account
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This will permanently delete your account and all associated data
                  </p>
                </div>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-4 py-3">
                <p className="text-sm text-red-900 dark:text-red-200 mb-2 font-bold">
                  This will permanently delete:
                </p>
                <ul className="text-sm text-red-800 dark:text-red-300 space-y-1.5">
                  <li>• Your user account</li>
                  <li>• All your owned sessions ({sessions.filter(s => s.is_owner).length})</li>
                  <li>• All conversations ({sessions.filter(s => s.is_owner).reduce((sum, s) => sum + (sessionStatistics[s.id]?.conversations || 0), 0)})</li>
                  <li>• All journal entries ({sessions.filter(s => s.is_owner).reduce((sum, s) => sum + (sessionStatistics[s.id]?.journal_entries || 0), 0)})</li>
                  <li>• All documents ({sessions.filter(s => s.is_owner).reduce((sum, s) => sum + (sessionStatistics[s.id]?.documents || 0), 0)})</li>
                  <li>• All audio recordings ({sessions.filter(s => s.is_owner).reduce((sum, s) => sum + (sessionStatistics[s.id]?.audio_recordings || 0), 0)})</li>
                  <li>• All daily digests</li>
                  <li>• All account settings</li>
                </ul>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-4 py-3">
                <p className="text-sm text-amber-900 dark:text-amber-200 font-medium">
                  <strong>Note:</strong> Sessions shared with you by others will remain intact and accessible to the owners. Only your owned sessions will be deleted.
                </p>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-4 py-3">
                <p className="text-sm text-red-900 dark:text-red-200 font-bold">
                  This action cannot be undone.
                </p>
                <p className="text-sm text-red-900 dark:text-red-200 font-bold mt-1">
                  You will need to create a new account to use AretaCare again.
                </p>
              </div>

              {errors.delete && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded">
                  {errors.delete}
                </div>
              )}

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setAccountDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteAccount}
                  disabled={loading.delete}
                  className="flex-1 px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 font-medium"
                >
                  {loading.delete ? 'Deleting...' : 'Delete My Account'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MFA Sensitive Action Modal */}
      {mfaActionModal && (
        <SensitiveActionModal
          actionType={mfaActionModal}
          onSuccess={handleMfaActionSuccess}
          onCancel={handleMfaActionCancel}
        />
      )}
    </div>
  );
}
