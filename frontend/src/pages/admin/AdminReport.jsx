import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminAPI } from '../../services/api';

export default function AdminReport() {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await adminAPI.getReports();
      const reportsData = response.data.reports || [];
      setReports(reportsData);

      // Auto-select the most recent report
      if (reportsData.length > 0) {
        setSelectedReport(reportsData[0]);
      }
    } catch (err) {
      console.error('Error loading reports:', err);
      setError(err.response?.data?.detail || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNew = async () => {
    try {
      setGenerating(true);
      setError('');
      const response = await adminAPI.generateReport();

      // Reload reports to get the updated list
      await loadReports();

      // Select the new report
      setSelectedReport(response.data.report);
    } catch (err) {
      console.error('Error generating report:', err);
      setError(err.response?.data?.detail || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectReport = (report) => {
    setSelectedReport(report);
    setShowSidebar(false); // Close sidebar on mobile after selection
  };

  const formatDate = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatShortDate = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const isToday = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Check if today's report exists
  const hasTodaysReport = reports.length > 0 && isToday(reports[0].date);

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Daily Report</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              AI-powered analysis of system logs for security and operational insights
            </p>
          </div>
          <button
            onClick={handleGenerateNew}
            disabled={generating}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              generating
                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 text-white'
            }`}
          >
            {generating ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Generating...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{hasTodaysReport ? 'Regenerate' : 'Generate'} Report</span>
              </>
            )}
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Mobile sidebar toggle */}
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="lg:hidden flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>Report History ({reports.length})</span>
        </button>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Report List */}
          <div className={`lg:col-span-1 ${showSidebar ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-12rem)]">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white">Report History</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Last 30 days
                </p>
              </div>

              <div className="overflow-y-auto max-h-96 lg:max-h-[calc(100vh-20rem)]">
                {loading ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    Loading...
                  </div>
                ) : reports.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    No reports yet
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {reports.map((report) => (
                      <li key={report.id}>
                        <button
                          onClick={() => handleSelectReport(report)}
                          className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-between ${
                            selectedReport?.id === report.id
                              ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-500'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          }`}
                        >
                          <div>
                            <p className={`text-sm font-medium ${
                              selectedReport?.id === report.id
                                ? 'text-primary-700 dark:text-primary-300'
                                : 'text-gray-900 dark:text-white'
                            }`}>
                              {isToday(report.date) ? 'Today' : formatShortDate(report.date)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {report.security_log_count + report.error_log_count + report.api_log_count} logs analyzed
                            </p>
                          </div>
                          {/* Status indicator */}
                          <div className={`w-2.5 h-2.5 rounded-full ${
                            report.has_concerns
                              ? 'bg-red-500'
                              : 'bg-green-500'
                          }`} title={report.has_concerns ? 'Concerns found' : 'All clear'}></div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Main content - Selected Report */}
          <div className="lg:col-span-3">
            {!selectedReport ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
                <svg className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {reports.length === 0 ? 'No Reports Generated' : 'Select a Report'}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  {reports.length === 0
                    ? 'Click the button above to generate your first daily report.'
                    : 'Choose a report from the sidebar to view its contents.'}
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                {/* Report header */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      selectedReport.has_concerns
                        ? 'bg-red-100 dark:bg-red-900/30'
                        : 'bg-green-100 dark:bg-green-900/30'
                    }`}>
                      {selectedReport.has_concerns ? (
                        <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900 dark:text-white">
                        {formatDate(selectedReport.date)}
                      </h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Generated at {new Date(selectedReport.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    selectedReport.has_concerns
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  }`}>
                    {selectedReport.has_concerns ? 'Concerns Found' : 'All Clear'}
                  </div>
                </div>

                {/* Report content */}
                <div className="p-6">
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-600 dark:prose-p:text-gray-300">
                    <ReactMarkdown
                      components={{
                        h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4" {...props} />,
                        h2: ({node, ...props}) => <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-6 mb-3" {...props} />,
                        h3: ({node, ...props}) => <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2" {...props} />,
                        p: ({node, ...props}) => <p className="text-gray-600 dark:text-gray-300 mb-4" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300 mb-4" {...props} />,
                        li: ({node, ...props}) => <li className="text-gray-600 dark:text-gray-300" {...props} />,
                        strong: ({node, ...props}) => <strong className="font-semibold text-gray-900 dark:text-white" {...props} />,
                      }}
                    >
                      {selectedReport.content}
                    </ReactMarkdown>
                  </div>
                </div>

                {/* Report footer with metrics */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 rounded-b-lg">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {selectedReport.security_log_count}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Security Events</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {selectedReport.error_log_count}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Error Logs</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {selectedReport.api_log_count}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">API Calls</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
