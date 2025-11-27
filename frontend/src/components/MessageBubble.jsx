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
        className={`max-w-[85%] sm:max-w-md md:max-w-2xl lg:max-w-3xl rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        {/* Render based on message type */}
        {messageType === 'text' && (
          <div className={`prose prose-sm max-w-none ${
            isUser
              ? 'prose-invert prose-headings:text-white prose-p:text-white prose-li:text-white prose-strong:text-white'
              : 'prose-gray prose-headings:text-gray-900 prose-p:text-gray-800'
          }`}>
            <ReactMarkdown
              components={{
                // Custom paragraph spacing
                p: ({node, ...props}) => <p className="mb-2 leading-relaxed" {...props} />,
                // Custom heading styles
                h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-3 mt-4" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-lg font-semibold mb-2 mt-3" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-base font-semibold mb-2 mt-3" {...props} />,
                // Custom list styles with better spacing
                ul: ({node, ...props}) => <ul className="mb-3 space-y-1 pl-5" {...props} />,
                ol: ({node, ...props}) => <ol className="mb-3 space-y-1 pl-5" {...props} />,
                li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                // Code blocks
                code: ({node, inline, ...props}) =>
                  inline
                    ? <code className={`${isUser ? 'bg-primary-700' : 'bg-gray-200'} px-1.5 py-0.5 rounded text-sm`} {...props} />
                    : <code className={`block ${isUser ? 'bg-primary-700' : 'bg-gray-200'} p-3 rounded my-2 text-sm overflow-x-auto`} {...props} />,
                // Blockquotes
                blockquote: ({node, ...props}) => (
                  <blockquote className={`border-l-4 ${isUser ? 'border-white' : 'border-primary-400'} pl-4 my-2 italic`} {...props} />
                ),
                // Strong/bold text
                strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
              }}
            >
              {message.content}
            </ReactMarkdown>
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
          {new Date(message.created_at + 'Z').toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
