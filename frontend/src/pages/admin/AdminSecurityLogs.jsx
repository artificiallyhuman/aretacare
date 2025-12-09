import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminAPI } from '../../services/api';
import { formatLocalDateTime } from '../../utils/dateUtils';

const eventTypeLabels = {
  failed_login: { label: 'Failed Login', color: 'red' },
  invalid_token: { label: 'Invalid Token', color: 'orange' },
  unauthorized_access: { label: 'Unauthorized Access', color: 'purple' },
  blocked_file_upload: { label: 'Blocked File Upload', color: 'yellow' },
  upload_failure: { label: 'Upload Failure', color: 'pink' },
};

export default function AdminSecurityLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const limit = 50;

  useEffect(() => {
    fetchSecurityLogs();
  }, [page, eventTypeFilter]);

  const fetchSecurityLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        page_size: limit,
        ...(eventTypeFilter && { event_type: eventTypeFilter }),
        ...(emailFilter && { email: emailFilter })
      };
      const response = await adminAPI.getSecurityLogs(params);
      setLogs(response.data.logs);
      setTotal(response.data.total);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load security logs');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchSecurityLogs();
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Security Logs</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Track unauthorized access attempts</p>
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium">Security Monitoring</p>
              <p className="mt-1 text-blue-700 dark:text-blue-300">
                This log tracks failed login attempts, invalid authentication tokens, unauthorized access attempts, blocked file uploads, and upload failures.
                Use this to identify potential security threats, suspicious activity, and abuse patterns.
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <label className="text-sm text-gray-600 dark:text-gray-400">Event type:</label>
            <select
              value={eventTypeFilter}
              onChange={(e) => { setEventTypeFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              <option value="">All Events</option>
              <option value="failed_login">Failed Login</option>
              <option value="invalid_token">Invalid Token</option>
              <option value="unauthorized_access">Unauthorized Access</option>
              <option value="blocked_file_upload">Blocked File Upload</option>
              <option value="upload_failure">Upload Failure</option>
            </select>
          </div>

          <form onSubmit={handleEmailSearch} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <label className="text-sm text-gray-600 dark:text-gray-400">Search email:</label>
            <input
              type="text"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              placeholder="Enter email to search..."
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm flex-1 max-w-md"
            />
            <button
              type="submit"
              className="px-4 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Search
            </button>
            {emailFilter && (
              <button
                type="button"
                onClick={() => { setEmailFilter(''); setPage(1); fetchSecurityLogs(); }}
                className="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-4 py-8 rounded-lg text-center">
            No security log entries found
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Event</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">IP Address</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Details</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {logs.map((log) => {
                      const eventConfig = eventTypeLabels[log.event_type] || { label: log.event_type, color: 'gray' };
                      return (
                        <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {formatLocalDateTime(log.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full bg-${eventConfig.color}-100 dark:bg-${eventConfig.color}-900/50 text-${eventConfig.color}-800 dark:text-${eventConfig.color}-300`}>
                              {eventConfig.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {log.email || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
                            {log.ip_address || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {log.details || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedLog(log)}
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
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} entries
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        {/* Detail Modal */}
        {selectedLog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedLog(null)}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Security Log Details</h3>
                  <button
                    onClick={() => setSelectedLog(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-3 text-sm">
                  <div><span className="font-medium text-gray-700 dark:text-gray-300">Time:</span> <span className="text-gray-900 dark:text-white">{formatLocalDateTime(selectedLog.created_at)}</span></div>
                  <div><span className="font-medium text-gray-700 dark:text-gray-300">Event Type:</span> <span className="text-gray-900 dark:text-white">{selectedLog.event_type}</span></div>
                  <div><span className="font-medium text-gray-700 dark:text-gray-300">Email:</span> <span className="text-gray-900 dark:text-white">{selectedLog.email || 'N/A'}</span></div>
                  <div><span className="font-medium text-gray-700 dark:text-gray-300">User ID:</span> <span className="text-gray-900 dark:text-white font-mono">{selectedLog.user_id || 'N/A'}</span></div>
                  <div><span className="font-medium text-gray-700 dark:text-gray-300">IP Address:</span> <span className="text-gray-900 dark:text-white font-mono">{selectedLog.ip_address || 'N/A'}</span></div>
                  <div><span className="font-medium text-gray-700 dark:text-gray-300">Endpoint:</span> <span className="text-gray-900 dark:text-white">{selectedLog.endpoint || 'N/A'}</span></div>
                  <div><span className="font-medium text-gray-700 dark:text-gray-300">User Agent:</span> <span className="text-gray-900 dark:text-white text-xs break-all">{selectedLog.user_agent || 'N/A'}</span></div>
                  <div><span className="font-medium text-gray-700 dark:text-gray-300">Details:</span> <span className="text-gray-900 dark:text-white">{selectedLog.details || 'N/A'}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
