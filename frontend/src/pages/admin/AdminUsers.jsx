import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminAPI } from '../../services/api';
import { formatLocalDate } from '../../utils/dateUtils';

function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', danger = false }) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose}></div>
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{message}</p>
          <div className="mt-4 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                danger
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function UserDetail({ user, onClose, onAction }) {
  const [loading, setLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [tokens, setTokens] = useState(null);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [showTokens, setShowTokens] = useState(false);

  const loadTokens = async () => {
    setLoadingTokens(true);
    try {
      const response = await adminAPI.getUserTokens(user.id);
      setTokens(response.data);
    } catch (err) {
      onAction('Failed to load tokens', true);
    } finally {
      setLoadingTokens(false);
    }
  };

  const handleRevokeAllTokens = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.revokeAllUserTokens(user.id);
      onAction(response.data.message || 'All tokens revoked');
      // Reload tokens to show updated state
      await loadTokens();
    } catch (err) {
      onAction(err.response?.data?.detail || 'Failed to revoke tokens', true);
    } finally {
      setLoading(false);
      setConfirmModal(null);
    }
  };

  const handleRevokeToken = async (tokenId) => {
    setLoading(true);
    try {
      await adminAPI.revokeToken(tokenId);
      onAction('Token revoked successfully');
      // Reload tokens to show updated state
      await loadTokens();
    } catch (err) {
      onAction(err.response?.data?.detail || 'Failed to revoke token', true);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setLoading(true);
    try {
      await adminAPI.resetUserPassword(user.id);
      onAction('Password reset email sent');
    } catch (err) {
      onAction(err.response?.data?.detail || 'Failed to reset password', true);
    } finally {
      setLoading(false);
      setConfirmModal(null);
    }
  };

  const handleResetMFA = async () => {
    setLoading(true);
    try {
      await adminAPI.resetUserMFA(user.id);
      onAction('MFA has been reset');
    } catch (err) {
      onAction(err.response?.data?.detail || 'Failed to reset MFA', true);
    } finally {
      setLoading(false);
      setConfirmModal(null);
    }
  };

  const handleDeleteUser = async () => {
    setLoading(true);
    try {
      await adminAPI.deleteUser(user.id);
      onAction('User deleted successfully');
      onClose();
    } catch (err) {
      onAction(err.response?.data?.detail || 'Failed to delete user', true);
    } finally {
      setLoading(false);
      setConfirmModal(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose}></div>
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-4 md:p-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{user.name}</h2>
                <p className="text-gray-600 dark:text-gray-400">{user.email}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* User Info */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400">Status:</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  user.is_active
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                }`}>
                  {user.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400">MFA:</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  user.mfa_enabled
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {user.mfa_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Created: <span className="text-gray-900 dark:text-white">{formatLocalDate(user.created_at)}</span>
              </div>
              <div className="text-gray-500 dark:text-gray-400 truncate" title={user.id}>
                ID: <span className="font-mono text-gray-900 dark:text-white text-xs">{user.id}</span>
              </div>
            </div>

            {/* Totals */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.sessions?.length || 0}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Sessions</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.total_conversations || 0}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Messages</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.total_documents || 0}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Documents</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.total_audio || 0}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Audio</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.total_journals || 0}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Journals</p>
              </div>
            </div>

            {/* Sessions */}
            {user.sessions && user.sessions.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Sessions</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {user.sessions.map((session, index) => (
                    <div key={session.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">Session {index + 1}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {session.is_owner ? 'Owner' : 'Collaborator'} - Created {formatLocalDate(session.created_at)}
                          </p>
                        </div>
                        <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                          <p>{session.document_count} docs, {session.audio_count} audio</p>
                          <p>{session.conversation_count} msgs, {session.journal_count} journals</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Token Management */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Active Tokens</h3>
                <button
                  onClick={() => {
                    setShowTokens(!showTokens);
                    if (!showTokens && !tokens) {
                      loadTokens();
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 rounded-lg transition-colors"
                >
                  {showTokens ? 'Hide' : 'View'} Tokens
                </button>
              </div>

              {showTokens && (
                <div className="space-y-3">
                  {loadingTokens ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading tokens...</p>
                  ) : tokens ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          {tokens.total_active} active {tokens.total_active === 1 ? 'device' : 'devices'}
                        </span>
                        {tokens.total_active > 0 && (
                          <button
                            onClick={() => setConfirmModal('revokeAll')}
                            disabled={loading}
                            className="px-3 py-1 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded transition-colors disabled:opacity-50"
                          >
                            Logout All Devices
                          </button>
                        )}
                      </div>

                      {tokens.active_tokens.length > 0 && (
                        <div className="space-y-2">
                          {tokens.active_tokens.map((token) => (
                            <div
                              key={token.id}
                              className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 text-xs space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full font-medium">
                                      Active
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400">
                                      ID: {token.id}
                                    </span>
                                  </div>
                                  {token.device_info && (
                                    <p className="text-gray-700 dark:text-gray-300 break-all">
                                      {token.device_info}
                                    </p>
                                  )}
                                  <p className="text-gray-500 dark:text-gray-400">
                                    Created: {formatLocalDate(token.created_at)}
                                  </p>
                                  {token.last_used_at && (
                                    <p className="text-gray-500 dark:text-gray-400">
                                      Last used: {formatLocalDate(token.last_used_at)}
                                    </p>
                                  )}
                                  <p className="text-gray-500 dark:text-gray-400">
                                    Expires: {formatLocalDate(token.expires_at)}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleRevokeToken(token.id)}
                                  disabled={loading}
                                  className="ml-2 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
                                >
                                  Revoke
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {tokens.total_active === 0 && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                          No active tokens
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Failed to load tokens</p>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Actions</h3>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setConfirmModal('reset')}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 rounded-lg transition-colors disabled:opacity-50"
                >
                  Reset Password
                </button>
                {user.mfa_enabled && (
                  <button
                    onClick={() => setConfirmModal('resetMfa')}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Reset MFA
                  </button>
                )}
                <button
                  onClick={() => setConfirmModal('delete')}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors disabled:opacity-50"
                >
                  Delete User
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal === 'reset'}
        onClose={() => setConfirmModal(null)}
        onConfirm={handleResetPassword}
        title="Reset Password"
        message={`Send a password reset email to ${user.email}?`}
        confirmText="Send Reset Email"
      />

      <ConfirmModal
        isOpen={confirmModal === 'resetMfa'}
        onClose={() => setConfirmModal(null)}
        onConfirm={handleResetMFA}
        title="Reset MFA"
        message={`Reset two-factor authentication for ${user.name}? This will disable MFA and remove all passkeys, authenticator apps, and backup codes. The user will be notified by email and can log in with just their password.`}
        confirmText="Reset MFA"
        danger
      />

      <ConfirmModal
        isOpen={confirmModal === 'delete'}
        onClose={() => setConfirmModal(null)}
        onConfirm={handleDeleteUser}
        title="Delete User"
        message={`Are you sure you want to delete ${user.name}? This will permanently delete all their sessions, documents, and data. This action cannot be undone.`}
        confirmText="Delete User"
        danger
      />

      <ConfirmModal
        isOpen={confirmModal === 'revokeAll'}
        onClose={() => setConfirmModal(null)}
        onConfirm={handleRevokeAllTokens}
        title="Logout All Devices"
        message={`Revoke all active sessions for ${user.name}? This will log them out of all devices and browsers. They will need to log in again.`}
        confirmText="Logout All"
        danger
      />
    </div>,
    document.body
  );
}

export default function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setMessage(null);
    try {
      const response = await adminAPI.searchUsers(searchQuery);
      setUsers(response.data);
      if (response.data.length === 0) {
        setMessage({ type: 'info', text: 'No users found' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Search failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = async (userId) => {
    try {
      const response = await adminAPI.getUserDetail(userId);
      setSelectedUser(response.data);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to load user details' });
    }
  };

  const handleAction = (text, isError = false) => {
    setMessage({ type: isError ? 'error' : 'success', text });
    if (!isError) {
      // Refresh search results
      handleSearch({ preventDefault: () => {} });
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Search and manage user accounts</p>
        </div>

        {/* Search Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by email..."
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </div>

        {/* Messages */}
        {message && (
          <div className={`px-4 py-3 rounded-lg ${
            message.type === 'error'
              ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              : message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Results */}
        {users.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sessions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        user.is_active
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {user.session_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatLocalDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleSelectUser(user.id)}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {selectedUser && (
        <UserDetail
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onAction={handleAction}
        />
      )}
    </AdminLayout>
  );
}
