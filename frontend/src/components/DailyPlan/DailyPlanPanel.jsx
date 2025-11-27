import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { dailyPlanAPI } from '../../services/api';

const DailyPlanPanel = ({ sessionId, isOpen, onToggle }) => {
  const [dailyPlan, setDailyPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (sessionId && isOpen) {
      loadLatestPlan();
    }
  }, [sessionId, isOpen]);

  const loadLatestPlan = async () => {
    try {
      setLoading(true);
      const response = await dailyPlanAPI.getLatest(sessionId);
      setDailyPlan(response.data);

      // Mark as viewed if not already
      if (!response.data.viewed) {
        await dailyPlanAPI.markViewed(response.data.id);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        // No daily plan exists yet
        setDailyPlan(null);
      } else {
        console.error('Error loading daily plan:', err);
        setError('Failed to load daily plan');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    try {
      setLoading(true);
      setError(null);
      // Get today's date in user's local timezone (YYYY-MM-DD)
      const today = new Date();
      const userDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      await dailyPlanAPI.generate(sessionId, userDate);
      await loadLatestPlan();
    } catch (err) {
      console.error('Error generating daily plan:', err);
      const errorMessage = err.response?.data?.detail ||
        (err.response?.status === 400
          ? "Not enough information yet. Please add journal entries or have conversations first."
          : 'Failed to generate daily plan');
      setError(errorMessage);
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    // Parse as local date (YYYY-MM-DD) not UTC
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isToday = (dateString) => {
    // Parse as local date (YYYY-MM-DD) not UTC
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const hasTodaysPlan = () => {
    return dailyPlan && isToday(dailyPlan.date);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">Daily Plan</h3>
        </div>
        <button
          onClick={onToggle}
          className="p-1 text-gray-400 hover:text-gray-600 transition"
          title="Hide Daily Plan"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
            {error}
          </div>
        ) : !dailyPlan || !hasTodaysPlan() ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <p className="text-sm text-gray-600 mb-4">
              {dailyPlan ? "No plan for today yet" : "No daily plan yet"}
            </p>
            <button
              onClick={handleGeneratePlan}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Generate Today's Plan
            </button>
          </div>
        ) : (
          <div>
            {/* Plan header */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-primary-700">
                  {formatDate(dailyPlan.date)}
                </span>
                <Link
                  to="/daily-plan"
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  View All →
                </Link>
              </div>
            </div>

            {/* Plan content */}
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({node, ...props}) => <h1 className="text-lg font-bold text-gray-900 mt-4 mb-3" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-base font-bold text-gray-900 mt-4 mb-2" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-sm font-semibold text-gray-800 mt-3 mb-2" {...props} />,
                  p: ({node, ...props}) => <p className="text-gray-700 mb-3 leading-relaxed text-sm" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-1.5 mb-3 text-gray-700 text-sm" {...props} />,
                  ol: ({node, ...props}) => <ol className="list-decimal list-inside space-y-1.5 mb-3 text-gray-700 text-sm" {...props} />,
                  li: ({node, ...props}) => <li className="ml-3" {...props} />,
                  strong: ({node, ...props}) => <strong className="font-bold text-gray-900" {...props} />,
                  em: ({node, ...props}) => <em className="italic text-gray-800" {...props} />,
                }}
              >
                {dailyPlan.user_edited_content || dailyPlan.content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyPlanPanel;
