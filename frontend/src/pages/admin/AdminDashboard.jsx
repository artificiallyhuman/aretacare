import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminAPI } from '../../services/api';

function MetricCard({ title, value, subtitle, icon, color, loading }) {
  const colorClasses = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    pink: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
    cyan: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 md:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400 truncate">{title}</p>
          {loading ? (
            <div className="h-6 md:h-8 w-12 md:w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1"></div>
          ) : (
            <>
              <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {value?.toLocaleString() ?? '-'}
              </p>
              {subtitle && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
              )}
            </>
          )}
        </div>
        <div className={`p-2 md:p-3 rounded-full flex-shrink-0 ${colorClasses[color] || colorClasses.blue}`}>
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
          </svg>
        </div>
      </div>
    </div>
  );
}

function TrendChart({ data, loading, title }) {
  const [hoveredBar, setHoveredBar] = React.useState(null);

  // Format date for display (MM/DD format)
  // Backend returns dates in user's local timezone, so just parse and display
  const formatDate = (dateStr) => {
    const [year, month, day] = dateStr.split('-');
    return `${parseInt(month)}/${parseInt(day)}`;
  };

  if (loading) {
    return (
      <div className="h-32 bg-gray-100 dark:bg-gray-700 rounded animate-pulse"></div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-gray-500 dark:text-gray-400">
        No data available
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">Total: {total}</span>
      </div>
      <div className="flex items-end h-24 gap-1">
        {data.slice(-30).map((d, i) => (
          <div
            key={i}
            className="flex-1 bg-primary-500 dark:bg-primary-600 rounded-t hover:bg-primary-600 dark:hover:bg-primary-500 transition-colors cursor-pointer relative"
            style={{ height: `${(d.count / maxCount) * 100}%`, minHeight: d.count > 0 ? '4px' : '0' }}
            onMouseEnter={() => setHoveredBar(i)}
            onMouseLeave={() => setHoveredBar(null)}
          >
            {hoveredBar === i && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap z-10 pointer-events-none">
                <div className="font-semibold">{d.count}</div>
                <div className="text-gray-300 dark:text-gray-400">{formatDate(d.date)}</div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
        <span>30 days ago</span>
        <span>Today</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [trends, setTrends] = useState({});
  const [loading, setLoading] = useState(true);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMetrics();
    fetchTrends();
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await adminAPI.getMetrics();
      setMetrics(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrends = async () => {
    try {
      // Get user's local date in YYYY-MM-DD format
      const today = new Date();
      const userDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      // Get user's timezone offset in hours (negative for timezones behind UTC like PST)
      const timezoneOffsetHours = -Math.round(today.getTimezoneOffset() / 60);

      const metricTypes = ['users', 'sessions', 'collaborators', 'documents', 'audio', 'conversations', 'error_logs', 'security_logs'];
      const trendData = {};

      for (const metric of metricTypes) {
        const response = await adminAPI.getMetricsTrend(metric, 30, userDate, timezoneOffsetHours);
        trendData[metric] = response.data.data;
      }

      setTrends(trendData);
    } catch (err) {
      console.error('Failed to load trends:', err);
    } finally {
      setTrendsLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Platform overview and metrics</p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            title="Users"
            value={metrics?.user_count}
            subtitle={metrics?.weekly_active_percentage != null ? `${metrics.weekly_active_percentage}% weekly active` : null}
            icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            color="blue"
            loading={loading}
          />
          <MetricCard
            title="Sessions"
            value={metrics?.session_count}
            subtitle={metrics?.avg_sessions_per_user != null ? `${metrics.avg_sessions_per_user.toFixed(1)} avg per user` : null}
            icon="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            color="green"
            loading={loading}
          />
          <MetricCard
            title="Collaborators"
            value={metrics?.collaborator_count}
            subtitle={metrics?.avg_collaborators_per_user != null ? `${metrics.avg_collaborators_per_user.toFixed(1)} avg per user` : null}
            icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            color="indigo"
            loading={loading}
          />
          <MetricCard
            title="Pending Invites"
            value={metrics?.pending_invitation_count}
            subtitle={metrics?.avg_pending_invitations_per_user != null ? `${metrics.avg_pending_invitations_per_user.toFixed(1)} avg per user` : null}
            icon="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            color="orange"
            loading={loading}
          />
          <MetricCard
            title="Messages"
            value={metrics?.conversation_count}
            subtitle={metrics?.avg_messages_per_user != null ? `${metrics.avg_messages_per_user.toFixed(1)} avg per user` : null}
            icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            color="pink"
            loading={loading}
          />
          <MetricCard
            title="Journal Entries"
            value={metrics?.journal_count}
            subtitle={metrics?.avg_journal_entries_per_user != null ? `${metrics.avg_journal_entries_per_user.toFixed(1)} avg per user` : null}
            icon="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            color="cyan"
            loading={loading}
          />
          <MetricCard
            title="Documents"
            value={metrics?.document_count}
            subtitle={metrics?.avg_documents_per_user != null ? `${metrics.avg_documents_per_user.toFixed(1)} avg per user` : null}
            icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            color="purple"
            loading={loading}
          />
          <MetricCard
            title="Audio Recordings"
            value={metrics?.audio_count}
            subtitle={metrics?.avg_audio_per_user != null ? `${metrics.avg_audio_per_user.toFixed(1)} avg per user` : null}
            icon="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            color="orange"
            loading={loading}
          />
        </div>

        {/* Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <TrendChart data={trends.users} loading={trendsLoading} title="Users (30 days)" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <TrendChart data={trends.sessions} loading={trendsLoading} title="Sessions (30 days)" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <TrendChart data={trends.collaborators} loading={trendsLoading} title="Collaborators (30 days)" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <TrendChart data={trends.conversations} loading={trendsLoading} title="Messages (30 days)" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <TrendChart data={trends.documents} loading={trendsLoading} title="Documents Uploaded (30 days)" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <TrendChart data={trends.audio} loading={trendsLoading} title="Audio Recordings (30 days)" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <TrendChart data={trends.error_logs} loading={trendsLoading} title="Error Logs (30 days)" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <TrendChart data={trends.security_logs} loading={trendsLoading} title="Security Events (30 days)" />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              to="/admin/accounts"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Inactive Accounts</span>
            </Link>
            <Link
              to="/admin/accounts?tab=unusual"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Unusual Activity</span>
            </Link>
            <Link
              to="/admin/security-logs"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Security Logs</span>
            </Link>
            <Link
              to="/admin/health"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">System Health</span>
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
