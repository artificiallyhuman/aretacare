import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../hooks/useSession';
import { journalAPI } from '../services/api';
import JournalEntry from '../components/Journal/JournalEntry';
import EntryEditor from '../components/Journal/EntryEditor';

const ENTRY_TYPE_COLORS = {
  MEDICAL_UPDATE: 'bg-blue-100 text-blue-800',
  TREATMENT_CHANGE: 'bg-orange-100 text-orange-800',
  APPOINTMENT: 'bg-purple-100 text-purple-800',
  INSIGHT: 'bg-green-100 text-green-800',
  QUESTION: 'bg-yellow-100 text-yellow-800',
  MILESTONE: 'bg-teal-100 text-teal-800',
  OTHER: 'bg-gray-100 text-gray-800'
};

const JournalView = () => {
  const { sessionId, loading: sessionLoading } = useSession();
  const [entries, setEntries] = useState({});
  const [filteredEntries, setFilteredEntries] = useState({});
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const dateRefs = useRef({});
  const searchInputRef = useRef(null);
  const isSearchFocused = useRef(false);

  useEffect(() => {
    if (sessionId) {
      loadJournalEntries();
    }
  }, [sessionId]);

  // Restore focus to search input if it was focused before re-render
  useEffect(() => {
    if (isSearchFocused.current && searchInputRef.current && document.activeElement !== searchInputRef.current) {
      searchInputRef.current.focus();
    }
  });

  useEffect(() => {
    applyFilters();
  }, [entries, filterType, searchQuery]);

  const loadJournalEntries = async () => {
    setLoading(true);
    try {
      const response = await journalAPI.getEntries(sessionId);
      setEntries(response.data.entries_by_date);
    } catch (err) {
      console.error('Error loading journal entries:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = { ...entries };

    // Filter by type
    if (filterType !== 'ALL') {
      filtered = Object.keys(filtered).reduce((acc, date) => {
        const filteredForDate = filtered[date].filter(
          (entry) => entry.entry_type === filterType
        );
        if (filteredForDate.length > 0) {
          acc[date] = filteredForDate;
        }
        return acc;
      }, {});
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = Object.keys(filtered).reduce((acc, date) => {
        const searchFiltered = filtered[date].filter(
          (entry) =>
            entry.title.toLowerCase().includes(query) ||
            entry.content.toLowerCase().includes(query)
        );
        if (searchFiltered.length > 0) {
          acc[date] = searchFiltered;
        }
        return acc;
      }, {});
    }

    setFilteredEntries(filtered);
  };

  const handleAddEntry = () => {
    setEditingEntry(null);
    setShowEditor(true);
  };

  const handleEditEntry = (entry) => {
    setEditingEntry(entry);
    setShowEditor(true);
  };

  const handleSaveSuccess = () => {
    setShowEditor(false);
    setEditingEntry(null);
    loadJournalEntries();
  };

  const handleDateClick = (date) => {
    setSelectedDate(date);
    const element = dateRefs.current[date];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Sort dates in reverse chronological order (most recent first)
  const sortedDates = Object.keys(filteredEntries).sort(
    (a, b) => new Date(b) - new Date(a)
  );

  const totalEntries = Object.values(entries).reduce(
    (sum, dateEntries) => sum + dateEntries.length,
    0
  );

  // Format date properly in local timezone
  const formatDate = (dateString) => {
    // Parse as local date (YYYY-MM-DD) not UTC
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDateShort = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isToday = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  if (sessionLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading journal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Care Journal</h1>
              <p className="text-sm sm:text-base text-gray-600">
                Your ongoing care diary with {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}
              </p>
            </div>
            <button
              onClick={handleAddEntry}
              className="btn-primary px-4 py-2 sm:px-6 whitespace-nowrap flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">New Entry</span>
            </button>
          </div>
        </div>

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
              placeholder="Search journal entries..."
              className="input w-full pr-10"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                onMouseDown={(e) => e.preventDefault()}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                aria-label="Clear search"
                type="button"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Filter by type */}
          <div className="flex items-center gap-3">
            <label htmlFor="filter-type" className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
              Filter:
            </label>
            <select
              id="filter-type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="input w-full sm:w-auto"
            >
              <option value="ALL">All Types</option>
              <option value="MEDICAL_UPDATE">Medical Update</option>
              <option value="TREATMENT_CHANGE">Treatment Change</option>
              <option value="APPOINTMENT">Appointment</option>
              <option value="INSIGHT">Insight</option>
              <option value="QUESTION">Question</option>
              <option value="MILESTONE">Milestone</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        {/* Timeline */}
        {sortedDates.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-500">
              {searchQuery || filterType !== 'ALL'
                ? 'No entries match your filters'
                : 'No journal entries yet'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {searchQuery || filterType !== 'ALL'
                ? 'Try adjusting your search or filter'
                : 'Click "New Entry" to add your first entry'}
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Sidebar: Date navigation */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm sticky top-4">
                <div className="p-3 md:p-4 border-b border-gray-200">
                  <h2 className="text-base md:text-lg font-semibold text-gray-900">Dates</h2>
                </div>
                <div className="divide-y divide-gray-200 max-h-[calc(100vh-12rem)] overflow-y-auto">
                  {sortedDates.map((date) => (
                    <button
                      key={date}
                      onClick={() => handleDateClick(date)}
                      className={`w-full text-left p-3 md:p-4 transition hover:bg-gray-50 ${
                        selectedDate === date ? 'bg-primary-50 border-l-4 border-primary-600' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs md:text-sm font-medium ${
                          isToday(date) ? 'text-primary-700' : 'text-gray-700'
                        }`}>
                          {isToday(date) ? 'Today' : formatDateShort(date)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {filteredEntries[date].length}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {(() => {
                          const [year, month, day] = date.split('-').map(Number);
                          return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'long' });
                        })()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main content: Entries by date */}
            <div className="lg:col-span-3 space-y-6">
              {sortedDates.map((date) => (
                <div
                  key={date}
                  ref={(el) => (dateRefs.current[date] = el)}
                  className="bg-white rounded-lg border border-gray-200 p-4 md:p-6 scroll-mt-4"
                >
                  {/* Date header */}
                  <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <svg className="w-4 h-4 md:w-5 md:h-5 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {formatDate(date)}
                  </h2>

                  {/* Entries for this date */}
                  <div className="space-y-3">
                    {filteredEntries[date].map((entry) => (
                      <JournalEntry
                        key={entry.id}
                        entry={entry}
                        colors={ENTRY_TYPE_COLORS}
                        onEdit={() => handleEditEntry(entry)}
                        onDelete={loadJournalEntries}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Entry Editor Modal */}
      {showEditor && (
        <EntryEditor
          sessionId={sessionId}
          entry={editingEntry}
          onClose={() => setShowEditor(false)}
          onSave={handleSaveSuccess}
        />
      )}
    </div>
  );
};

export default JournalView;
