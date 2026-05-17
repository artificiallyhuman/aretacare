import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useSessionContext } from '../contexts/SessionContext';
import { conversationAPI, documentAPI, dailyPlanAPI } from '../services/api';
import { formatLocalDate } from '../utils/dateUtils';
import MessageBubble from '../components/MessageBubble';
import MessageInput from '../components/MessageInput';
import DailyPlanPanel from '../components/DailyPlan/DailyPlanPanel';
import TypingIndicator from '../components/TypingIndicator';
import SEO from '../components/SEO';
import { getColorClasses } from '../constants/sessionColors';

const MESSAGE_PAGE_SIZE = 25;

const Conversation = () => {
  const { activeSessionId, activeSession, sessions, user, loading: sessionLoading } = useSessionContext();

  // Check if session has collaborators for source tag display
  const hasCollaborators = activeSession?.collaborators?.length > 0;

  // Session background color (only when user has 2+ sessions)
  const sessionColorClass = sessions.length > 1 ? getColorClasses(activeSession?.color_key) : '';
  const [messages, setMessages] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [dailyPlanPanelOpen, setDailyPlanPanelOpen] = useState(false);
  const [hasNewDailyPlan, setHasNewDailyPlan] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAITyping, setIsAITyping] = useState(false);
  const [typingStartTime, setTypingStartTime] = useState(null);
  const [error, setError] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const lastAIMessageRef = useRef(null);
  const previousMessageCountRef = useRef(0);
  const expectingAIResponse = useRef(false);
  const typingIndicatorRef = useRef(null);
  const sessionSwitchScrollPending = useRef(null); // Stores session ID to scroll for
  const [pendingDuplicateUpload, setPendingDuplicateUpload] = useState(null); // { content, file, audioRecordingId, duplicates }
  const [pendingReset, setPendingReset] = useState(null); // message ID to reset to
  const [isResetting, setIsResetting] = useState(false);

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

  // Scroll to show AI message at top of viewport
  const scrollToAIMessage = () => {
    if (lastAIMessageRef.current) {
      lastAIMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Wait for AI message element and all images to be fully loaded before scrolling
  const scrollToAIMessageWhenReady = () => {
    if (!lastAIMessageRef.current) {
      // Element not mounted yet, wait for next frame
      requestAnimationFrame(scrollToAIMessageWhenReady);
      return;
    }

    // Check if the element has rendered content (has height)
    if (lastAIMessageRef.current.offsetHeight === 0) {
      // Element mounted but not rendered yet, wait for next frame
      requestAnimationFrame(scrollToAIMessageWhenReady);
      return;
    }

    // Find all images in the messages container that could affect scroll position
    const container = messagesContainerRef.current;
    if (!container) {
      requestAnimationFrame(scrollToAIMessageWhenReady);
      return;
    }

    const images = container.querySelectorAll('img');
    let allImagesLoaded = true;

    images.forEach(img => {
      // Check if image is loaded (complete and has dimensions)
      if (!img.complete || img.naturalHeight === 0) {
        allImagesLoaded = false;
      }
    });

    if (!allImagesLoaded) {
      // Some images still loading, wait for next frame
      requestAnimationFrame(scrollToAIMessageWhenReady);
      return;
    }

    // All images loaded and element is ready, scroll to it
    lastAIMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Handle when user uploads an image/PDF and it finishes loading
  const handleThumbnailLoad = () => {
    // If we're waiting for AI response and the typing indicator is visible, scroll to it
    if (isAITyping && typingIndicatorRef.current && isNearBottomRef.current) {
      typingIndicatorRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
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

          // Wait for the AI message element to be fully rendered, then scroll
          scrollToAIMessageWhenReady();

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
      scrollToBottom('smooth');
    }
  }, [isUploading]);

  // Auto-scroll when typing indicator appears - scroll to show the "Thinking..." message
  useEffect(() => {
    if (isAITyping && isNearBottomRef.current && typingIndicatorRef.current) {
      typingIndicatorRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    // When typing stops, don't auto-scroll - let the messages useEffect handle it
  }, [isAITyping]);

  // Track if we're in a session switch scroll window (for re-scrolling after banner appears)
  const sessionSwitchScrollWindow = useRef(false);

  useEffect(() => {
    if (activeSessionId) {
      // Reset daily plan state when switching sessions
      setHasNewDailyPlan(false);
      setShowBanner(false);
      setDailyPlanPanelOpen(false);

      // Reset AI response flag (may have been waiting for response in previous session)
      expectingAIResponse.current = false;

      // Mark that we need to scroll after messages load for THIS session
      sessionSwitchScrollPending.current = activeSessionId;
      sessionSwitchScrollWindow.current = true;
      setHistoryLoaded(false);
      loadConversationHistory();
      checkDailyPlan();

      // Close the scroll window after 2 seconds (enough time for daily plan check)
      const windowTimer = setTimeout(() => {
        sessionSwitchScrollWindow.current = false;
      }, 2000);

      return () => clearTimeout(windowTimer);
    }
    // Intentionally excluding loadConversationHistory and checkDailyPlan from deps
    // to prevent infinite re-renders - only trigger on session change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Handle scroll to bottom after session switch
  // Uses RAF loop to scroll until scrollHeight stabilizes
  useEffect(() => {
    // Only scroll if we have a pending scroll
    if (!sessionSwitchScrollPending.current || messages.length === 0) {
      return;
    }

    // Verify messages are actually for the session we're waiting to scroll
    // (messages have session_id field - check first message belongs to pending session)
    const messagesSessionId = messages[0]?.session_id;
    if (messagesSessionId !== sessionSwitchScrollPending.current) {
      return;
    }

    // Clear the flag
    sessionSwitchScrollPending.current = null;

    const container = messagesContainerRef.current;
    if (!container) return;

    // Track scrollHeight stability
    let lastScrollHeight = 0;
    let stableFrames = 0;
    let animationId;

    // Scroll loop: keeps scrolling until scrollHeight is stable
    // This handles async content (markdown, images, fonts) naturally
    const scrollLoop = () => {
      const currentScrollHeight = container.scrollHeight;
      container.scrollTop = currentScrollHeight;

      if (currentScrollHeight === lastScrollHeight) {
        stableFrames++;
        // Stop after scrollHeight stable for ~300ms (20 frames at 60fps)
        if (stableFrames >= 20) return;
      } else {
        lastScrollHeight = currentScrollHeight;
        stableFrames = 0;
      }

      animationId = requestAnimationFrame(scrollLoop);
    };

    animationId = requestAnimationFrame(scrollLoop);

    return () => cancelAnimationFrame(animationId);
  }, [messages]);

  // Re-scroll when daily plan banner appears during session switch
  // The banner takes space above messages, causing a layout shift
  useEffect(() => {
    if (sessionSwitchScrollWindow.current && showBanner) {
      // Small delay to let layout settle after banner appears
      const timer = setTimeout(() => {
        scrollToBottom('auto');
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showBanner]);

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
  }, [activeSessionId, messages.length]);

  const loadConversationHistory = async (sessionId = activeSessionId) => {
    if (!sessionId) return;
    try {
      const response = await conversationAPI.getHistory(sessionId, MESSAGE_PAGE_SIZE, 0);
      const loadedMessages = response.data.messages || [];
      setMessages(loadedMessages);
      setHasMoreMessages(response.data.has_more || false);
      setHistoryLoaded(true);
      // Scroll to bottom is handled by the sessionSwitchScrollPending useEffect
      // which properly waits for images to load after React re-renders
    } catch (err) {
      console.error('Error loading conversation history:', err);
      setHistoryLoaded(true);
    }
  };

  const loadMoreMessages = async () => {
    if (!activeSessionId || loadingMore || !hasMoreMessages) return;

    setLoadingMore(true);
    try {
      // Save scroll position before loading more messages
      const container = messagesContainerRef.current;
      const previousScrollHeight = container?.scrollHeight || 0;

      // Use cursor pagination (before_id) for efficient deep pagination
      const oldestId = messages.length > 0 ? messages[0].id : null;
      const response = await conversationAPI.getHistory(activeSessionId, MESSAGE_PAGE_SIZE, 0, oldestId);
      const olderMessages = response.data.messages || [];

      // Prepend older messages to the beginning
      setMessages(prevMessages => [...olderMessages, ...prevMessages]);
      setHasMoreMessages(response.data.has_more || false);

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
            // Parse as local date (YYYY-MM-DD) not UTC to avoid timezone issues
            const [year, month, day] = latestPlan.data.date.split('-').map(Number);
            const planDate = new Date(year, month - 1, day);
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

  const handleSendMessage = async (content, file, audioRecordingId = null) => {
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

    // Don't scroll yet - we'll scroll once the AI response is ready
    // (This prevents the jarring scroll-to-bottom then scroll-to-AI-message behavior)

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

      // Get user's timezone and current time in their local timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const currentTime = today.toLocaleString('en-US', {
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      // Mark that we're expecting an AI response
      expectingAIResponse.current = true;

      // Show typing indicator
      setIsAITyping(true);
      setTypingStartTime(Date.now());

      // Scroll to show the typing indicator (after it renders)
      requestAnimationFrame(() => {
        if (typingIndicatorRef.current) {
          typingIndicatorRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      });

      // Send message with 120s timeout (embedding retries + AI response)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      try {
        const response = await conversationAPI.sendMessage({
          content,
          session_id: activeSessionId,
          message_type: messageType,
          document_id: documentId,
          audio_recording_id: audioRecordingId,
          entry_date: userDate,
          user_timezone: userTimezone,
          current_time: currentTime
        }, { signal: controller.signal });
        clearTimeout(timeoutId);
      } catch (sendErr) {
        clearTimeout(timeoutId);
        throw sendErr;
      }

      // Reload conversation history to get the real messages (user + AI response)
      await loadConversationHistory(activeSessionId);
    } catch (err) {
      console.error('Error sending message:', err);
      const isTimeout = err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED';
      const errorMessage = isTimeout
        ? 'Response took too long. Your message was saved — please check back in a moment.'
        : (err.response?.data?.detail || 'Failed to send message. Please try again.');
      setError(errorMessage);
      // Auto-clear error after 8 seconds
      setTimeout(() => setError(''), 8000);
      if (isTimeout) {
        // On timeout, keep user message visible (it was saved server-side) and reload history
        setTimeout(() => loadConversationHistory(activeSessionId), 3000);
      } else {
        // Remove the temporary message on non-timeout error
        setMessages(prevMessages => prevMessages.filter(msg => msg.id !== tempUserMessage.id));
      }
      // Reset the flag on error
      expectingAIResponse.current = false;
    } finally {
      setLoading(false);
      setIsUploading(false);
      setIsAITyping(false);
      setTypingStartTime(null);
    }
  };

  const handleSendMessageWithDuplicateCheck = async (content, file, audioRecordingId = null) => {
    if (file && activeSessionId) {
      try {
        const response = await documentAPI.checkDuplicate(activeSessionId, [file.name]);
        if (response.data.duplicates.length > 0) {
          setPendingDuplicateUpload({ content, file, audioRecordingId, duplicates: response.data.duplicates });
          return;
        }
      } catch (err) {
        // If check fails, proceed with upload silently
        console.error('Duplicate check failed:', err);
      }
    }
    handleSendMessage(content, file, audioRecordingId);
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

  const handleResetToMessage = (messageId) => {
    setPendingReset(messageId);
  };

  const confirmReset = async () => {
    if (!pendingReset) return;
    setIsResetting(true);
    try {
      await conversationAPI.resetToMessage(pendingReset);
      setPendingReset(null);
      // Reload conversation history
      if (activeSessionId) {
        await loadConversationHistory(activeSessionId);
      }
    } catch (err) {
      console.error('Failed to reset conversation:', err);
      setError('Failed to reset conversation. Please try again.');
    } finally {
      setIsResetting(false);
    }
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
      <SEO title="Care Session" noindex />
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
        {dailyPlanPanelOpen && createPortal(
          <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50">
            <div className="absolute inset-y-0 right-0 w-full sm:w-96 bg-gray-50 dark:bg-gray-800 shadow-xl">
              <DailyPlanPanel
                activeSessionId={activeSessionId}
                isOpen={dailyPlanPanelOpen}
                onToggle={handleToggleDailyPlan}
                onPlanViewed={handleDismissBanner}
              />
            </div>
          </div>,
          document.body
        )}

        {/* Conversation area */}
        <div className={`flex-1 flex flex-col relative ${sessionColorClass}`}>
          {/* New Daily Plan Banner */}
          {showBanner && hasNewDailyPlan && (
            <div className="bg-primary-600 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="font-medium">Your daily digest is ready</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setDailyPlanPanelOpen(true);
                    handleDismissBanner();
                  }}
                  className="px-3 py-1 bg-white text-primary-600 rounded-md text-sm font-medium hover:bg-gray-100 transition"
                >
                  View Digest
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
              <span>{dailyPlanPanelOpen ? 'Hide' : 'Show'} Daily Digest</span>
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
            className="flex-1 p-2 md:p-4 space-y-2 overscroll-contain overflow-y-auto"
          >
            {messages.length === 0 && historyLoaded ? (
              <div className="flex flex-col items-center justify-center min-h-full">
                <div className="max-w-2xl mx-auto px-4 md:px-6">
                  {/* Important Banner */}
                  <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-600 p-3 rounded-r-lg">
                    <div className="flex items-start">
                      <svg className="w-4 h-4 text-amber-600 dark:text-amber-500 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div className="flex-1">
                        <h3 className="text-xs font-semibold text-amber-800 dark:text-amber-400 mb-0.5">Important</h3>
                        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                          Chat responses are generated by AI and are not medical advice.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-gray-800 dark:to-gray-800 rounded-lg border-2 border-primary-200 dark:border-gray-700 px-4 py-5 md:px-6 md:py-6">
                    {/* Header */}
                    <div className="text-center mb-5">
                      <svg className="w-12 h-12 md:w-14 md:h-14 text-primary-600 dark:text-primary-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <h3 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Start a Care Session</h3>
                      <p className="text-sm md:text-base text-gray-700 dark:text-gray-300">
                        Share a bit about the patient, their history, and the current situation. Don’t worry about being perfect—just type what’s on your mind.
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
                        <div className="mt-3 space-y-2 text-sm md:text-base text-gray-700 dark:text-gray-300 animate-fadeIn">
                          {/* Bullet points */}
                          <div className="space-y-2 pl-3">
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
                            <span>Rename or delete this care session in <Link to="/settings" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">Settings → Manage Care Sessions</Link></span>
                          </p>
                          <p className="flex items-start">
                            <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <span>AI generates your <Link to="/daily-digest" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">Daily Digest</Link> and <Link to="/journal" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">Care Journal</Link> automatically</span>
                          </p>
                          <p className="flex items-start">
                            <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            <span>View your files (and upload multiple at once) in <Link to="/tools/documents" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">Document Manager</Link> and <Link to="/audio-recordings" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">Audio Recordings</Link></span>
                          </p>
                          <p className="flex items-start">
                            <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            <span>Learn more about AretaCare on the <Link to="/about" className="font-bold text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 underline">About</Link> page</span>
                          </p>
                          </div>
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
                        onResetToMessage={handleResetToMessage}
                        hasCollaborators={hasCollaborators}
                        currentUserId={user?.id}
                      />
                    </div>
                  );
                })}
                {isUploading && (
                  <div className="mb-2">
                    <div className="bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-300 dark:border-blue-800 rounded-lg px-4 py-3 shadow-sm">
                      <div className="flex items-center justify-center space-x-2">
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
                    <TypingIndicator startTime={typingStartTime} />
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
            onSendMessage={handleSendMessageWithDuplicateCheck}
            loading={loading || isUploading}
            hasMessages={messages.length > 0 || !historyLoaded}
          />
        </div>
      </div>

      {/* Duplicate Warning Modal */}
      {pendingDuplicateUpload && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Possible Duplicate</h2>
                <button
                  onClick={() => setPendingDuplicateUpload(null)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    A document with the same name already exists in this care session:
                  </p>
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded px-4 py-3">
                <ul className="text-sm text-yellow-800 dark:text-yellow-300 space-y-1.5">
                  {pendingDuplicateUpload.duplicates.map((dup) => (
                    <li key={dup.id}>
                      <strong>{dup.filename}</strong>
                      <span className="text-yellow-600 dark:text-yellow-400 ml-1">
                        — uploaded {formatLocalDate(dup.uploaded_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setPendingDuplicateUpload(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const { content, file, audioRecordingId } = pendingDuplicateUpload;
                    setPendingDuplicateUpload(null);
                    handleSendMessage(content, file, audioRecordingId);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 font-medium"
                >
                  Upload Anyway
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Reset Confirmation Modal */}
      {pendingReset && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Reset Conversation</h2>
                <button
                  onClick={() => setPendingReset(null)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Reset conversation to this point? All messages after this point will be permanently deleted, including any documents, audio files, and journal entries created from those messages.
                  </p>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400 mt-2">
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setPendingReset(null)}
                  disabled={isResetting}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReset}
                  disabled={isResetting}
                  className="flex-1 px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded hover:bg-red-700 dark:hover:bg-red-600 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isResetting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Resetting...</span>
                    </>
                  ) : (
                    'Reset'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Conversation;
