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
  const [journalPanelOpen, setJournalPanelOpen] = useState(false);
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

  // Auto-scroll only if user is near bottom and there are messages
  useEffect(() => {
    if (messages.length > 0 && isNearBottomRef.current) {
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
          } hidden md:block transition-all duration-300 overflow-hidden border-r border-gray-200 bg-gray-50`}
        >
          <JournalPanel
            sessionId={sessionId}
            entries={journalEntries}
            isOpen={journalPanelOpen}
            onToggle={() => setJournalPanelOpen(!journalPanelOpen)}
            onUpdate={handleJournalUpdate}
          />
        </div>

        {/* Mobile Journal Modal */}
        {journalPanelOpen && (
          <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50">
            <div className="absolute inset-y-0 right-0 w-full sm:w-96 bg-gray-50 shadow-xl">
              <JournalPanel
                sessionId={sessionId}
                entries={journalEntries}
                isOpen={journalPanelOpen}
                onToggle={() => setJournalPanelOpen(!journalPanelOpen)}
                onUpdate={handleJournalUpdate}
              />
            </div>
          </div>
        )}

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
            className="flex-1 overflow-y-auto p-4 space-y-2 scroll-smooth"
          >
            {messages.length === 0 ? (
              <div className="max-w-2xl mx-auto py-8 px-4">
                <div className="text-center mb-8">
                  <div className="flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mx-auto mb-4">
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
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to AretaCare</h2>
                  <p className="text-lg text-gray-600">Your AI Care Advocate</p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Getting Started</h3>
                  <p className="text-gray-700 mb-4">
                    Start by telling me about your current situation and any relevant medical history. For example:
                  </p>
                  <ul className="space-y-2 text-gray-600 mb-4">
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Current health conditions or diagnoses</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Medications you're currently taking</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Recent medical appointments or test results</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Questions or concerns you have</span>
                    </li>
                  </ul>
                  <p className="text-sm text-gray-600">
                    You can also upload medical documents, images, or test results by clicking the attachment icon in the message box below.
                  </p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">How AretaCare Works</h3>
                  <div className="space-y-4">
                    <div className="flex items-start">
                      <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg mr-3 flex-shrink-0">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 mb-1">Conversation</h4>
                        <p className="text-sm text-gray-600">
                          Chat with your AI care advocate to get help understanding medical information, organizing updates, and preparing questions for your healthcare team.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-lg mr-3 flex-shrink-0">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 mb-1">Journal</h4>
                        <p className="text-sm text-gray-600">
                          Your medical updates are automatically organized into a journal. Click "Show Journal" above to view your timeline of appointments, medications, symptoms, and test results.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <div className="flex items-center justify-center w-10 h-10 bg-purple-100 rounded-lg mr-3 flex-shrink-0">
                        <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 mb-1">Tools</h4>
                        <p className="text-sm text-gray-600">
                          Access specialized tools from the menu: Jargon Translator (for medical terms), Conversation Coach (for appointment prep), and Documents (to manage uploads).
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-gray-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-gray-600">
                      <p className="font-medium text-gray-700 mb-1">Your Privacy Matters</p>
                      <p>
                        You can clear all your conversation and journal data at any time using the trash icon{' '}
                        <svg className="w-4 h-4 inline text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        {' '}in the header to start fresh.
                      </p>
                    </div>
                  </div>
                </div>
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
