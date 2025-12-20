import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { authAPI, sessionAPI } from '../services/api';
import { useSessionContext } from '../contexts/SessionContext';
import { formatLocalDate } from '../utils/dateUtils';

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

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    clearMessages('email');
    setLoading((prev) => ({ ...prev, email: true }));

    try {
      const response = await authAPI.updateEmail(emailForm.email, emailForm.password);
      // Email change now requires verification - show pending message
      setSuccess((prev) => ({
        ...prev,
        email: response.data.message || 'Verification email sent. Please check your new email to complete the change.'
      }));
      setEmailForm({ email: '', password: '' });

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

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    clearMessages('password');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setErrors((prev) => ({ ...prev, password: 'New passwords do not match' }));
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setErrors((prev) => ({ ...prev, password: 'Password must be at least 8 characters' }));
      return;
    }

    setLoading((prev) => ({ ...prev, password: true }));

    try {
      const response = await authAPI.updatePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setSuccess((prev) => ({ ...prev, password: response.data.message || 'Password updated successfully' }));
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });

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
      setSuccess((prev) => ({ ...prev, security: response.data.message || 'Logged out of all devices' }));

      // Log out current session after a short delay
      setTimeout(() => {
        authAPI.logout();
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

  const confirmDeleteAccount = async () => {
    setLoading((prev) => ({ ...prev, delete: true }));

    try {
      await authAPI.deleteAccount(deleteForm.password);
      authAPI.logout();
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
                    <input
                      type="password"
                      value={nameForm.password}
                      onChange={(e) => setNameForm({ ...nameForm, password: e.target.value })}
                      className="input w-full"
                      required
                    />
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
                    <input
                      type="password"
                      value={emailForm.password}
                      onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                      className="input w-full"
                      required
                    />
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
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                      }
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      New Password (8+ characters)
                    </label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                      }
                      className="input w-full"
                      required
                      minLength={8}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                      }
                      className="input w-full"
                      required
                      minLength={8}
                    />
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

          {/* Manage Security */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors duration-200">
            <button
              onClick={() => toggleSection('security')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Manage Security</h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Manage active logins and devices</p>
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
                <div className="mt-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                      Logout From All Devices
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      This will log you out of all devices and browsers where you're currently signed in.
                      You'll need to log in again on all devices.
                    </p>
                    <button
                      onClick={handleLogoutEverywhere}
                      disabled={loading.security}
                      className="px-4 py-2 text-sm font-medium rounded-lg transition-colors w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                      {loading.security ? 'Logging Out...' : 'Logout Everywhere'}
                    </button>
                  </div>

                  {errors.security && (
                    <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded">
                      {errors.security}
                    </div>
                  )}
                  {success.security && (
                    <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded">
                      {success.security}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Manage Sessions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-orange-300 dark:border-orange-700 transition-colors duration-200">
            <button
              onClick={() => toggleSection('sessions')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-orange-600 dark:text-orange-400">Manage Sessions</h2>
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
              <div className="px-4 sm:px-6 pb-4 border-t border-orange-100 dark:border-orange-900/30">
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
                    <input
                      type="password"
                      value={deleteForm.password}
                      onChange={(e) => setDeleteForm({ ...deleteForm, password: e.target.value })}
                      className="input w-full"
                      required
                    />
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
                  <li>• All daily plans</li>
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
                  <li>• All daily plans</li>
                  <li>• All account settings</li>
                </ul>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded px-4 py-3">
                <p className="text-sm text-blue-900 dark:text-blue-200 font-medium">
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
    </div>
  );
}
