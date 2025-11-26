import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

const ImageMessage = ({ content, mediaUrl, extractedText }) => {
  const [showExtracted, setShowExtracted] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  return (
    <div>
      {/* User message about image */}
      <div className="prose prose-sm max-w-none mb-2">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>

      {/* Image thumbnail */}
      {mediaUrl && (
        <div className="mt-2">
          <img
            src={mediaUrl}
            alt="Uploaded image"
            className="max-w-xs rounded cursor-pointer hover:opacity-90 transition"
            onClick={() => setShowFullImage(true)}
          />
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
