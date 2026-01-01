import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminAPI } from '../../services/api';
import { formatLocalDateTime } from '../../utils/dateUtils';

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

const levelColors = {
  ERROR: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
  WARNING: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-300', border: 'border-yellow-200 dark:border-yellow-800' },
  CRITICAL: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-800 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
};

export default function AdminErrorLogs() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [levelFilter, setLevelFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState('');
  const [cleanupDays, setCleanupDays] = useState(30);
  const [showConfirmCleanup, setShowConfirmCleanup] = useState(false);
  const limit = 20;

  useEffect(() => {
    fetchErrorLogs();
  }, [page, levelFilter, sourceFilter]);

  const fetchErrorLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminAPI.getErrorLogs(
        page,
        limit,
        levelFilter || null,
        sourceFilter || null
      );
      setEntries(response.data.logs || []);
      setTotal(response.data.total || 0);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load error logs');
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async () => {
    setShowConfirmCleanup(false);
    setCleaningUp(true);
    setCleanupMessage('');
    setError('');
    try {
      const response = await adminAPI.cleanupErrorLogs(cleanupDays);
      const count = response.data.deleted_count || 0;
      setCleanupMessage(`Deleted ${count} error log${count !== 1 ? 's' : ''}`);
      fetchErrorLogs(); // Refresh the list
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to cleanup error logs');
    } finally {
      setCleaningUp(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  // Get unique sources from entries for filter dropdown
  const uniqueSources = [...new Set(entries.map(e => e.source))].sort();

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Error Logs</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Application errors and warnings</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={cleanupDays}
              onChange={(e) => setCleanupDays(parseInt(e.target.value) || 30)}
              min="1"
              max="365"
              className="w-16 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
            <button
              onClick={() => setShowConfirmCleanup(true)}
              disabled={cleaningUp}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {cleaningUp ? 'Cleaning...' : `Cleanup (${cleanupDays}d)`}
            </button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium">Error Logging</p>
              <p className="mt-1 text-blue-700 dark:text-blue-300">
                Application errors are logged here for debugging production issues. Includes errors from OpenAI API, S3 operations, document/audio uploads, and conversations.
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
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Level:</label>
            <select
              value={levelFilter}
              onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              <option value="">All Levels</option>
              <option value="ERROR">Error</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Source:</label>
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm min-w-[200px]"
            >
              <option value="">All Sources</option>
              {uniqueSources.map(source => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>
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
            No error logs found
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Level</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Message</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {entries.map((entry) => {
                      const colors = levelColors[entry.level] || levelColors.ERROR;
                      return (
                        <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {formatLocalDateTime(entry.timestamp)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${colors.bg} ${colors.text}`}>
                              {entry.level}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-mono max-w-[200px] truncate" title={entry.source}>
                            {entry.source}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white max-w-[300px] truncate" title={entry.message}>
                            {entry.message}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedEntry(entry)}
                              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                            >
                              View
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
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Page {page} of {totalPages} ({total} total)
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedEntry && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedEntry(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Error Details</h3>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timestamp</label>
                <div className="text-sm text-gray-900 dark:text-gray-100">{formatLocalDateTime(selectedEntry.timestamp)}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Level</label>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${levelColors[selectedEntry.level]?.bg} ${levelColors[selectedEntry.level]?.text}`}>
                  {selectedEntry.level}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Source</label>
                <div className="text-sm font-mono text-gray-900 dark:text-gray-100">{selectedEntry.source}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{selectedEntry.message}</div>
              </div>
              {selectedEntry.stack_trace && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stack Trace</label>
                  <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto text-gray-900 dark:text-gray-100">
                    {selectedEntry.stack_trace}
                  </pre>
                </div>
              )}
              {selectedEntry.details && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Additional Details</label>
                  <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto text-gray-900 dark:text-gray-100">
                    {JSON.stringify(selectedEntry.details, null, 2)}
                  </pre>
                </div>
              )}
              {selectedEntry.user_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User ID</label>
                  <div className="text-sm font-mono text-gray-900 dark:text-gray-100">{selectedEntry.user_id}</div>
                </div>
              )}
              {selectedEntry.session_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Session ID</label>
                  <div className="text-sm font-mono text-gray-900 dark:text-gray-100">{selectedEntry.session_id}</div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmModal
        isOpen={showConfirmCleanup}
        onClose={() => setShowConfirmCleanup(false)}
        onConfirm={handleCleanup}
        title="Cleanup Error Logs"
        message={`This will permanently delete error logs older than ${cleanupDays} days. This action cannot be undone.`}
        confirmText="Delete Old Logs"
        danger
      />
    </AdminLayout>
  );
}
