import React, { useState } from 'react';
import JournalEntry from './JournalEntry';
import EntryEditor from './EntryEditor';

const ENTRY_TYPE_COLORS = {
  MEDICAL_UPDATE: 'bg-blue-100 text-blue-800',
  TREATMENT_CHANGE: 'bg-orange-100 text-orange-800',
  APPOINTMENT: 'bg-purple-100 text-purple-800',
  INSIGHT: 'bg-green-100 text-green-800',
  QUESTION: 'bg-yellow-100 text-yellow-800',
  MILESTONE: 'bg-teal-100 text-teal-800'
};

const JournalPanel = ({ sessionId, entries, isOpen, onToggle, onUpdate }) => {
  const [showEditor, setShowEditor] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

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
    onUpdate();
  };

  const handleDeleteSuccess = () => {
    onUpdate();
  };

  // Sort dates descending (newest first)
  const sortedDates = Object.keys(entries || {}).sort((a, b) =>
    new Date(b) - new Date(a)
  );

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">Care Journal</h2>
          <button
            onClick={handleAddEntry}
            className="text-sm text-primary-600 hover:text-primary-700 flex items-center space-x-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Entry</span>
          </button>
        </div>
        <p className="text-xs text-gray-600">
          Your ongoing care diary with AI-synthesized insights
        </p>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {sortedDates.length === 0 ? (
          <div className="text-center py-8">
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
            <p className="mt-2 text-sm text-gray-500">No journal entries yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Start a conversation and the AI will help you track important insights
            </p>
          </div>
        ) : (
          sortedDates.map((date) => (
            <div key={date}>
              {/* Date header */}
              <div className="flex items-center space-x-2 mb-2">
                <div className="flex-1 h-px bg-gray-200"></div>
                <span className="text-sm font-medium text-gray-700">
                  {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </span>
                <div className="flex-1 h-px bg-gray-200"></div>
              </div>

              {/* Entries for this date */}
              <div className="space-y-2">
                {entries[date].map((entry) => (
                  <JournalEntry
                    key={entry.id}
                    entry={entry}
                    colors={ENTRY_TYPE_COLORS}
                    onEdit={() => handleEditEntry(entry)}
                    onDelete={handleDeleteSuccess}
                  />
                ))}
              </div>
            </div>
          ))
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

export default JournalPanel;
