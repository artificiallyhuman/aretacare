import React from 'react';
import ReactMarkdown from 'react-markdown';
import DocumentMessage from './DocumentMessage';
import ImageMessage from './ImageMessage';

const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user';
  const messageType = message.message_type || 'text';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-3xl rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        {/* Render based on message type */}
        {messageType === 'text' && (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {messageType === 'document' && (
          <DocumentMessage
            content={message.content}
            documentId={message.document_id}
            extractedText={message.extracted_text}
          />
        )}

        {messageType === 'image' && (
          <ImageMessage
            content={message.content}
            mediaUrl={message.media_url}
            extractedText={message.extracted_text}
          />
        )}

        {/* Timestamp */}
        <div className={`text-xs mt-2 ${isUser ? 'text-primary-100' : 'text-gray-500'}`}>
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
