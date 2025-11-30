import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminAPI } from '../../services/api';

const actionLabels = {
  password_reset: { label: 'Password Reset', color: 'blue' },
  user_delete: { label: 'User Deleted', color: 'red' },
  session_delete: { label: 'Session Deleted', color: 'orange' },
  session_transfer: { label: 'Session Transfer', color: 'purple' },
  s3_orphan_delete: { label: 'S3 Cleanup', color: 'green' },
  audit_log_cleanup: { label: 'Log Cleanup', color: 'gray' },
};

export default function AdminAuditLog() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [actionFilter, setActionFilter] = useState('');
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState('');
  const limit = 20;

  useEffect(() => {
    fetchAuditLog();
  }, [page, actionFilter]);

  const fetchAuditLog = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminAPI.getAuditLog(page, limit, actionFilter || null);
      setEntries(response.data.entries);
      setTotal(response.data.total);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('This will permanently delete audit log entries older than 90 days. Continue?')) {
      return;
    }
    setCleaningUp(true);
    setCleanupMessage('');
    setError('');
    try {
      const response = await adminAPI.cleanupAuditLog();
      setCleanupMessage(response.data.message);
      fetchAuditLog(); // Refresh the list
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to cleanup audit log');
    } finally {
      setCleaningUp(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Audit Log</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Track admin actions and changes</p>
          </div>
          <button
            onClick={handleCleanup}
            disabled={cleaningUp}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2 self-start"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {cleaningUp ? 'Cleaning...' : 'GDPR Cleanup'}
          </button>
        </div>

        {/* GDPR Info */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium">GDPR Compliance</p>
              <p className="mt-1 text-blue-700 dark:text-blue-300">
                Audit logs are automatically cleaned up on server startup. Entries older than 90 days are deleted to minimize PII retention.
                You can also trigger cleanup manually using the button above.
              </p>
            </div>
          </div>
        </div>

        {cleanupMessage && (
          <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg">
            {cleanupMessage}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <label className="text-sm text-gray-600 dark:text-gray-400">Filter by action:</label>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="">All Actions</option>
            <option value="password_reset">Password Reset</option>
            <option value="user_delete">User Deleted</option>
            <option value="session_delete">Session Deleted</option>
            <option value="session_transfer">Session Transfer</option>
            <option value="s3_orphan_delete">S3 Cleanup</option>
            <option value="audit_log_cleanup">Log Cleanup</option>
          </select>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-4 py-8 rounded-lg text-center">
            No audit log entries found
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Admin</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Target</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {entries.map((entry) => {
                    const actionInfo = actionLabels[entry.action] || { label: entry.action, color: 'gray' };
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          {entry.admin_email}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-${actionInfo.color}-100 dark:bg-${actionInfo.color}-900/30 text-${actionInfo.color}-800 dark:text-${actionInfo.color}-300`}>
                            {actionInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {entry.target_type && (
                            <span className="font-mono">
                              {entry.target_type}: {entry.target_id?.slice(0, 8)}...
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSelectedEntry(entry)}
                            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Details Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setSelectedEntry(null)}></div>
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Audit Entry Details</h3>
                <button onClick={() => setSelectedEntry(null)} className="text-gray-400 hover:text-gray-500">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Timestamp</p>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {new Date(selectedEntry.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Admin Email</p>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedEntry.admin_email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Action</p>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedEntry.action}</p>
                </div>
                {selectedEntry.target_type && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Target</p>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {selectedEntry.target_type}: {selectedEntry.target_id}
                    </p>
                  </div>
                )}
                {selectedEntry.details && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Details</p>
                    <pre className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 rounded p-3 overflow-x-auto">
                      {JSON.stringify(selectedEntry.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
