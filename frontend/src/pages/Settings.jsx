import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, sessionAPI } from '../services/api';
import { useSessionContext } from '../contexts/SessionContext';

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
      localStorage.setItem('user', JSON.stringify(updatedUser));
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
      const updatedUser = response.data;
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setSuccess((prev) => ({ ...prev, email: 'Email updated successfully' }));
      setEmailForm({ ...emailForm, password: '' });
      setTimeout(() => setExpandedSection(null), 2000);
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        email: error.response?.data?.detail || 'Failed to update email',
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
      const updatedUser = response.data;
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setSuccess((prev) => ({ ...prev, password: 'Password updated successfully' }));
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setExpandedSection(null), 2000);
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        password: error.response?.data?.detail || 'Failed to update password',
      }));
    } finally {
      setLoading((prev) => ({ ...prev, password: false }));
    }
  };

  const handleDeleteSession = async (sessionId) => {
    const stats = sessionStatistics[sessionId];

    const confirmMessage =
      '⚠️ WARNING: PERMANENT DATA DELETION ⚠️\n\n' +
      'This will PERMANENTLY DELETE ALL of this session\'s data including:\n' +
      `• All conversations and messages (${stats?.conversations || 0})\n` +
      `• All journal entries (${stats?.journal_entries || 0})\n` +
      `• All uploaded documents (${stats?.documents || 0})\n` +
      `• All audio recordings (${stats?.audio_recordings || 0})\n` +
      '• All daily plans\n\n' +
      'THIS ACTION CANNOT BE UNDONE.\n' +
      'Your data is NOT recoverable after deletion.\n\n' +
      'Your account will remain active.\n\n' +
      'Are you absolutely sure you want to proceed?';

    const confirmed = window.confirm(confirmMessage);

    if (!confirmed) return;

    clearMessages(`session-${sessionId}`);
    setLoading((prev) => ({ ...prev, [`session-${sessionId}`]: true }));

    try {
      await deleteSession(sessionId);
      setSuccess((prev) => ({ ...prev, sessions: 'Session deleted successfully' }));
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

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    clearMessages('delete');

    if (deleteForm.confirmText !== 'DELETE') {
      setErrors((prev) => ({ ...prev, delete: 'Please type DELETE to confirm' }));
      return;
    }

    // Calculate total statistics across all sessions
    const totalStats = sessions.reduce((totals, session) => {
      const stats = sessionStatistics[session.id] || {};
      return {
        conversations: totals.conversations + (stats.conversations || 0),
        journal_entries: totals.journal_entries + (stats.journal_entries || 0),
        documents: totals.documents + (stats.documents || 0),
        audio_recordings: totals.audio_recordings + (stats.audio_recordings || 0),
      };
    }, { conversations: 0, journal_entries: 0, documents: 0, audio_recordings: 0 });

    const confirmMessage =
      '⚠️ FINAL WARNING: ACCOUNT AND DATA DELETION ⚠️\n\n' +
      'This will PERMANENTLY DELETE:\n' +
      '• Your user account\n' +
      `• All your sessions (${sessions.length})\n` +
      `• All conversations and messages (${totalStats.conversations})\n` +
      `• All journal entries (${totalStats.journal_entries})\n` +
      `• All uploaded documents (${totalStats.documents})\n` +
      `• All audio recordings (${totalStats.audio_recordings})\n` +
      '• All daily plans\n' +
      '• All account settings\n\n' +
      'THIS ACTION CANNOT BE UNDONE.\n' +
      'You will need to create a new account to use AretaCare again.\n\n' +
      'Are you absolutely sure you want to delete your account?';

    const confirmed = window.confirm(confirmMessage);

    if (!confirmed) return;

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
    <div className="min-h-screen bg-gray-50 py-6 sm:py-8 lg:py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Account Settings</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600">
            Manage your account information and preferences
          </p>
        </div>

        <div className="space-y-4">
          {/* Update Name */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <button
              onClick={() => toggleSection('name')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Update Name</h2>
                <p className="text-xs sm:text-sm text-gray-600">Change your display name</p>
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
              <form onSubmit={handleUpdateName} className="px-4 sm:px-6 pb-4 border-t border-gray-100">
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                      {errors.name}
                    </div>
                  )}
                  {success.name && (
                    <div className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded">
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <button
              onClick={() => toggleSection('email')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Update Email</h2>
                <p className="text-xs sm:text-sm text-gray-600">Change your email address</p>
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
              <form onSubmit={handleUpdateEmail} className="px-4 sm:px-6 pb-4 border-t border-gray-100">
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                      {errors.email}
                    </div>
                  )}
                  {success.email && (
                    <div className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded">
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <button
              onClick={() => toggleSection('password')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Change Password</h2>
                <p className="text-xs sm:text-sm text-gray-600">Update your account password</p>
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
              <form onSubmit={handleUpdatePassword} className="px-4 sm:px-6 pb-4 border-t border-gray-100">
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                      {errors.password}
                    </div>
                  )}
                  {success.password && (
                    <div className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded">
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
          <div className="bg-white rounded-lg shadow-sm border border-orange-300">
            <button
              onClick={() => toggleSection('sessions')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-orange-50 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-orange-600">Manage Sessions</h2>
                <p className="text-xs sm:text-sm text-gray-600">
                  View, rename, and delete your sessions ({sessions.length}/3)
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
              <div className="px-4 sm:px-6 pb-4 border-t border-orange-100">
                <div className="mt-4 space-y-3">
                  {success.sessions && (
                    <div className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded">
                      {success.sessions}
                    </div>
                  )}

                  {sessions.map((session) => (
                    <div key={session.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
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
                                  <div className="text-xs text-gray-500 mt-1">
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
                                  className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
                                  <span>{session.name}</span>
                                  {session.id === activeSessionId && (
                                    <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded">
                                      Active
                                    </span>
                                  )}
                                </h3>
                                <p className="text-xs text-gray-500">
                                  Created {new Date(session.created_at).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => {
                                    setEditingSessionId(session.id);
                                    setEditingSessionName(session.name);
                                  }}
                                  className="text-sm text-primary-600 hover:text-primary-700"
                                >
                                  Rename
                                </button>
                                <button
                                  onClick={() => toggleSessionDetails(session.id)}
                                  className="text-sm text-gray-600 hover:text-gray-700"
                                >
                                  {expandedSessionId === session.id ? 'Hide' : 'Details'}
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
                        <div className="px-4 py-3 bg-white border-t border-gray-200">
                          {loadingStats[session.id] ? (
                            <div className="text-xs text-gray-600">Loading statistics...</div>
                          ) : sessionStatistics[session.id] ? (
                            <>
                              <div className="space-y-1.5 mb-3">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-gray-700">Conversations</span>
                                  <span className="font-semibold text-gray-900">
                                    {sessionStatistics[session.id].conversations}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-gray-700">Journal Entries</span>
                                  <span className="font-semibold text-gray-900">
                                    {sessionStatistics[session.id].journal_entries}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-gray-700">Documents</span>
                                  <span className="font-semibold text-gray-900">
                                    {sessionStatistics[session.id].documents}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-gray-700">Audio Recordings</span>
                                  <span className="font-semibold text-gray-900">
                                    {sessionStatistics[session.id].audio_recordings}
                                  </span>
                                </div>
                              </div>

                              {/* Warning Box */}
                              <div className="bg-orange-50 border border-orange-200 rounded px-2 py-2 mb-3">
                                <p className="text-xs text-orange-800">
                                  <strong>Warning:</strong> Deleting this session will permanently delete all data shown above. This action cannot be undone.
                                </p>
                              </div>

                              {errors[`session-${session.id}`] && (
                                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded mb-3">
                                  {errors[`session-${session.id}`]}
                                </div>
                              )}

                              <button
                                onClick={() => handleDeleteSession(session.id)}
                                disabled={loading[`session-${session.id}`]}
                                className="w-full px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm transition-colors"
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
              </div>
            )}
          </div>

          {/* Delete Account */}
          <div className="bg-white rounded-lg shadow-sm border border-red-300">
            <button
              onClick={() => toggleSection('delete')}
              className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-red-50 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-red-600">Delete Account</h2>
                <p className="text-xs sm:text-sm text-gray-600">
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
              <form onSubmit={handleDeleteAccount} className="px-4 sm:px-6 pb-4 border-t border-red-100">
                <div className="mt-4 space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <p className="text-sm text-red-800">
                      <strong>Warning:</strong> This action is permanent and cannot be undone. Your account AND all associated data from all sessions (conversations, journal entries, documents, audio recordings, daily plans) will be permanently deleted. You will need to create a new account to use AretaCare again.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                      {errors.delete}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading.delete}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm sm:text-base transition-colors"
                  >
                    {loading.delete ? 'Deleting...' : 'Delete My Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
