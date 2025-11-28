import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../hooks/useSession';
import { audioRecordingsAPI } from '../services/api';

// Audio recording categories with labels and colors
const CATEGORIES = [
  { value: 'all', label: 'All Recordings', color: 'gray' },
  { value: 'symptom_update', label: 'Symptom Update', color: 'red' },
  { value: 'appointment_recap', label: 'Appointment Recap', color: 'blue' },
  { value: 'medication_note', label: 'Medication Note', color: 'orange' },
  { value: 'question_for_doctor', label: 'Question for Doctor', color: 'purple' },
  { value: 'daily_reflection', label: 'Daily Reflection', color: 'green' },
  { value: 'progress_update', label: 'Progress Update', color: 'teal' },
  { value: 'side_effects', label: 'Side Effects', color: 'pink' },
  { value: 'care_instruction', label: 'Care Instruction', color: 'indigo' },
  { value: 'emergency_note', label: 'Emergency Note', color: 'red' },
  { value: 'family_update', label: 'Family Update', color: 'cyan' },
  { value: 'treatment_observation', label: 'Treatment Observation', color: 'lime' },
  { value: 'other', label: 'Other', color: 'gray' },
];

const getCategoryColor = (category) => {
  // Handle null/undefined for backward compatibility
  if (!category) return 'gray';
  const cat = CATEGORIES.find(c => c.value === category);
  return cat ? cat.color : 'gray';
};

const getCategoryLabel = (category) => {
  // Handle null/undefined for backward compatibility
  if (!category) return 'Other';
  const cat = CATEGORIES.find(c => c.value === category);
  return cat ? cat.label : 'Other';
};

