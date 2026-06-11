import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { markdownLinkComponents } from '../utils/markdownComponents';

const DocumentMessage = ({ content, documentId, thumbnailUrl, extractedText, onThumbnailLoad, wasDeleted }) => {
  const [showExtracted, setShowExtracted] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div>
      {/* User message about document */}
      <div className="prose prose-sm max-w-none mb-2">
        <ReactMarkdown components={markdownLinkComponents}>{content}</ReactMarkdown>
      </div>

      {/* Document thumbnail or icon */}
      {thumbnailUrl && !imageError ? (
        <div className="mt-2">
          <img
            src={thumbnailUrl}
            alt="Document thumbnail"
            className="max-w-xs rounded border border-gray-300 dark:border-gray-600"
            onLoad={onThumbnailLoad}
            onError={() => setImageError(true)}
          />
        </div>
      ) : wasDeleted || imageError ? (
        /* Document was deleted (documentId is NULL) or image failed to load */
        <div className="flex items-center space-x-3 mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">
          <svg
            className="w-8 h-8 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <div>
            <p className="font-medium text-gray-600 dark:text-gray-400">Document Deleted</p>
            <p className="text-sm text-gray-500 dark:text-gray-500">This document is no longer available</p>
          </div>
        </div>
      ) : documentId ? (
        /* Document uploaded but no thumbnail (e.g., TXT files) */
        <div className="flex items-center space-x-3 mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">
          <svg
            className="w-8 h-8 text-gray-500 dark:text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <div>
            <p className="font-medium text-gray-700 dark:text-gray-300">Text Document</p>
          </div>
        </div>
      ) : (
        /* No document ID = still uploading */
        <div className="flex items-center space-x-3 mt-2">
          <svg
            className="w-8 h-8 opacity-75 animate-pulse"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <div>
            <p className="font-medium">Uploading document...</p>
          </div>
        </div>
      )}

      {/* Show extracted text if available */}
      {extractedText && (
        <div className="mt-2">
          <button
            onClick={() => setShowExtracted(!showExtracted)}
            className="text-sm text-primary-600 hover:text-primary-700 underline"
          >
            {showExtracted ? 'Hide' : 'Show'} extracted text
          </button>
          {showExtracted && (
            <div className="mt-2 p-3 bg-gray-50 rounded text-sm max-h-48 overflow-y-auto">
              {extractedText}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentMessage;
