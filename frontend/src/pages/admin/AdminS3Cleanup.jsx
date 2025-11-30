import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminAPI } from '../../services/api';

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function AdminS3Cleanup() {
  const [orphans, setOrphans] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchOrphans();
  }, []);

  const fetchOrphans = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminAPI.getOrphanedFiles();
      setOrphans(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load orphaned files');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (key) => {
    const newSelected = new Set(selectedKeys);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedKeys(newSelected);
  };

  const selectAll = () => {
    if (selectedKeys.size === orphans.files.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(orphans.files.map(f => f.key)));
    }
  };

  const selectByType = (type) => {
    const newSelected = new Set(selectedKeys);
    orphans.files.filter(f => f.file_type === type).forEach(f => newSelected.add(f.key));
    setSelectedKeys(newSelected);
  };

  const handleDelete = async () => {
    if (selectedKeys.size === 0) return;

    setDeleting(true);
    setError('');
    setMessage('');

    try {
      const response = await adminAPI.deleteOrphanedFiles(Array.from(selectedKeys));
      setMessage(`Deleted ${response.data.deleted_count} files${response.data.failed_count > 0 ? `, ${response.data.failed_count} failed` : ''}`);
      setSelectedKeys(new Set());
      fetchOrphans();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete files');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">S3 Cleanup</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Find and delete orphaned S3 files</p>
          </div>
          <button
            onClick={fetchOrphans}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg">
            {message}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">
            Scanning S3 bucket...
          </div>
        ) : orphans && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Orphaned Files</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{orphans.total_count}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Size</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatBytes(orphans.total_size)}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">By Type</p>
                <div className="text-sm text-gray-900 dark:text-white mt-1">
                  <span className="mr-2">Docs: {orphans.by_type.document || 0}</span>
                  <span className="mr-2">Thumbs: {orphans.by_type.thumbnail || 0}</span>
                  <span>Audio: {orphans.by_type.audio || 0}</span>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Selected</p>
                <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{selectedKeys.size}</p>
              </div>
            </div>

            {orphans.total_count === 0 ? (
              <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg text-center">
                No orphaned files found. Your S3 bucket is clean!
              </div>
            ) : (
              <>
                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={selectAll}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {selectedKeys.size === orphans.files.length ? 'Deselect All' : 'Select All'}
                  </button>
                  {orphans.by_type.document > 0 && (
                    <button
                      onClick={() => selectByType('document')}
                      className="px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50"
                    >
                      Select Documents ({orphans.by_type.document})
                    </button>
                  )}
                  {orphans.by_type.thumbnail > 0 && (
                    <button
                      onClick={() => selectByType('thumbnail')}
                      className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50"
                    >
                      Select Thumbnails ({orphans.by_type.thumbnail})
                    </button>
                  )}
                  {orphans.by_type.audio > 0 && (
                    <button
                      onClick={() => selectByType('audio')}
                      className="px-3 py-1.5 text-sm font-medium text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/30 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/50"
                    >
                      Select Audio ({orphans.by_type.audio})
                    </button>
                  )}
                  <button
                    onClick={handleDelete}
                    disabled={selectedKeys.size === 0 || deleting}
                    className="px-4 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting ? 'Deleting...' : `Delete Selected (${selectedKeys.size})`}
                  </button>
                </div>

                {/* File List */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 w-8"></th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Key</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Size</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Modified</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {orphans.files.map((file) => (
                          <tr
                            key={file.key}
                            className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${
                              selectedKeys.has(file.key) ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                            }`}
                            onClick={() => toggleSelection(file.key)}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedKeys.has(file.key)}
                                onChange={() => {}}
                                className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono truncate max-w-xs">
                              {file.key}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                file.file_type === 'document'
                                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
                                  : file.file_type === 'thumbnail'
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                                  : 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                              }`}>
                                {file.file_type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                              {formatBytes(file.size)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                              {new Date(file.last_modified).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
