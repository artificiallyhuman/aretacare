import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../hooks/useSession';
import { conversationAPI, documentAPI, journalAPI } from '../services/api';
import MessageBubble from '../components/MessageBubble';
import MessageInput from '../components/MessageInput';
import JournalPanel from '../components/Journal/JournalPanel';
import Disclaimer from '../components/Disclaimer';

const Conversation = () => {
  const { sessionId, loading: sessionLoading } = useSession();
  const [messages, setMessages] = useState([]);
  const [journalEntries, setJournalEntries] = useState({});
  const [journalPanelOpen, setJournalPanelOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Check if user is near bottom of chat
  const checkIfNearBottom = () => {
    if (!messagesContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const threshold = 150; // pixels from bottom
    return scrollHeight - scrollTop - clientHeight < threshold;
  };

  // Handle scroll events to show/hide scroll button
  const handleScroll = () => {
    const isNearBottom = checkIfNearBottom();
    isNearBottomRef.current = isNearBottom;
    setShowScrollButton(!isNearBottom && messages.length > 0);
  };

  // Auto-scroll only if user is near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [messages]);

  useEffect(() => {
    if (sessionId) {
      loadConversationHistory();
      loadJournalEntries();
    }
  }, [sessionId]);

  const loadConversationHistory = async () => {
    try {
      const response = await conversationAPI.getHistory(sessionId);
      setMessages(response.data.messages);
    } catch (err) {
      console.error('Error loading conversation history:', err);
    }
  };

  const loadJournalEntries = async () => {
    try {
      const response = await journalAPI.getEntries(sessionId);
      setJournalEntries(response.data.entries_by_date);
    } catch (err) {
      console.error('Error loading journal entries:', err);
    }
  };

  const handleSendMessage = async (content, file) => {
    if (!sessionId) return;

    setLoading(true);
    setError('');

    // Scroll to bottom when sending a message
    setTimeout(() => scrollToBottom('smooth'), 100);

    try {
      let documentId = null;
      let messageType = 'text';

      // Upload file if present
      if (file) {
        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await documentAPI.upload(formData, sessionId);
        documentId = uploadResponse.data.id;
        messageType = file.type.startsWith('image/') ? 'image' : 'document';

        // If user didn't provide text, use a default message
        if (!content.trim()) {
          content = file.type.startsWith('image/')
            ? 'I uploaded an image'
            : 'I uploaded a document';
        }
      }

      // Send message
      const response = await conversationAPI.sendMessage({
        content,
        session_id: sessionId,
        message_type: messageType,
        document_id: documentId
      });

      // Add user message and AI response to messages
      await loadConversationHistory();

      // Reload journal if new entries were created
      if (response.data.journal_suggestion?.should_create) {
        await loadJournalEntries();
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleJournalUpdate = () => {
    // Reload journal when user adds/edits/deletes entry
    loadJournalEntries();
  };

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Disclaimer */}
      <Disclaimer />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Journal Panel (collapsible sidebar) */}
        <div
          className={`${
            journalPanelOpen ? 'w-80' : 'w-0'
          } transition-all duration-300 overflow-hidden border-r border-gray-200 bg-gray-50`}
        >
          <JournalPanel
            sessionId={sessionId}
            entries={journalEntries}
            isOpen={journalPanelOpen}
            onToggle={() => setJournalPanelOpen(!journalPanelOpen)}
            onUpdate={handleJournalUpdate}
          />
        </div>

        {/* Conversation area */}
        <div className="flex-1 flex flex-col relative">
          {/* Toggle journal button (mobile-friendly) */}
          <div className="border-b border-gray-200 bg-white p-2 flex items-center">
            <button
              onClick={() => setJournalPanelOpen(!journalPanelOpen)}
              className="text-sm text-gray-600 hover:text-primary-600 flex items-center space-x-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>{journalPanelOpen ? 'Hide' : 'Show'} Journal</span>
            </button>
          </div>

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
          >
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">Start a conversation</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Share updates, ask questions, or upload documents about your care journey.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <div className="absolute bottom-20 right-6 z-10">
              <button
                onClick={() => scrollToBottom('smooth')}
                className="bg-primary-600 text-white rounded-full p-3 shadow-lg hover:bg-primary-700 transition-all transform hover:scale-110"
                title="Scroll to bottom"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Input */}
          <MessageInput
            onSendMessage={handleSendMessage}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
};

export default Conversation;
