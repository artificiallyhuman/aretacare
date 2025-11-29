import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSessionContext } from '../contexts/SessionContext';
import { dailyPlanAPI } from '../services/api';

const DailyPlan = () => {
  const { activeSessionId: sessionId } = useSessionContext();
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    if (sessionId) {
      loadDailyPlans();
    }
  }, [sessionId]);

  const loadDailyPlans = async () => {
    try {
      setLoading(true);
      const response = await dailyPlanAPI.getAll(sessionId);
      setPlans(response.data);

      // Auto-select the most recent plan
      if (response.data.length > 0) {
        const latestPlan = response.data[0];
        setSelectedPlan(latestPlan);

        // Mark as viewed if not already
        if (!latestPlan.viewed) {
          await dailyPlanAPI.markViewed(latestPlan.id);
        }
      }
    } catch (err) {
      console.error('Error loading daily plans:', err);
      if (err.response?.status !== 404) {
        setError('Failed to load daily plans');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNew = async () => {
    try {
      setGenerating(true);
      setError(null);
      // Get today's date in user's local timezone (YYYY-MM-DD)
      const today = new Date();
      const userDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const response = await dailyPlanAPI.generate(sessionId, userDate);

      // Reload plans
      await loadDailyPlans();

      // Select the new plan
      setSelectedPlan(response.data);
    } catch (err) {
      console.error('Error generating daily plan:', err);
      const errorMessage = err.response?.data?.detail ||
        (err.response?.status === 400
          ? "Not enough information yet. Please add journal entries or have conversations first."
          : 'Failed to generate daily plan');
      setError(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  const handleEditClick = () => {
    setIsEditing(true);
    setEditedContent(selectedPlan.user_edited_content || selectedPlan.content);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent('');
  };

  const handleSaveEdit = async () => {
    try {
      await dailyPlanAPI.update(selectedPlan.id, editedContent);

      // Update local state
      const updatedPlan = {
        ...selectedPlan,
        user_edited_content: editedContent
      };
      setSelectedPlan(updatedPlan);
      setPlans(plans.map(p => p.id === selectedPlan.id ? updatedPlan : p));

      setIsEditing(false);
      setEditedContent('');
    } catch (err) {
      console.error('Error saving plan:', err);
      setError('Failed to save changes');
    }
  };

  const handleDeleteAndRegenerate = async () => {
    if (!window.confirm('Delete this plan and generate a new one? This cannot be undone.')) {
      return;
    }

    try {
      setGenerating(true);
      setError(null);

      // Delete the current plan
      await dailyPlanAPI.delete(selectedPlan.id);

      // Generate a new one with user's local date
      const today = new Date();
      const userDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const response = await dailyPlanAPI.generate(sessionId, userDate);

      // Reload plans
      await loadDailyPlans();

      // Select the new plan
      setSelectedPlan(response.data);
    } catch (err) {
      console.error('Error regenerating plan:', err);
      const errorMessage = err.response?.data?.detail ||
        (err.response?.status === 400
          ? "Not enough information yet. Please add journal entries or have conversations first."
          : 'Failed to regenerate daily plan');
      setError(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  const formatDate = (dateString) => {
    // Parse as local date (YYYY-MM-DD)
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isToday = (dateString) => {
    // Parse as local date (YYYY-MM-DD) not UTC
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const hasTodaysPlan = () => {
    return plans.some(plan => isToday(plan.date));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading daily plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Daily Plans</h1>
        <button
          onClick={handleGenerateNew}
          disabled={generating || hasTodaysPlan()}
          className={`btn-primary flex items-center space-x-2 ${hasTodaysPlan() ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={hasTodaysPlan() ? "Today's plan already exists" : ''}
        >
          {generating ? (
            <>
              <svg className="animate-spin h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Generating...</span>
            </>
          ) : hasTodaysPlan() ? (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Today's Plan Ready</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Generate Today's Plan</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {plans.length === 0 ? (
        <div className="text-center py-12">
          <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg border-2 border-primary-200 px-6 py-8 max-w-2xl mx-auto">
            <svg className="w-16 h-16 text-primary-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Daily Plans Yet</h3>
            <p className="text-gray-700 mb-4">
              Daily plans help you stay organized by summarizing priorities, reminders, and questions for your care team.
            </p>
            <button
              onClick={handleGenerateNew}
              disabled={generating}
              className="btn-primary"
            >
              {generating ? 'Generating...' : 'Generate Your First Daily Plan'}
            </button>
          </div>
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-4 lg:gap-6">
          {/* Mobile: Date filter button */}
          <div className="lg:hidden mb-4">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg shadow-sm"
            >
              <span className="text-sm font-medium text-gray-900">Jump to Date</span>
              <svg className={`w-5 h-5 text-gray-500 transition-transform ${showSidebar ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Sidebar: List of plans */}
          <div className={`lg:col-span-1 ${showSidebar ? 'block mb-4' : 'hidden lg:block'}`}>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm lg:sticky lg:top-4">
              <div className="p-3 md:p-4 border-b border-gray-200">
                <h2 className="text-base md:text-lg font-semibold text-gray-900">All Plans</h2>
              </div>
              <div className="divide-y divide-gray-200 max-h-64 lg:max-h-[calc(100vh-12rem)] overflow-y-auto">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => {
                      setSelectedPlan(plan);
                      setShowSidebar(false); // Close sidebar on mobile after selection
                      if (!plan.viewed) {
                        dailyPlanAPI.markViewed(plan.id);
                      }
                      setIsEditing(false);
                    }}
                    className={`w-full text-left p-3 md:p-4 transition hover:bg-gray-50 ${
                      selectedPlan?.id === plan.id ? 'bg-primary-50 border-l-4 border-primary-600' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs md:text-sm font-medium ${
                        isToday(plan.date) ? 'text-primary-700' : 'text-gray-700'
                      }`}>
                        {isToday(plan.date) ? 'Today' : (() => {
                          const [year, month, day] = plan.date.split('-').map(Number);
                          return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        })()}
                      </span>
                      {!plan.viewed && (
                        <span className="w-2 h-2 bg-primary-600 rounded-full"></span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {(() => {
                        const [year, month, day] = plan.date.split('-').map(Number);
                        return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'long' });
                      })()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main content: Selected plan */}
          <div className="lg:col-span-3">
            {selectedPlan && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-1">
                        {isToday(selectedPlan.date) ? "Today's Plan" : 'Daily Plan'}
                      </h2>
                      <p className="text-sm text-gray-600">{formatDate(selectedPlan.date)}</p>
                    </div>
                    {!isEditing ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={handleDeleteAndRegenerate}
                          disabled={generating}
                          className="px-4 py-2 text-sm font-medium text-red-700 hover:text-red-800 hover:bg-red-50 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {generating ? 'Regenerating...' : 'Delete & Regenerate'}
                        </button>
                        <button
                          onClick={handleEditClick}
                          className="px-4 py-2 text-sm font-medium text-primary-700 hover:text-primary-800 hover:bg-primary-50 rounded-md transition"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <div className="flex space-x-2">
                        <button
                          onClick={handleCancelEdit}
                          className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6">
                  {isEditing ? (
                    <textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      rows={20}
                      className="textarea font-mono text-sm"
                      placeholder="Edit your daily plan..."
                    />
                  ) : (
                    <div className="prose prose-lg max-w-none">
                      <ReactMarkdown
                        components={{
                          h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-4" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-xl font-bold text-gray-900 mt-6 mb-3" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2" {...props} />,
                          p: ({node, ...props}) => <p className="text-gray-700 mb-4 leading-relaxed" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-700" {...props} />,
                          ol: ({node, ...props}) => <ol className="list-decimal pl-6 space-y-2 mb-4 text-gray-700" {...props} />,
                          li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                          strong: ({node, ...props}) => <strong className="font-bold text-gray-900" {...props} />,
                          em: ({node, ...props}) => <em className="italic text-gray-800" {...props} />,
                        }}
                      >
                        {selectedPlan.user_edited_content || selectedPlan.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
                  {selectedPlan.user_edited_content ? (
                    <p>Last edited: {new Date(selectedPlan.updated_at.endsWith('Z') ? selectedPlan.updated_at : selectedPlan.updated_at + 'Z').toLocaleString()}</p>
                  ) : (
                    <p>Generated: {new Date(selectedPlan.created_at.endsWith('Z') ? selectedPlan.created_at : selectedPlan.created_at + 'Z').toLocaleString()}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyPlan;
