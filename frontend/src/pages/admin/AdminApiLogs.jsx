import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminAPI } from '../../services/api';
import { formatLocalDateTime } from '../../utils/dateUtils';

const featureLabels = {
  conversation: 'Conversation',
  chat: 'Chat',
  daily_plan: 'Daily Plan',
  jargon_translator: 'Jargon Translator',
  conversation_coach: 'Conversation Coach',
  document_categorization: 'Document Categorization',
  audio_categorization: 'Audio Categorization',
  medical_summary: 'Medical Summary',
  journal_document_synthesis: 'Journal (Document)',
  journal_audio_synthesis: 'Journal (Audio)',
  journal_conversation_synthesis: 'Journal (Conversation)',
};

export default function AdminApiLogs() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [featureFilter, setFeatureFilter] = useState('');
  const [successFilter, setSuccessFilter] = useState('');

  useEffect(() => {
    fetchApiLogs();
  }, [featureFilter, successFilter]);

  const fetchApiLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (featureFilter) params.feature = featureFilter;
      if (successFilter !== '') params.success = successFilter === 'true';

      const response = await adminAPI.getApiLogs(params);
      setData(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load API logs');
    } finally {
      setLoading(false);
    }
  };

  const formatTokens = (tokens) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toLocaleString();
  };

  const formatMs = (ms) => {
    if (ms === null || ms === undefined) return '-';
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };

  // Get unique features from logs for filter dropdown
  const uniqueFeatures = data?.logs ? [...new Set(data.logs.map(l => l.feature))].sort() : [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">API Logs</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">GPT-5.2 API requests (last 24 hours)</p>
        </div>

        {/* Summary Cards */}
        {data?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Requests</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {data.summary.total_requests.toLocaleString()}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Success Rate</div>
              <div className={`text-2xl font-bold mt-1 ${data.summary.total_requests === 0 ? 'text-gray-400 dark:text-gray-500' : data.summary.success_rate >= 95 ? 'text-green-600 dark:text-green-400' : data.summary.success_rate >= 80 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                {data.summary.total_requests === 0 ? '-' : `${data.summary.success_rate}%`}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-500">
                {data.summary.total_requests === 0 ? 'No requests' : `${data.summary.successful_requests} / ${data.summary.total_requests}`}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Input Tokens</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {formatTokens(data.summary.total_input_tokens)}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Output Tokens</div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                {formatTokens(data.summary.total_output_tokens)}
              </div>
            </div>
          </div>
        )}

        {/* Additional Metrics Row */}
        {data?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Avg Response Time</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                {formatMs(data.summary.avg_response_time_ms)}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Failed Requests</div>
              <div className={`text-xl font-bold mt-1 ${data.summary.failed_requests > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {data.summary.failed_requests}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Tokens</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                {formatTokens(data.summary.total_input_tokens + data.summary.total_output_tokens)}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Feature:</label>
            <select
              value={featureFilter}
              onChange={(e) => setFeatureFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm min-w-[180px]"
            >
              <option value="">All Features</option>
              {uniqueFeatures.map(feature => (
                <option key={feature} value={feature}>{featureLabels[feature] || feature}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Status:</label>
            <select
              value={successFilter}
              onChange={(e) => setSuccessFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              <option value="">All</option>
              <option value="true">Success</option>
              <option value="false">Failed</option>
            </select>
          </div>
          <button
            onClick={fetchApiLogs}
            className="px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading...</div>
        ) : !data?.logs || data.logs.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-4 py-8 rounded-lg text-center">
            No API logs found in the last 24 hours
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Feature</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Input Tokens</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Output Tokens</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Response Time</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatLocalDateTime(log.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {featureLabels[log.feature] || log.feature}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right font-mono">
                        {log.input_tokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right font-mono">
                        {log.output_tokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right font-mono">
                        {formatMs(log.response_time_ms)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {log.success ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                            Success
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300" title={log.error_message}>
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-500 font-mono truncate max-w-[120px]" title={log.user_id}>
                        {log.user_id ? log.user_id.substring(0, 8) + '...' : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Info about data window */}
        <div className="text-center text-sm text-gray-500 dark:text-gray-500">
          Showing {data?.logs?.length || 0} requests from the last 24 hours
        </div>
      </div>
    </AdminLayout>
  );
}
