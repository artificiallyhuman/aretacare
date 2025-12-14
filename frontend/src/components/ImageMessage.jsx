import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

const ImageMessage = ({ content, documentId, mediaUrl, extractedText, onThumbnailLoad, wasDeleted }) => {
  const [showExtracted, setShowExtracted] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div>
      {/* User message about image */}
      <div className="prose prose-sm max-w-none mb-2">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>

      {/* Image thumbnail */}
      {mediaUrl && !imageError ? (
        <div className="mt-2">
          <img
            src={mediaUrl}
            alt="Uploaded image"
            className="max-w-xs rounded cursor-pointer hover:opacity-90 transition"
            onClick={() => setShowFullImage(true)}
            onLoad={onThumbnailLoad}
            onError={() => setImageError(true)}
          />
        </div>
      ) : wasDeleted || imageError ? (
        /* Image was deleted (documentId is NULL) or image failed to load */
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
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <div>
            <p className="font-medium text-gray-600 dark:text-gray-400">Image Deleted</p>
            <p className="text-sm text-gray-500 dark:text-gray-500">This image is no longer available</p>
          </div>
        </div>
      ) : (
        /* No document ID = still uploading */
        <div className="flex items-center space-x-3 mt-2">
          <svg
            className="w-8 h-8 text-primary-600 dark:text-primary-400 animate-pulse"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Uploading image...</p>
          </div>
        </div>
      )}

      {/* Show extracted text if available (OCR) */}
      {extractedText && (
        <div className="mt-2">
          <button
            onClick={() => setShowExtracted(!showExtracted)}
            className="text-sm text-primary-600 hover:text-primary-700 underline"
          >
            {showExtracted ? 'Hide' : 'Show'} extracted text (OCR)
          </button>
          {showExtracted && (
            <div className="mt-2 p-3 bg-gray-50 rounded text-sm max-h-48 overflow-y-auto">
              {extractedText}
            </div>
          )}
        </div>
      )}

      {/* Full image modal */}
      {showFullImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setShowFullImage(false)}
        >
          <img
            src={mediaUrl}
            alt="Full size"
            className="max-w-full max-h-full rounded"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setShowFullImage(false)}
            className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageMessage;
