import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
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
  const [showHowItWorks, setShowHowItWorks] = useState(false);
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
  const typingIndicatorRef = useRef(null);
  const sessionSwitchScrollPending = useRef(false);

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

  // Handle when user uploads an image/PDF and it finishes loading
  const handleThumbnailLoad = () => {
    // If we're waiting for AI response and typing indicator is visible, scroll to it
    if (isAITyping && typingIndicatorRef.current && isNearBottomRef.current) {
      setTimeout(() => {
        typingIndicatorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  // Auto-scroll only if user is near bottom and there are messages
  // Skip if session switch scroll is pending (that useEffect handles it with image loading)
  useEffect(() => {
    if (sessionSwitchScrollPending.current) {
      // Let the session switch useEffect handle scrolling
      previousMessageCountRef.current = messages.length;
      return;
    }

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

      // Mark that we need to scroll after messages load
      sessionSwitchScrollPending.current = true;
      loadConversationHistory();
      checkDailyPlan();
    }
    // Intentionally excluding loadConversationHistory and checkDailyPlan from deps
    // to prevent infinite re-renders - only trigger on session change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Handle scroll to bottom after session switch (waits for images to load)
  useEffect(() => {
    if (!sessionSwitchScrollPending.current || messages.length === 0) {
      return;
    }

    // Clear the flag
    sessionSwitchScrollPending.current = false;

    // Skip if we're expecting an AI response
    if (expectingAIResponse.current) {
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) return;

    // Find all images in the rendered messages
    const images = container.querySelectorAll('img');

    if (images.length === 0) {
      // No images, just scroll immediately
      requestAnimationFrame(() => scrollToBottom('auto'));
      return;
    }

    // Track state for this scroll operation
    let loadedCount = 0;
    let hasScrolled = false;
    const totalImages = images.length;

    const doScroll = () => {
      if (hasScrolled) return; // Prevent duplicate scrolls
      hasScrolled = true;
      requestAnimationFrame(() => scrollToBottom('auto'));
    };

    const onImageLoad = () => {
      loadedCount++;
      if (loadedCount >= totalImages) {
        doScroll();
      }
    };

    // Check each image
    images.forEach(img => {
      if (img.complete && img.naturalHeight !== 0) {
        onImageLoad();
      } else {
        img.addEventListener('load', onImageLoad, { once: true });
        img.addEventListener('error', onImageLoad, { once: true });
      }
    });

    // Fallback: scroll after a delay in case images take too long
    const fallbackTimer = setTimeout(doScroll, 800);

    return () => clearTimeout(fallbackTimer);
  }, [messages]);

  // Periodic check for daily plan (every 30 minutes)
  useEffect(() => {
    if (activeSessionId) {
      const interval = setInterval(() => {
        checkDailyPlan();
      }, 30 * 60 * 1000); // 30 minutes

      return () => clearInterval(interval);
    }
    // Intentionally excluding checkDailyPlan from deps - only re-create interval on session change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Poll for new messages from collaborators (every 10 seconds)
  useEffect(() => {
    if (activeSessionId && messages.length > 0) {
      const interval = setInterval(() => {
        checkForNewMessages();
      }, 10 * 1000); // 10 seconds

      return () => clearInterval(interval);
    }
    // Intentionally excluding checkForNewMessages from deps - re-create interval on session/messages change
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Scroll to bottom is handled by the sessionSwitchScrollPending useEffect
      // which properly waits for images to load after React re-renders
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
          const generatedPlan = await dailyPlanAPI.generate(activeSessionId, userDate);
          // Only show banner if the plan hasn't been viewed
          // (generate returns existing plan if one already exists)
          if (generatedPlan.data && !generatedPlan.data.viewed) {
            setHasNewDailyPlan(true);
            setShowBanner(true);
          }
        } catch (err) {
          // If insufficient data, silently ignore
          if (err.response?.status !== 400) {
            console.error('Error auto-generating daily plan:', err);
          }
        }
      } else {
        // Check if today's plan has been viewed (show banner if not)
        try {
          const latestPlan = await dailyPlanAPI.getLatest(activeSessionId);
          // Only show banner if the plan is from today and hasn't been viewed
          if (latestPlan.data && !latestPlan.data.viewed) {
            // Check if the plan is from today
            const planDate = new Date(latestPlan.data.date);
            const today = new Date();
            const isToday = planDate.getFullYear() === today.getFullYear() &&
                            planDate.getMonth() === today.getMonth() &&
                            planDate.getDate() === today.getDate();
            if (isToday) {
              setHasNewDailyPlan(true);
              setShowBanner(true);
            }
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

        // Update the temp message with the actual document/image data so thumbnail shows immediately
        setMessages(prevMessages => prevMessages.map(msg => {
          if (msg.id === tempUserMessage.id) {
            return {
              ...msg,
              content: content,
              document_id: uploadResponse.data.id,
              media_url: uploadResponse.data.media_url || null,
              thumbnail_url: uploadResponse.data.thumbnail_url || null,
              extracted_text: uploadResponse.data.extracted_text || null
            };
          }
          return msg;
        }));
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

  const handleToggleDailyPlan = () => {
    const willBeOpen = !dailyPlanPanelOpen;
    setDailyPlanPanelOpen(willBeOpen);
    // If opening the panel, dismiss the banner
    if (willBeOpen) {
      handleDismissBanner();
    }
  };

  const handleMessageUpdate = (messageId, newContent, updatedAt) => {
    setMessages(prevMessages =>
      prevMessages.map(msg =>
        msg.id === messageId ? { ...msg, content: newContent, updated_at: updatedAt } : msg
      )
    );
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
    <div className="flex flex-col h-full overscroll-none">
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
            onToggle={handleToggleDailyPlan}
            onPlanViewed={handleDismissBanner}
          />
        </div>

        {/* Mobile Daily Plan Modal */}
        {dailyPlanPanelOpen && (
          <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50">
            <div className="absolute inset-y-0 right-0 w-full sm:w-96 bg-gray-50 dark:bg-gray-800 shadow-xl">
              <DailyPlanPanel
                activeSessionId={activeSessionId}
                isOpen={dailyPlanPanelOpen}
                onToggle={handleToggleDailyPlan}
                onPlanViewed={handleDismissBanner}
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
                aria-label="Scroll to oldest messages"
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
            role="region"
            aria-label="Conversation messages"
            className={`flex-1 p-2 md:p-4 space-y-2 scroll-smooth overscroll-contain ${messages.length === 0 ? 'overflow-hidden' : 'overflow-y-auto'}`}
          >
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="max-w-2xl mx-auto px-4 md:px-6">
                  <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-gray-800 dark:to-gray-800 rounded-lg border-2 border-primary-200 dark:border-gray-700 px-4 py-5 md:px-6 md:py-6">
                    {/* Header */}
                    <div className="text-center mb-5">
                      <svg className="w-12 h-12 md:w-14 md:h-14 text-primary-600 dark:text-primary-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <h3 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Start a Conversation</h3>
                      <p className="text-sm md:text-base text-gray-700 dark:text-gray-300">
                        Tell us what's happening and how we can help
                      </p>
                    </div>

                    {/* Collapsible "How it works" section */}
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-4 mb-4">
                      <button
                        onClick={() => setShowHowItWorks(!showHowItWorks)}
                        className="w-full flex items-center justify-center text-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                      >
                        <span className="text-sm md:text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Good to know
                          <span className="font-normal text-gray-500 dark:text-gray-400">
                            · {showHowItWorks ? 'hide' : 'show'}
                          </span>
                        </span>
                      </button>

                      {showHowItWorks && (
                        <div className="mt-3 space-y-2 text-xs md:text-sm text-gray-700 dark:text-gray-300 pl-3 animate-fadeIn">
                          <p className="flex items-start">
                            <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <span>AI generates your <Link to="/daily-plan" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">Daily Plan</Link> and <Link to="/journal" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">Care Journal</Link> automatically</span>
                          </p>
                          <p className="flex items-start">
                            <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                            <span>Bring others into the conversation under <Link to="/collaboration" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">Collaboration</Link></span>
                          </p>
                          <p className="flex items-start">
                            <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>Rename or delete this session in <Link to="/settings" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">Settings → Manage Sessions</Link></span>
                          </p>
                          <p className="flex items-start">
                            <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            <span>View your files in <Link to="/tools/documents" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">Document Manager</Link> and <Link to="/audio-recordings" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">Audio Recordings</Link></span>
                          </p>
                          <p className="flex items-start">
                            <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            <span>Learn more about AretaCare on the <Link to="/about" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">About</Link> page</span>
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Footer - how to share and arrow */}
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                      <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 text-center mb-3 flex items-center justify-center gap-1 flex-wrap">
                        <span>Type a message,</span>
                        <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <span>upload documents, or</span>
                        <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        <span>record audio</span>
                      </p>
                      <div className="flex items-center justify-center">
                        <svg className="w-6 h-6 text-primary-600 dark:text-primary-400 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      <MessageBubble
                        message={message}
                        onThumbnailLoad={handleThumbnailLoad}
                        onMessageUpdate={handleMessageUpdate}
                      />
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
                {isAITyping && (
                  <div ref={typingIndicatorRef}>
                    <TypingIndicator />
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <div className="absolute bottom-32 sm:bottom-28 md:bottom-24 right-3 sm:right-4 md:right-6 z-10">
              <button
                onClick={() => scrollToBottom('smooth')}
                aria-label="Scroll to newest messages"
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
            hasMessages={messages.length > 0}
          />
        </div>
      </div>
    </div>
  );
};

export default Conversation;
