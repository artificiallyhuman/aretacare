import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../hooks/useSession';
import { conversationAPI, documentAPI, dailyPlanAPI } from '../services/api';
import MessageBubble from '../components/MessageBubble';
import MessageInput from '../components/MessageInput';
import DailyPlanPanel from '../components/DailyPlan/DailyPlanPanel';
import Disclaimer from '../components/Disclaimer';

const Conversation = () => {
  const { sessionId, loading: sessionLoading } = useSession();
  const [messages, setMessages] = useState([]);
  const [dailyPlanPanelOpen, setDailyPlanPanelOpen] = useState(false);
  const [hasNewDailyPlan, setHasNewDailyPlan] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);

  const scrollToBottom = (behavior = 'smooth') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior
      });
    }
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
      checkDailyPlan();
    }
  }, [sessionId]);

  // Periodic check for daily plan (every 30 minutes)
  useEffect(() => {
    if (sessionId) {
      const interval = setInterval(() => {
        checkDailyPlan();
      }, 30 * 60 * 1000); // 30 minutes

      return () => clearInterval(interval);
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

  const checkDailyPlan = async () => {
    try {
      const response = await dailyPlanAPI.check(sessionId);

      // Auto-generate if it's after 2 AM and no plan exists for today
      const now = new Date();
      const currentHour = now.getHours();
      const isAfter2AM = currentHour >= 2;

      if (response.data.should_generate && isAfter2AM) {
        // Auto-generate if it's after 2 AM and no plan exists yet
        try {
          // Get today's date in user's local timezone (YYYY-MM-DD)
          const today = new Date();
          const userDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          await dailyPlanAPI.generate(sessionId, userDate);
          setHasNewDailyPlan(true);
          setShowBanner(true);
        } catch (err) {
          // If insufficient data, silently ignore
          if (err.response?.status !== 400) {
            console.error('Error auto-generating daily plan:', err);
          }
        }
      } else {
        // Check if latest plan has been viewed (show banner if not)
        try {
          const latestPlan = await dailyPlanAPI.getLatest(sessionId);
          if (!latestPlan.data.viewed) {
            setHasNewDailyPlan(true);
            setShowBanner(true);
          }
        } catch (err) {
          // No plan exists yet, that's okay
        }
      }
    } catch (err) {
      console.error('Error checking daily plan:', err);
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
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDismissBanner = () => {
    setShowBanner(false);
    setHasNewDailyPlan(false);
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
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Disclaimer */}
      <Disclaimer />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Daily Plan Panel (collapsible sidebar) */}
        <div
          className={`${
            dailyPlanPanelOpen ? 'w-80' : 'w-0'
          } hidden md:block transition-all duration-300 overflow-hidden border-r border-gray-200 bg-gray-50`}
        >
          <DailyPlanPanel
            sessionId={sessionId}
            isOpen={dailyPlanPanelOpen}
            onToggle={() => setDailyPlanPanelOpen(!dailyPlanPanelOpen)}
          />
        </div>

        {/* Mobile Daily Plan Modal */}
        {dailyPlanPanelOpen && (
          <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50">
            <div className="absolute inset-y-0 right-0 w-full sm:w-96 bg-gray-50 shadow-xl">
              <DailyPlanPanel
                sessionId={sessionId}
                isOpen={dailyPlanPanelOpen}
                onToggle={() => setDailyPlanPanelOpen(!dailyPlanPanelOpen)}
              />
            </div>
          </div>
        )}

        {/* Conversation area */}
        <div className="flex-1 flex flex-col relative">
          {/* New Daily Plan Banner */}
          {showBanner && hasNewDailyPlan && (
            <div className="bg-primary-600 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="font-medium">Your daily plan is ready!</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setDailyPlanPanelOpen(true);
                    handleDismissBanner();
                  }}
                  className="px-3 py-1 bg-white text-primary-600 rounded-md text-sm font-medium hover:bg-gray-100 transition"
                >
                  View Plan
                </button>
                <button
                  onClick={handleDismissBanner}
                  className="p-1 hover:bg-primary-700 rounded transition"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Toggle daily plan button (mobile-friendly) */}
          <div className="border-b border-gray-200 bg-white px-2 py-1.5 md:p-2 flex items-center">
            <button
              onClick={() => setDailyPlanPanelOpen(!dailyPlanPanelOpen)}
              className="text-xs md:text-sm text-gray-600 hover:text-primary-600 flex items-center space-x-1"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span>{dailyPlanPanelOpen ? 'Hide' : 'Show'} Daily Plan</span>
            </button>
          </div>

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-2 md:p-4 space-y-2 scroll-smooth"
          >
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="max-w-2xl mx-auto px-3 md:px-4">
                  <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg border-2 border-primary-200 px-3 py-3 md:px-6 md:py-4">
                    <div className="flex items-start mb-2 md:mb-3">
                      <div className="flex-shrink-0">
                        <svg className="w-5 h-5 md:w-6 md:h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ml-2 md:ml-3">
                        <h3 className="text-base md:text-lg font-bold text-gray-900 mb-1 md:mb-2">Type or speak your message below</h3>
                        <p className="text-xs md:text-sm text-gray-700 mb-2 md:mb-3">
                          You can type in the text box, click the microphone{' '}
                          <svg className="w-3 h-3 md:w-4 md:h-4 inline text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                          {' '}to record audio, or the paperclip{' '}
                          <svg className="w-3 h-3 md:w-4 md:h-4 inline text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          {' '}to upload documents and images.
                          <br className="hidden md:block"/><br className="hidden md:block"/>Share information like:
                        </p>
                        <ul className="space-y-1 md:space-y-2 text-xs md:text-sm text-gray-700">
                          <li className="flex items-start">
                            <svg className="w-4 h-4 md:w-5 md:h-5 text-primary-600 mr-1.5 md:mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span>Health conditions or diagnoses</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="w-4 h-4 md:w-5 md:h-5 text-primary-600 mr-1.5 md:mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span>Current medications</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="w-4 h-4 md:w-5 md:h-5 text-primary-600 mr-1.5 md:mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span>Recent appointments or test results</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="w-4 h-4 md:w-5 md:h-5 text-primary-600 mr-1.5 md:mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span>Questions or concerns</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                    <div className="flex items-center justify-center pt-1 md:pt-2">
                      <svg className="w-5 h-5 md:w-6 md:h-6 text-primary-600 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
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
