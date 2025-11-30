import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminAPI } from '../../services/api';

function StatusBadge({ status }) {
  const statusConfig = {
    healthy: {
      color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    degraded: {
      color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    unhealthy: {
      color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
    },
  };

  const config = statusConfig[status] || statusConfig.unhealthy;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium ${config.color}`}>
      {config.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ServiceCard({ service }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900 dark:text-white capitalize">{service.name}</h3>
        <StatusBadge status={service.status} />
      </div>
      <div className="space-y-2">
        {service.latency_ms !== null && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Latency</span>
            <span className={`font-medium ${
              service.latency_ms < 100
                ? 'text-green-600 dark:text-green-400'
                : service.latency_ms < 500
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-red-600 dark:text-red-400'
            }`}>
              {service.latency_ms.toFixed(0)}ms
            </span>
          </div>
        )}
        {service.message && (
          <div className="text-sm text-gray-500 dark:text-gray-400 truncate" title={service.message}>
            {service.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastChecked, setLastChecked] = useState(null);

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminAPI.getSystemHealth();
      setHealth(response.data);
      setLastChecked(new Date());
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to check system health');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Health</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor service status and connectivity</p>
          </div>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {loading && !health ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">
            Checking system health...
          </div>
        ) : health && (
          <>
            {/* Overall Status */}
            <div className={`rounded-lg p-6 ${
              health.status === 'healthy'
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : health.status === 'degraded'
                ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-full ${
                    health.status === 'healthy'
                      ? 'bg-green-100 dark:bg-green-800'
                      : health.status === 'degraded'
                      ? 'bg-yellow-100 dark:bg-yellow-800'
                      : 'bg-red-100 dark:bg-red-800'
                  }`}>
                    {health.status === 'healthy' ? (
                      <svg className="w-8 h-8 text-green-600 dark:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    ) : health.status === 'degraded' ? (
                      <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 text-red-600 dark:text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${
                      health.status === 'healthy'
                        ? 'text-green-800 dark:text-green-200'
                        : health.status === 'degraded'
                        ? 'text-yellow-800 dark:text-yellow-200'
                        : 'text-red-800 dark:text-red-200'
                    }`}>
                      System {health.status === 'healthy' ? 'Operational' : health.status === 'degraded' ? 'Degraded' : 'Down'}
                    </h2>
                    <p className={`text-sm ${
                      health.status === 'healthy'
                        ? 'text-green-600 dark:text-green-300'
                        : health.status === 'degraded'
                        ? 'text-yellow-600 dark:text-yellow-300'
                        : 'text-red-600 dark:text-red-300'
                    }`}>
                      {health.services.filter(s => s.status === 'healthy').length} of {health.services.length} services healthy
                    </p>
                  </div>
                </div>
                {lastChecked && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Last checked: {lastChecked.toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>

            {/* Service Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {health.services.map((service) => (
                <ServiceCard key={service.name} service={service} />
              ))}
            </div>

            {/* Service Details Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">Service Details</h3>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Service</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Latency</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {health.services.map((service) => (
                    <tr key={service.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white capitalize">
                        {service.name}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={service.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {service.latency_ms !== null ? `${service.latency_ms.toFixed(0)}ms` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {service.message || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
