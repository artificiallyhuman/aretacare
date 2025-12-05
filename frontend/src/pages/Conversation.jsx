import React, { useState, useEffect, useRef } from 'react';
import { useSessionContext } from '../contexts/SessionContext';
import { conversationAPI, documentAPI, dailyPlanAPI } from '../services/api';
import MessageBubble from '../components/MessageBubble';
import MessageInput from '../components/MessageInput';
import DailyPlanPanel from '../components/DailyPlan/DailyPlanPanel';
import TypingIndicator from '../components/TypingIndicator';

const MESSAGE_PAGE_SIZE = 50;

const Conversation = () => {
  const { activeSessionId, loading: sessionLoading } = useSessionContext();
  const [messages, setMessages] = useState([]);
  const [dailyPlanPanelOpen, setDailyPlanPanelOpen] = useState(false);
  const [hasNewDailyPlan, setHasNewDailyPlan] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAITyping, setIsAITyping] = useState(false);
  const [error, setError] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const lastAIMessageRef = useRef(null);
  const previousMessageCountRef = useRef(0);
  const expectingAIResponse = useRef(false);

  const scrollToBottom = (behavior = 'smooth') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior
      });
    }
  };

  const scrollToTop = (behavior = 'smooth') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: 0,
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

  // Handle scroll events to show/hide scroll buttons
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const isNearBottom = checkIfNearBottom();
    isNearBottomRef.current = isNearBottom;
    setShowScrollButton(!isNearBottom && messages.length > 0);

    // Show scroll-to-top button when scrolled down more than 200px
    const { scrollTop } = messagesContainerRef.current;
    setShowScrollTopButton(scrollTop > 200 && messages.length > 0);
  };

  // Auto-scroll only if user is near bottom and there are messages
  useEffect(() => {
    if (messages.length > 0 && isNearBottomRef.current) {
      const previousCount = previousMessageCountRef.current;
      const newMessagesAdded = messages.length > previousCount;

      // If we're expecting an AI response and the last message is from the assistant
      if (expectingAIResponse.current && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === 'assistant') {
          // Reset the flag
          expectingAIResponse.current = false;

          // Wait for the DOM to update and the ref to be attached
          setTimeout(() => {
            if (lastAIMessageRef.current) {
              // Scroll to the top of the AI's response
              lastAIMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 150);
          return; // Don't run the else branch
        }
      }

      if (newMessagesAdded && !expectingAIResponse.current) {
        // For other cases (user messages, collaboration messages), scroll to bottom as usual
        scrollToBottom('smooth');
      }

      previousMessageCountRef.current = messages.length;
    }
  }, [messages]);

  // Auto-scroll when uploading indicator appears
  useEffect(() => {
    if (isUploading && isNearBottomRef.current) {
      setTimeout(() => scrollToBottom('smooth'), 100);
    }
  }, [isUploading]);

  // Auto-scroll when typing indicator appears (only scroll to bottom when typing starts)
  useEffect(() => {
    if (isAITyping && isNearBottomRef.current) {
      setTimeout(() => scrollToBottom('smooth'), 100);
    }
    // When typing stops, don't auto-scroll - let the messages useEffect handle it
  }, [isAITyping]);

  useEffect(() => {
    if (activeSessionId) {
      // Reset daily plan state when switching sessions
      setHasNewDailyPlan(false);
      setShowBanner(false);
      setDailyPlanPanelOpen(false);

      loadConversationHistory();
      checkDailyPlan();
    }
  }, [activeSessionId]);

  // Periodic check for daily plan (every 30 minutes)
  useEffect(() => {
    if (activeSessionId) {
      const interval = setInterval(() => {
        checkDailyPlan();
      }, 30 * 60 * 1000); // 30 minutes

      return () => clearInterval(interval);
    }
  }, [activeSessionId]);

  // Poll for new messages from collaborators (every 10 seconds)
  useEffect(() => {
    if (activeSessionId && messages.length > 0) {
      const interval = setInterval(() => {
        checkForNewMessages();
      }, 10 * 1000); // 10 seconds

      return () => clearInterval(interval);
    }
  }, [activeSessionId, messages]);

  const loadConversationHistory = async (sessionId = activeSessionId, resetPagination = true) => {
    if (!sessionId) return;
    try {
      const response = await conversationAPI.getHistory(sessionId, MESSAGE_PAGE_SIZE, 0);
      const loadedMessages = response.data.messages || [];
      setMessages(loadedMessages);
      setHasMoreMessages(response.data.has_more || false);
      if (resetPagination) {
        setCurrentOffset(MESSAGE_PAGE_SIZE);
      }

      // Only scroll to bottom if there are messages to display
      if (loadedMessages.length === 0) {
        return;
      }

      // Skip auto-scroll if we're expecting an AI response (let the messages useEffect handle it)
      if (expectingAIResponse.current) {
        return;
      }

      // Scroll to bottom on initial load - wait for images to load
      // Multiple scroll attempts to handle async image loading
      const scrollAfterLoad = () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToBottom('auto');
            // Additional scroll after short delay for images
            setTimeout(() => scrollToBottom('auto'), 100);
            setTimeout(() => scrollToBottom('auto'), 300);
            setTimeout(() => scrollToBottom('auto'), 600);
          });
        });
      };

      // Wait for all images in messages to load
      const container = messagesContainerRef.current;
      if (container) {
        const images = container.querySelectorAll('img');
        if (images.length > 0) {
          let loadedCount = 0;
          const checkAllLoaded = () => {
            loadedCount++;
            if (loadedCount === images.length) {
              scrollToBottom('auto');
            }
          };

          images.forEach(img => {
            if (img.complete) {
              checkAllLoaded();
            } else {
              img.addEventListener('load', checkAllLoaded);
              img.addEventListener('error', checkAllLoaded); // Handle broken images
            }
          });
        }
      }

      scrollAfterLoad();
    } catch (err) {
      console.error('Error loading conversation history:', err);
    }
  };

  const loadMoreMessages = async () => {
    if (!activeSessionId || loadingMore || !hasMoreMessages) return;

    setLoadingMore(true);
    try {
      // Save scroll position before loading more messages
      const container = messagesContainerRef.current;
      const previousScrollHeight = container?.scrollHeight || 0;

      const response = await conversationAPI.getHistory(activeSessionId, MESSAGE_PAGE_SIZE, currentOffset);
      const olderMessages = response.data.messages || [];

      // Prepend older messages to the beginning
      setMessages(prevMessages => [...olderMessages, ...prevMessages]);
      setHasMoreMessages(response.data.has_more || false);
      setCurrentOffset(prev => prev + MESSAGE_PAGE_SIZE);

      // Restore scroll position after messages are added
      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - previousScrollHeight;
        }
      });
    } catch (err) {
      console.error('Error loading more messages:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const checkForNewMessages = async () => {
    if (!activeSessionId || messages.length === 0 || isAITyping) return;

    try {
      // Get the latest 10 messages to check for new ones
      const response = await conversationAPI.getHistory(activeSessionId, 10, 0);
      const latestMessages = response.data.messages || [];

      if (latestMessages.length === 0) return;

      // Find the ID of our current latest message
      const currentLatestId = messages[messages.length - 1]?.id;

      // Filter for messages newer than our current latest
      const newMessages = latestMessages.filter(msg => msg.id > currentLatestId);

      if (newMessages.length > 0) {
        // Append new messages to the end
        setMessages(prevMessages => [...prevMessages, ...newMessages]);

        // Auto-scroll if user is near bottom
        if (isNearBottomRef.current) {
          setTimeout(() => scrollToBottom('smooth'), 100);
        }
      }
    } catch (err) {
      // Silently fail - don't disrupt the user experience
      console.error('Error checking for new messages:', err);
    }
  };

  const checkDailyPlan = async () => {
    try {
      const response = await dailyPlanAPI.check(activeSessionId);

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
          await dailyPlanAPI.generate(activeSessionId, userDate);
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
          const latestPlan = await dailyPlanAPI.getLatest(activeSessionId);
          // latestPlan.data will be null if no plans exist yet (new session)
          if (latestPlan.data && !latestPlan.data.viewed) {
            setHasNewDailyPlan(true);
            setShowBanner(true);
          }
        } catch (err) {
          console.error('Error fetching latest daily plan:', err);
        }
      }
    } catch (err) {
      console.error('Error checking daily plan:', err);
    }
  };

  const handleSendMessage = async (content, file) => {
    if (!activeSessionId) return;

    setLoading(true);
    setError('');

    // Create temporary user message to display immediately
    const tempUserMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: content || (file?.type.startsWith('image/') ? 'I uploaded an image' : 'I uploaded a document'),
      message_type: file ? (file.type.startsWith('image/') ? 'image' : 'document') : 'text',
      created_at: new Date().toISOString().slice(0, -1), // Remove 'Z' for consistent formatting
      document_id: null,
      media_url: null,
      extracted_text: null
    };

    // Add user message immediately to UI
    setMessages(prevMessages => [...prevMessages, tempUserMessage]);

    // Scroll to bottom when sending a message
    setTimeout(() => scrollToBottom('smooth'), 100);

    try {
      let documentId = null;
      let messageType = 'text';

      // Upload file if present
      if (file) {
        setIsUploading(true);

        const formData = new FormData();
        formData.append('file', file);

        // Pass skipJournalSynthesis=true for conversation uploads (will synthesize in conversation)
        const uploadResponse = await documentAPI.upload(formData, activeSessionId, true);
        documentId = uploadResponse.data.id;
        messageType = file.type.startsWith('image/') ? 'image' : 'document';

        setIsUploading(false);

        // If user didn't provide text, use a default message
        if (!content.trim()) {
          content = file.type.startsWith('image/')
            ? 'I uploaded an image'
            : 'I uploaded a document';
        }
      }

      // Get user's current date in local timezone (YYYY-MM-DD)
      const today = new Date();
      const userDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      // Show typing indicator
      setIsAITyping(true);

      // Mark that we're expecting an AI response
      expectingAIResponse.current = true;

      // Send message
      const response = await conversationAPI.sendMessage({
        content,
        session_id: activeSessionId,
        message_type: messageType,
        document_id: documentId,
        entry_date: userDate
      });

      // Reload conversation history to get the real messages (user + AI response)
      await loadConversationHistory(activeSessionId);
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message. Please try again.');
      // Remove the temporary message on error
      setMessages(prevMessages => prevMessages.filter(msg => msg.id !== tempUserMessage.id));
      // Reset the flag on error
      expectingAIResponse.current = false;
    } finally {
      setLoading(false);
      setIsUploading(false);
      setIsAITyping(false);
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
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Daily Plan Panel (collapsible sidebar) */}
        <div
          className={`${
            dailyPlanPanelOpen ? 'w-80' : 'w-0'
          } hidden md:block transition-all duration-300 overflow-hidden border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800`}
        >
          <DailyPlanPanel
            activeSessionId={activeSessionId}
            isOpen={dailyPlanPanelOpen}
            onToggle={() => setDailyPlanPanelOpen(!dailyPlanPanelOpen)}
          />
        </div>

        {/* Mobile Daily Plan Modal */}
        {dailyPlanPanelOpen && (
          <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50">
            <div className="absolute inset-y-0 right-0 w-full sm:w-96 bg-gray-50 dark:bg-gray-800 shadow-xl">
              <DailyPlanPanel
                activeSessionId={activeSessionId}
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
                <span className="font-medium">Your daily plan is ready</span>
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

          {/* Toggle daily plan button and scroll to top (mobile-friendly) */}
          <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 md:p-2 flex items-center justify-between relative">
            <button
              onClick={() => setDailyPlanPanelOpen(!dailyPlanPanelOpen)}
              className="text-xs md:text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 flex items-center space-x-1"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span>{dailyPlanPanelOpen ? 'Hide' : 'Show'} Daily Plan</span>
            </button>

            {/* Scroll to top button */}
            {showScrollTopButton && (
              <button
                onClick={() => scrollToTop('smooth')}
                className="bg-primary-600 text-white rounded-full p-2 shadow-lg hover:bg-primary-700 transition-all transform hover:scale-110"
                title="Scroll to top"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            )}
          </div>

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className={`flex-1 p-2 md:p-4 space-y-2 scroll-smooth ${messages.length === 0 ? 'overflow-hidden' : 'overflow-y-auto'}`}
          >
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="max-w-2xl mx-auto px-3 md:px-4">
                  <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-gray-800 dark:to-gray-800 rounded-lg border-2 border-primary-200 dark:border-gray-700 px-3 py-3 md:px-6 md:py-4">
                    <div className="flex items-start mb-2 md:mb-3">
                      <div className="flex-shrink-0">
                        <svg className="w-5 h-5 md:w-6 md:h-6 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <div className="ml-2 md:ml-3">
                        <h3 className="text-base md:text-lg font-bold text-gray-900 dark:text-gray-100 mb-1 md:mb-2">Type or speak your message below</h3>
                        <p className="text-xs md:text-sm text-gray-700 dark:text-gray-300 mb-2 md:mb-3">
                          You can type in the text box, click the microphone{' '}
                          <svg className="w-3 h-3 md:w-4 md:h-4 inline text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                          {' '}to record audio, or the paperclip{' '}
                          <svg className="w-3 h-3 md:w-4 md:h-4 inline text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          {' '}to upload documents and images.
                          <br/><br/>Share information like:
                        </p>
                        <ul className="space-y-1 md:space-y-2 text-xs md:text-sm text-gray-700 dark:text-gray-300">
                          <li className="flex items-start">
                            <svg className="w-4 h-4 md:w-5 md:h-5 text-primary-600 dark:text-primary-400 mr-1.5 md:mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span>Health conditions or diagnoses</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="w-4 h-4 md:w-5 md:h-5 text-primary-600 dark:text-primary-400 mr-1.5 md:mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span>Current medications</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="w-4 h-4 md:w-5 md:h-5 text-primary-600 dark:text-primary-400 mr-1.5 md:mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span>Recent appointments or test results</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-600 mt-3 md:mt-4 pt-3 md:pt-4">
                      <p className="text-xs text-gray-600 dark:text-gray-400 text-center mb-3 px-6 md:px-8">
                        You can have <strong>up to 3 active sessions</strong>. When a session is no longer needed, delete it under <em>Settings → Manage Sessions → Details</em> to clear your data from our servers.
                      </p>
                      <div className="flex items-center justify-center">
                        <svg className="w-5 h-5 md:w-6 md:h-6 text-primary-600 dark:text-primary-400 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Load More button at top */}
                {hasMoreMessages && (
                  <div className="flex justify-center pb-4">
                    <button
                      onClick={loadMoreMessages}
                      disabled={loadingMore}
                      className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {loadingMore ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Loading...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                          </svg>
                          <span>Load older messages</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
                {messages.map((message, index) => {
                  const isLastMessage = index === messages.length - 1;
                  const isAssistantMessage = message.role === 'assistant';

                  return (
                    <div
                      key={message.id}
                      ref={isLastMessage && isAssistantMessage ? lastAIMessageRef : null}
                    >
                      <MessageBubble message={message} />
                    </div>
                  );
                })}
                {isUploading && (
                  <div className="flex items-start space-x-2 mb-2">
                    <div className="bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-300 dark:border-blue-800 rounded-lg px-4 py-3 shadow-sm">
                      <div className="flex items-center space-x-2">
                        <svg className="w-5 h-5 text-blue-700 dark:text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Uploading file...</span>
                      </div>
                    </div>
                  </div>
                )}
                {isAITyping && <TypingIndicator />}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <div className="absolute bottom-32 sm:bottom-28 md:bottom-24 right-3 sm:right-4 md:right-6 z-10">
              <button
                onClick={() => scrollToBottom('smooth')}
                className="bg-primary-600 text-white rounded-full p-2 md:p-3 shadow-lg hover:bg-primary-700 transition-all transform hover:scale-110"
                title="Scroll to bottom"
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 border-t border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Input */}
          <MessageInput
            onSendMessage={handleSendMessage}
            loading={loading || isUploading}
          />
        </div>
      </div>
    </div>
  );
};

export default Conversation;
