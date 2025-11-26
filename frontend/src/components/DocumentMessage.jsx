import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

const DocumentMessage = ({ content, documentId, extractedText }) => {
  const [showExtracted, setShowExtracted] = useState(false);

  return (
    <div>
      {/* Document icon and info */}
      <div className="flex items-center space-x-3 mb-2">
        <svg
          className="w-8 h-8 text-primary-600"
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
          <p className="font-medium">Document Uploaded</p>
          {documentId && (
            <p className="text-sm text-gray-600">ID: {documentId}</p>
          )}
        </div>
      </div>

      {/* User message about document */}
      <div className="prose prose-sm max-w-none mb-2">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>

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
