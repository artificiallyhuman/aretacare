import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { medicalAPI } from '../services/api';
import { useSession } from '../hooks/useSession';
import Disclaimer from '../components/Disclaimer';

const ConversationCoach = () => {
  const { sessionId, loading: sessionLoading } = useSession();
  const [situation, setSituation] = useState('');
  const [coaching, setCoaching] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGetCoaching = async () => {
    if (!situation.trim()) {
      setError('Please describe the situation.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await medicalAPI.getConversationCoach(situation, sessionId);
      setCoaching(response.data);
    } catch (err) {
      setError('Failed to get coaching: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sessionLoading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">
        Conversation Coach
      </h1>

      <Disclaimer />

      <div className="card mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
          Prepare for Healthcare Conversations
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Describe the Upcoming Conversation or Appointment
          </label>
          <textarea
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            placeholder="e.g., 'I have a follow-up appointment with the cardiologist tomorrow to discuss my mother's recent test results.'"
            rows={6}
            className="textarea"
            disabled={loading}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleGetCoaching}
          disabled={loading || !situation.trim()}
          className="btn-primary"
        >
          {loading ? 'Preparing Coaching...' : 'Get Conversation Coaching'}
        </button>
      </div>

      {coaching && (
        <div className="card">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
            Conversation Coaching
          </h2>
          <div className="prose prose-sm sm:prose-base max-w-none">
            <ReactMarkdown>{coaching.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationCoach;
