import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, sessionAPI } from '../services/api';
import { useSession } from '../hooks/useSession';

export default function Settings() {
  const navigate = useNavigate();
  const { user, setUser, sessionId } = useSession();

  // Session statistics
  const [statistics, setStatistics] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

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

  // Fetch session statistics on mount
  useEffect(() => {
    const fetchStatistics = async () => {
      if (!sessionId) return;

      setLoadingStats(true);
      try {
        const response = await sessionAPI.getStatistics(sessionId);
        setStatistics(response.data);
      } catch (error) {
        console.error('Failed to fetch statistics:', error);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStatistics();
  }, [sessionId]);

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

  const handleClearSession = async () => {
    if (!sessionId) return;

    const confirmMessage =
      '⚠️ WARNING: PERMANENT DATA DELETION ⚠️\n\n' +
      'This will PERMANENTLY DELETE ALL of your session data including:\n' +
      `• All conversations and messages (${statistics?.conversations || 0})\n` +
      `• All journal entries (${statistics?.journal_entries || 0})\n` +
      `• All uploaded documents (${statistics?.documents || 0})\n` +
      `• All audio recordings (${statistics?.audio_recordings || 0})\n` +
      '• All daily plans\n\n' +
      'THIS ACTION CANNOT BE UNDONE.\n' +
      'Your data is NOT recoverable after deletion.\n\n' +
      'Your account will remain active and you can create a new session.\n\n' +
      'Are you absolutely sure you want to proceed?';

    const confirmed = window.confirm(confirmMessage);

    if (!confirmed) return;

    clearMessages('session');
    setLoading((prev) => ({ ...prev, session: true }));

    try {
      await sessionAPI.delete(sessionId);
      localStorage.removeItem('session_id');
      setSuccess((prev) => ({ ...prev, session: 'Session cleared successfully' }));
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        session: error.response?.data?.detail || 'Failed to clear session',
      }));
    } finally {
      setLoading((prev) => ({ ...prev, session: false }));
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    clearMessages('delete');

    if (deleteForm.confirmText !== 'DELETE') {
      setErrors((prev) => ({ ...prev, delete: 'Please type DELETE to confirm' }));
      return;
    }

    const confirmMessage =
      '⚠️ FINAL WARNING: ACCOUNT AND DATA DELETION ⚠️\n\n' +
      'This will PERMANENTLY DELETE:\n' +
      '• Your user account\n' +
      '• All your sessions\n' +
      `• All conversations and messages (${statistics?.conversations || 0})\n` +
      `• All journal entries (${statistics?.journal_entries || 0})\n` +
      `• All uploaded documents (${statistics?.documents || 0})\n` +
      `• All audio recordings (${statistics?.audio_recordings || 0})\n` +
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

          {/* Clear Session */}
          <div className="bg-white rounded-lg shadow-sm border border-orange-300">
            <div className="px-4 sm:px-6 py-4">
              <h2 className="text-base sm:text-lg font-semibold text-orange-600">Clear Session</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Permanently delete all session data except your account
              </p>

              {/* Warning Box */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-3 mt-3">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-orange-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-orange-800">
                      WARNING: PERMANENT DATA DELETION
                    </p>
                    <p className="text-xs text-orange-700 mt-1">
                      This will permanently delete ALL of the following data. This action CANNOT be undone.
                    </p>
                  </div>
                </div>
              </div>

              {/* Statistics Display */}
              {loadingStats ? (
                <div className="mt-3 px-3 py-2 bg-gray-50 rounded text-xs text-gray-600">
                  Loading statistics...
                </div>
              ) : statistics ? (
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded text-sm">
                    <span className="text-gray-700">Conversations</span>
                    <span className="font-semibold text-gray-900">{statistics.conversations}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded text-sm">
                    <span className="text-gray-700">Journal Entries</span>
                    <span className="font-semibold text-gray-900">{statistics.journal_entries}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded text-sm">
                    <span className="text-gray-700">Documents</span>
                    <span className="font-semibold text-gray-900">{statistics.documents}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded text-sm">
                    <span className="text-gray-700">Audio Recordings</span>
                    <span className="font-semibold text-gray-900">{statistics.audio_recordings}</span>
                  </div>
                </div>
              ) : null}

              {errors.session && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded mt-3">
                  {errors.session}
                </div>
              )}
              {success.session && (
                <div className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded mt-3">
                  {success.session}
                </div>
              )}

              <button
                onClick={handleClearSession}
                disabled={loading.session || !sessionId}
                className="mt-3 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm sm:text-base transition-colors"
              >
                {loading.session ? 'Clearing...' : 'Clear Session'}
              </button>
            </div>
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
                      <strong>Warning:</strong> This action is permanent and cannot be undone. Your account AND all associated data (conversations, journal entries, documents, audio recordings, daily plans) will be permanently deleted. You will need to create a new account to use AretaCare again.
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
