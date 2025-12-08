import React, { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import DocumentMessage from './DocumentMessage';
import ImageMessage from './ImageMessage';

// Simple markdown to HTML converter for clipboard
const markdownToHtml = (markdown) => {
  let html = markdown;

  // Bold (do before italic to avoid conflicts)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Split into lines for processing
  const lines = html.split('\n');
  const processed = [];
  let listStack = []; // Track nested lists

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Horizontal rule
    if (trimmed.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      // Close any open lists
      while (listStack.length > 0) {
        processed.push(`</${listStack.pop()}>`);
      }
      processed.push('<hr>');
      continue;
    }

    // Headers (with inline styles to match conversation display)
    if (trimmed.match(/^### /)) {
      while (listStack.length > 0) { processed.push(`</${listStack.pop()}>`); }
      processed.push(trimmed.replace(/^### (.*)$/, '<h3 style="font-size: 1em; font-weight: 600; margin: 0.5em 0;">$1</h3>'));
      continue;
    } else if (trimmed.match(/^## /)) {
      while (listStack.length > 0) { processed.push(`</${listStack.pop()}>`); }
      processed.push(trimmed.replace(/^## (.*)$/, '<h2 style="font-size: 1.125em; font-weight: 600; margin: 0.5em 0;">$1</h2>'));
      continue;
    } else if (trimmed.match(/^# /)) {
      while (listStack.length > 0) { processed.push(`</${listStack.pop()}>`); }
      processed.push(trimmed.replace(/^# (.*)$/, '<h1 style="font-size: 1.25em; font-weight: 700; margin: 0.5em 0;">$1</h1>'));
      continue;
    }

    // Calculate indentation level
    const indent = line.search(/\S/);
    const indentLevel = indent === -1 ? 0 : Math.floor(indent / 2);

    // Check for list items (unordered or ordered)
    const ulMatch = trimmed.match(/^[\*\-] (.*)$/);
    const olMatch = trimmed.match(/^\d+\. (.*)$/);

    if (ulMatch || olMatch) {
      const content = ulMatch ? ulMatch[1] : olMatch[1];
      const listType = ulMatch ? 'ul' : 'ol';

      // Adjust list stack to match current indent level
      while (listStack.length > indentLevel + 1) {
        processed.push(`</${listStack.pop()}>`);
      }

      // Open new list if needed
      if (listStack.length === indentLevel) {
        processed.push(`<${listType}>`);
        listStack.push(listType);
      }

      processed.push(`<li>${content}</li>`);
      continue;
    }

    // Empty line
    if (trimmed === '') {
      // Close all lists on empty line
      while (listStack.length > 0) {
        processed.push(`</${listStack.pop()}>`);
      }
      // Only add paragraph break if there's more content coming
      if (i < lines.length - 1 && lines[i + 1].trim() !== '') {
        processed.push('</p><p>');
      }
      continue;
    }

    // Regular text
    if (listStack.length > 0) {
      while (listStack.length > 0) {
        processed.push(`</${listStack.pop()}>`);
      }
    }
    processed.push(line + '<br>');
  }

  // Close any remaining open lists
  while (listStack.length > 0) {
    processed.push(`</${listStack.pop()}>`);
  }

  // Join and wrap in paragraph
  html = '<p>' + processed.join('') + '</p>';

  // Clean up
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<[uo]l>)/g, '$1');
  html = html.replace(/(<\/[uo]l>)<\/p>/g, '$1');
  html = html.replace(/<p>(<h[123]>)/g, '$1');
  html = html.replace(/(<\/h[123]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr>)/g, '$1');
  html = html.replace(/(<hr>)<\/p>/g, '$1');
  html = html.replace(/<br><\/p>/g, '</p>');
  html = html.replace(/<p><br>/g, '<p>');

  return html;
};

// Memoized to prevent re-renders when parent updates but message hasn't changed
const MessageBubble = memo(({ message, onThumbnailLoad }) => {
  const [copied, setCopied] = useState(false);
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

  // Check if message is from today
  const messageDate = new Date(message.created_at + 'Z');
  const today = new Date();
  const isToday = messageDate.toDateString() === today.toDateString();

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

        {/* Timestamp and Copy Button */}
        <div className="flex items-center justify-between mt-2 gap-2">
          <div className={`text-xs ${isUser ? 'text-primary-100' : 'text-gray-500 dark:text-gray-400'}`}>
            {formatTimestamp()}
          </div>
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
    </div>
  );
});

// Display name for React DevTools
MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;
