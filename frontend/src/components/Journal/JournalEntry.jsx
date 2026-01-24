import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { journalAPI } from '../../services/api';
import SourceTag from '../SourceTag';

const JournalEntry = ({ entry, colors, onEdit, onDelete, hasCollaborators, currentUserId }) => {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const contentRef = React.useRef(null);

  // Check if content is clamped after render
  React.useEffect(() => {
    if (contentRef.current && !expanded) {
      const isContentClamped = contentRef.current.scrollHeight > contentRef.current.clientHeight;
      setIsClamped(isContentClamped);
    }
  }, [entry.content, expanded]);

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      await journalAPI.deleteEntry(entry.id);
      onDelete();
    } catch (err) {
      console.error('Error deleting entry:', err);
      // Show error in a nicer way
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
            {/* Source tag for collaborative sessions */}
            {/* For AI entries: show editor tag if edited by a user */}
            {/* For manual entries: show editor tag if edited, otherwise creator tag */}
            {hasCollaborators && (isAI ? entry.last_edited_by : (entry.last_edited_by || entry.created_by_info)) && (
              <SourceTag
                sourceTag={entry.last_edited_by || entry.created_by_info}
                currentUserId={currentUserId}
                variant="small"
              />
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
      <div
        ref={contentRef}
        className={`text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none ${!expanded ? 'line-clamp-4' : ''}`}
      >
        <ReactMarkdown
          components={{
            // Custom paragraph spacing
            p: ({node, ...props}) => <p className="mb-2 leading-relaxed" {...props} />,
            // Compact lists
            ul: ({node, ...props}) => <ul className="mb-2 ml-4 list-disc" {...props} />,
            ol: ({node, ...props}) => <ol className="mb-2 ml-4 list-decimal" {...props} />,
            li: ({node, ...props}) => <li className="mb-1" {...props} />,
            // Headers
            h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-2 mt-3" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-base font-bold mb-2 mt-3" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-1 mt-2" {...props} />,
            // Strong text
            strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
          }}
        >
          {entry.content}
        </ReactMarkdown>
      </div>

      {/* Expand/collapse button - only show if content is actually clamped */}
      {isClamped && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mt-1"
        >
          Show more
        </button>
      )}

      {expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mt-1"
        >
          Show less
        </button>
      )}

      {/* Metadata */}
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {new Date(entry.created_at + 'Z').toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Delete Journal Entry</h2>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Delete "{entry.title}"?
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This journal entry will be permanently removed
                  </p>
                </div>
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3">
                <p className="text-sm text-orange-900 dark:text-orange-200 mb-2 font-medium">
                  Entry Details:
                </p>
                <ul className="text-sm text-orange-800 dark:text-orange-300 space-y-1.5">
                  <li>• <strong>Type:</strong> {entry.entry_type.replace('_', ' ')}</li>
                  {entry.created_by === 'ai' && (
                    <li>• <strong>Created by:</strong> AI</li>
                  )}
                  <li>• <strong>Created:</strong> {new Date(entry.created_at + 'Z').toLocaleString()}</li>
                </ul>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-4 py-3">
                <p className="text-sm text-red-900 dark:text-red-200 font-bold">
                  This action cannot be undone. The journal entry will be permanently deleted.
                </p>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 font-medium disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JournalEntry;
