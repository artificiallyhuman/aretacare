import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { medicalAPI } from '../services/api';
import { useSession } from '../hooks/useSession';
import Disclaimer from '../components/Disclaimer';

const Chat = () => {
  const { sessionId, loading: sessionLoading } = useSession();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!sessionId) return;

      try {
        const response = await medicalAPI.getConversationHistory(sessionId);
        setMessages(response.data.messages);
      } catch (err) {
        console.error('Failed to load conversation history:', err);
      }
    };

    loadHistory();
  }, [sessionId]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = {
      role: 'user',
      content: inputMessage,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);
    setError(null);

    try {
      const response = await medicalAPI.chat(inputMessage, sessionId);
      setMessages((prev) => [...prev, response.data]);
    } catch (err) {
      setError('Failed to send message: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (sessionLoading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">
        Care Assistant Chat
      </h1>

      <Disclaimer />

      <div className="card h-[500px] sm:h-[600px] flex flex-col">
        <div className="flex-1 overflow-y-auto mb-4 space-y-3 sm:space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8 px-4">
              <p className="text-sm sm:text-base">Start a conversation with AretaCare.</p>
              <p className="text-xs sm:text-sm mt-2">
                Ask questions about medical information, get clarifications, or discuss care navigation.
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[80%] rounded-lg p-3 sm:p-4 ${
                  message.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <div className={`prose prose-sm sm:prose-base max-w-none ${
                  message.role === 'user' ? 'prose-invert' : ''
                }`}>
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
                <p
                  className={`text-xs mt-2 ${
                    message.role === 'user'
                      ? 'text-primary-100'
                      : 'text-gray-500'
                  }`}
                >
                  {new Date(message.created_at).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-4">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message here..."
            rows={2}
            className="textarea flex-1 text-sm sm:text-base"
            disabled={loading}
          />
          <button
            onClick={handleSendMessage}
            disabled={loading || !inputMessage.trim()}
            className="btn-primary px-6 sm:self-end text-sm sm:text-base"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