const AudioRecordings = () => {
  const { sessionId, loading: sessionLoading } = useSession();
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [audioUrls, setAudioUrls] = useState({});
  const [expandedTranscripts, setExpandedTranscripts] = useState({});
  const contentRef = useRef(null);
  const searchInputRef = useRef(null);
  const isSearchFocused = useRef(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // Debounce search query to avoid API calls on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Restore focus to search input if it was focused before re-render
  useEffect(() => {
    if (isSearchFocused.current && searchInputRef.current && document.activeElement !== searchInputRef.current) {
      searchInputRef.current.focus();
    }
  });

  useEffect(() => {
    if (sessionId) {
      loadRecordings();
    }
  }, [sessionId, selectedCategory, debouncedSearchQuery]);

  const loadRecordings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await audioRecordingsAPI.getRecordings(
        sessionId,
        selectedCategory === 'all' ? null : selectedCategory,
        debouncedSearchQuery || null
      );
      setRecordings(response.data.recordings);
    } catch (err) {
      console.error('Error loading recordings:', err);
      setError('Failed to load recordings: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getAudioUrl = async (recordingId) => {
    if (audioUrls[recordingId]) {
      return audioUrls[recordingId];
    }

    try {
      const response = await audioRecordingsAPI.getAudioUrl(sessionId, recordingId);
      const url = response.data.url;
      setAudioUrls(prev => ({ ...prev, [recordingId]: url }));
      return url;
    } catch (err) {
      console.error('Error getting audio URL:', err);
      return null;
    }
  };

  const handleDeleteRecording = async (recordingId) => {
    if (!confirm('Are you sure you want to delete this recording? This cannot be undone.')) {
      return;
    }

    try {
      await audioRecordingsAPI.deleteRecording(sessionId, recordingId);
      loadRecordings();
    } catch (err) {
      console.error('Error deleting recording:', err);
      setError('Failed to delete recording');
    }
  };

  const toggleTranscript = (recordingId) => {
    setExpandedTranscripts(prev => ({
      ...prev,
      [recordingId]: !prev[recordingId]
    }));
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getPreviewText = (text, lineCount = 2) => {
    if (!text) return '';
    const lines = text.split('\n');
    if (lines.length <= lineCount) return text;
    return lines.slice(0, lineCount).join('\n');
  };

  // Group recordings by date (parse as UTC by appending 'Z')
  const groupedRecordings = recordings.reduce((groups, rec) => {
    // Ensure timestamp is parsed as UTC
    const timestamp = rec.created_at.endsWith('Z') ? rec.created_at : rec.created_at + 'Z';
    const date = new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(rec);
    return groups;
  }, {});

  const dates = Object.keys(groupedRecordings).sort((a, b) => {
    return new Date(b) - new Date(a); // Most recent first
  });

  const scrollToDate = (date) => {
    const element = document.getElementById(`date-${date}`);
    if (element && contentRef.current) {
      const offsetTop = element.offsetTop - contentRef.current.offsetTop - 20;
      contentRef.current.scrollTo({
        top: offsetTop,
        behavior: 'smooth'
      });
    }
  };

  const formatDateShort = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isToday = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  if (sessionLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading recordings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">
          Audio Recordings
        </h1>

        {/* Controls */}
        <div className="mb-6 space-y-3 sm:space-y-4">
          {/* Search */}
          <div className="flex-1 relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { isSearchFocused.current = true; }}
              onBlur={() => { isSearchFocused.current = false; }}
              placeholder="Search recordings by description, summary, or transcription..."
              className="input w-full pr-10"
            />
            <button
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              onMouseDown={(e) => e.preventDefault()}
              className={`absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 transition-opacity ${
                searchQuery ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              aria-label="Clear search"
              tabIndex={searchQuery ? 0 : -1}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Filter by category */}
          <div className="flex items-center gap-3">
            <label htmlFor="category-filter" className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
              Category:
            </label>
            <select
              id="category-filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input w-full sm:w-auto text-sm"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {recordings.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No recordings found</h3>
            <p className="text-gray-600">
              {searchQuery || selectedCategory !== 'all'
                ? 'Try adjusting your filters or search term'
                : 'Start recording audio in conversations to see them here'
              }
            </p>
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

            {/* Sidebar: Date navigation */}
            <div className={`lg:col-span-1 ${showSidebar ? 'block mb-4' : 'hidden lg:block'}`}>
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm lg:sticky lg:top-4">
                <div className="p-3 md:p-4 border-b border-gray-200">
                  <h2 className="text-base md:text-lg font-semibold text-gray-900">Dates</h2>
                </div>
                <div className="divide-y divide-gray-200 max-h-64 lg:max-h-[calc(100vh-12rem)] overflow-y-auto">
                  {dates.map((date) => (
                    <button
                      key={date}
                      onClick={() => {
                        scrollToDate(date);
                        setShowSidebar(false); // Close sidebar on mobile after selection
                      }}
                      className="w-full text-left p-3 md:p-4 transition hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs md:text-sm font-medium ${
                          isToday(date) ? 'text-primary-700' : 'text-gray-700'
                        }`}>
                          {isToday(date) ? 'Today' : formatDateShort(date)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {groupedRecordings[date].length}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(date).toLocaleDateString('en-US', { weekday: 'long' })}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main content: Recordings by date */}
            <div className="lg:col-span-3 space-y-6" ref={contentRef}>
              {dates.map((date) => (
                <div
                  key={date}
                  id={`date-${date}`}
                  className="bg-white rounded-lg border border-gray-200 p-4 md:p-6 scroll-mt-4"
                >
                  {/* Date Header */}
                  <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <svg className="w-4 h-4 md:w-5 md:h-5 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {date}
                    <span className="ml-2 text-xs text-gray-500 font-normal">
                      ({groupedRecordings[date].length} recording{groupedRecordings[date].length !== 1 ? 's' : ''})
                    </span>
                  </h2>

                  {/* Recordings for this date */}
                  <div className="space-y-4">
                    {groupedRecordings[date].map((recording) => {
                      const categoryColor = getCategoryColor(recording.category);
                      const categoryLabel = getCategoryLabel(recording.category);
                      const badgeClasses = {
                        gray: 'bg-gray-100 text-gray-800',
                        blue: 'bg-blue-100 text-blue-800',
                        purple: 'bg-purple-100 text-purple-800',
                        green: 'bg-green-100 text-green-800',
                        orange: 'bg-orange-100 text-orange-800',
                        red: 'bg-red-100 text-red-800',
                        indigo: 'bg-indigo-100 text-indigo-800',
                        cyan: 'bg-cyan-100 text-cyan-800',
                        pink: 'bg-pink-100 text-pink-800',
                        yellow: 'bg-yellow-100 text-yellow-800',
                        teal: 'bg-teal-100 text-teal-800',
                        lime: 'bg-lime-100 text-lime-800',
                      };

                      return (
                        <div key={recording.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                          {/* Header with category and delete button */}
                          <div className="flex items-start justify-between mb-3 gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${badgeClasses[categoryColor]}`}>
                                {categoryLabel}
                              </span>
                              <span className="text-xs md:text-sm text-gray-500">
                                {(() => {
                                  const timestamp = recording.created_at.endsWith('Z') ? recording.created_at : recording.created_at + 'Z';
                                  return new Date(timestamp).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  });
                                })()}
                              </span>
                              <span className="text-xs md:text-sm font-medium text-primary-600">
                                {formatDuration(recording.duration)}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteRecording(recording.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded transition flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                              title="Delete recording"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>

                          {/* AI Summary */}
                          {recording.ai_summary && (
                            <div className="mb-3">
                              <p className="text-sm text-gray-900 font-medium">{recording.ai_summary}</p>
                            </div>
                          )}

                          {/* User Description */}
                          {recording.description && (
                            <div className="mb-3">
                              <p className="text-sm text-gray-700">{recording.description}</p>
                            </div>
                          )}

                          {/* Transcription */}
                          {recording.transcribed_text && (
                            <div className="bg-gray-50 p-3 rounded mb-3">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-gray-700">Transcription:</p>
                                {recording.transcribed_text.split('\n').length > 2 && (
                                  <button
                                    onClick={() => toggleTranscript(recording.id)}
                                    className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                                  >
                                    {expandedTranscripts[recording.id] ? (
                                      <>
                                        <span>Show less</span>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                        </svg>
                                      </>
                                    ) : (
                                      <>
                                        <span>Show more</span>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 whitespace-pre-wrap">
                                {expandedTranscripts[recording.id]
                                  ? recording.transcribed_text
                                  : getPreviewText(recording.transcribed_text)}
                              </p>
                            </div>
                          )}

                          {/* Audio player */}
                          <AudioPlayer recordingId={recording.id} getAudioUrl={getAudioUrl} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Audio player component
const AudioPlayer = ({ recordingId, getAudioUrl }) => {
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadAudio = async () => {
    setLoading(true);
    const url = await getAudioUrl(recordingId);
    setAudioUrl(url);
    setLoading(false);
  };

  useEffect(() => {
    loadAudio();
  }, [recordingId]);

  if (loading) {
    return <div className="text-xs text-gray-500">Loading audio...</div>;
  }

  if (!audioUrl) {
    return <div className="text-xs text-red-500">Failed to load audio</div>;
  }

  return (
    <audio controls className="w-full">
      <source src={audioUrl} type="audio/mpeg" />
      Your browser does not support the audio element.
    </audio>
  );
};

export default AudioRecordings;
