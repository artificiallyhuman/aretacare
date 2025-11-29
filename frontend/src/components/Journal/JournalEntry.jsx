import React, { useState } from 'react';
import { journalAPI } from '../../services/api';

const JournalEntry = ({ entry, colors, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this journal entry?')) {
      return;
    }

    setDeleting(true);
    try {
      await journalAPI.deleteEntry(entry.id);
      onDelete();
    } catch (err) {
      console.error('Error deleting entry:', err);
      alert('Failed to delete entry');
    } finally {
      setDeleting(false);
    }
  };

  const colorClass = colors[entry.entry_type] || 'bg-gray-100 text-gray-800';
  const isAI = entry.created_by === 'ai';

  return (
    <div className="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 hover:shadow-sm transition">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            {/* Entry type badge */}
            <span className={`text-xs px-2 py-0.5 rounded ${colorClass}`}>
              {entry.entry_type.replace('_', ' ')}
            </span>
            {/* AI badge if created by AI */}
            {isAI && (
              <span className="text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                AI
              </span>
            )}
          </div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{entry.title}</h4>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-1 ml-2">
          <button
            onClick={onEdit}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 p-1"
            title="Edit entry"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1 disabled:opacity-50"
            title="Delete entry"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content preview/full */}
      <p className={`text-sm text-gray-700 dark:text-gray-300 ${!expanded && entry.content.length > 100 ? 'line-clamp-2' : ''}`}>
        {entry.content}
      </p>

      {/* Expand/collapse if long content */}
      {entry.content.length > 100 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mt-1"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {/* Metadata */}
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {new Date(entry.created_at + 'Z').toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })}
      </div>
    </div>
  );
};

export default JournalEntry;
