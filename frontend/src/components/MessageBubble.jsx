import React, { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import DocumentMessage from './DocumentMessage';
import ImageMessage from './ImageMessage';
import api from '../services/api';
import { markdownToHtml } from '../utils/markdownUtils';

// Memoized to prevent re-renders when parent updates but message hasn't changed
const MessageBubble = memo(({ message, onThumbnailLoad, onMessageUpdate }) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);
  const isUser = message.role === 'user';
  const messageType = message.message_type || 'text';

  const handleCopy = async () => {
    try {
      // Convert markdown to HTML for rich text paste
      const html = markdownToHtml(message.content);

      // Create clipboard item with both HTML and plain text
      const blob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([message.content], { type: 'text/plain' });

      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blob,
          'text/plain': textBlob
        })
      ]);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback to plain text if clipboard API fails
      try {
        await navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy also failed:', fallbackErr);
      }
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedContent(message.content);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedContent(message.content);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const response = await api.patch(`/conversation/${message.id}`, {
        content: editedContent
      });

      // Update the message content in the parent component with the updated_at from server
      if (onMessageUpdate) {
        onMessageUpdate(message.id, editedContent, response.data.updated_at);
      }

      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update message:', error);
      alert('Failed to update message. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Check if message is from today
  const messageDate = new Date(message.created_at + 'Z');
  const today = new Date();
  const isToday = messageDate.toDateString() === today.toDateString();

  // Check if message has been edited
  // If updated_at exists, the message has been edited (it's NULL for new messages)
  const isEdited = !!message.updated_at;

  // Format timestamp
  const formatTimestamp = () => {
    if (isToday) {
      // Just show time for today's messages
      return messageDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      // Show date and time for older messages
      return messageDate.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] sm:max-w-md md:max-w-2xl lg:max-w-3xl rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
        }`}
      >
        {/* Render based on message type */}
        {messageType === 'text' && (
          isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className={`w-full min-h-[100px] p-2 rounded border ${
                  isUser
                    ? 'bg-primary-700 text-white border-primary-500 placeholder-primary-300'
                    : 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600'
                } focus:outline-none focus:ring-2 focus:ring-primary-500`}
                disabled={isSaving}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className={`px-3 py-1 text-sm rounded ${
                    isUser
                      ? 'bg-primary-700 hover:bg-primary-800 text-white'
                      : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100'
                  } disabled:opacity-50`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !editedContent.trim()}
                  className={`px-3 py-1 text-sm rounded ${
                    isUser
                      ? 'bg-white text-primary-600 hover:bg-gray-100'
                      : 'bg-primary-600 text-white hover:bg-primary-700'
                  } disabled:opacity-50`}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
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
                      ? <code className={`${isUser ? 'bg-primary-700' : 'bg-gray-200 dark:bg-gray-700'} px-1.5 py-0.5 rounded text-sm`} {...props} />
                      : <code className={`block ${isUser ? 'bg-primary-700' : 'bg-gray-200 dark:bg-gray-700'} p-3 rounded my-2 text-sm overflow-x-auto`} {...props} />,
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
          )
        )}

        {messageType === 'document' && (
          <DocumentMessage
            content={message.content}
            documentId={message.document_id}
            thumbnailUrl={message.thumbnail_url}
            extractedText={message.extracted_text}
            onThumbnailLoad={onThumbnailLoad}
          />
        )}

        {messageType === 'image' && (
          <ImageMessage
            content={message.content}
            mediaUrl={message.media_url}
            extractedText={message.extracted_text}
            onThumbnailLoad={onThumbnailLoad}
          />
        )}

        {/* Timestamp and Action Buttons */}
        {!isEditing && (
          <div className="flex items-center justify-between mt-2 gap-2">
            <div className={`text-xs flex items-center gap-1.5 ${isUser ? 'text-primary-100' : 'text-gray-500 dark:text-gray-400'}`}>
              {formatTimestamp()}
              {isEdited && (
                <span className={`italic ${isUser ? 'text-primary-200' : 'text-gray-400 dark:text-gray-500'}`}>
                  (edited)
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {/* Edit button - only for user messages */}
              {isUser && messageType === 'text' && (
                <button
                  onClick={handleEdit}
                  className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                    isUser
                      ? 'hover:bg-primary-700 text-primary-100'
                      : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                  title="Edit message"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="hidden sm:inline">Edit</span>
                </button>
              )}
              {/* Copy button */}
              <button
                onClick={handleCopy}
                className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                  isUser
                    ? 'hover:bg-primary-700 text-primary-100'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
                title="Copy message"
              >
                {copied ? (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="hidden sm:inline">Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// Display name for React DevTools
MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;
