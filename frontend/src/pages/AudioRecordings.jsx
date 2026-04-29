import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSessionContext } from '../contexts/SessionContext';
import { audioRecordingsAPI, conversationAPI } from '../services/api';
import { isToday, formatDateShort, formatLocalDate } from '../utils/dateUtils';
import SourceTag from '../components/SourceTag';

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
  { value: 'provider_conversation', label: 'Provider Conversation', color: 'amber' },
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
  const { activeSessionId: sessionId, activeSession, user, loading: sessionLoading } = useSessionContext();

  // Check if session has collaborators for source tag display
  const hasCollaborators = activeSession?.collaborators?.length > 0;
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const hasLoadedRef = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [audioUrls, setAudioUrls] = useState({});
  const [expandedTranscripts, setExpandedTranscripts] = useState({});
  const [copiedTranscriptId, setCopiedTranscriptId] = useState(null);
  const [editingSummary, setEditingSummary] = useState({});
  const [editedSummaries, setEditedSummaries] = useState({});
  const [editedCategories, setEditedCategories] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const dateRefs = useRef({});
  const [showSidebar, setShowSidebar] = useState(false);
  const searchInputRef = useRef(null);
  const isSearchFocused = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const fileInputRef = useRef(null);
  const [recordingToDelete, setRecordingToDelete] = useState(null);
  const abortControllerRef = useRef(null);
  const uploadCancelledRef = useRef(false);

  // Restore focus to search input if it was focused before re-render
  useEffect(() => {
    if (isSearchFocused.current && searchInputRef.current && document.activeElement !== searchInputRef.current) {
      searchInputRef.current.focus();
    }
  });

  // Debounce search query to avoid API calls on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (sessionId) {
      loadRecordings();
    }
  }, [sessionId, selectedCategory, debouncedSearchQuery]);

  const loadRecordings = async () => {
    // Use different loading states for initial load vs search/filter
    if (!hasLoadedRef.current) {
      setLoading(true);
    } else {
      setSearching(true);
    }
    setError(null);
    try {
      const response = await audioRecordingsAPI.getRecordings(
        sessionId,
        selectedCategory === 'all' ? null : selectedCategory,
        debouncedSearchQuery || null
      );
      // Handle both paginated response and legacy array response
      const recordingsData = response.data.recordings || response.data;
      setRecordings(recordingsData);
      hasLoadedRef.current = true;
    } catch (err) {
      console.error('Error loading recordings:', err);
      setError(err.response?.data?.detail || 'Failed to load recordings. Please try again.');
    } finally {
      setLoading(false);
      setSearching(false);
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

  const handleDeleteRecording = (recording) => {
    setRecordingToDelete(recording);
  };

  const confirmDeleteRecording = async () => {
    if (!recordingToDelete) return;

    try {
      await audioRecordingsAPI.deleteRecording(sessionId, recordingToDelete.id);
      setRecordingToDelete(null);
      loadRecordings();
    } catch (err) {
      console.error('Error deleting recording:', err);
      setError('Failed to delete recording');
      setRecordingToDelete(null);
    }
  };

  const toggleTranscript = (recordingId) => {
    setExpandedTranscripts(prev => ({
      ...prev,
      [recordingId]: !prev[recordingId]
    }));
  };

  const handleCopyTranscript = async (recording) => {
    try {
      await navigator.clipboard.writeText(recording.transcribed_text);
      setCopiedTranscriptId(recording.id);
      setTimeout(() => setCopiedTranscriptId(null), 2000);
    } catch (err) {
      console.error('Failed to copy transcript:', err);
    }
  };

  const handleEditSummary = (recordingId, currentSummary, currentCategory) => {
    setEditingSummary(prev => ({ ...prev, [recordingId]: true }));
    setEditedSummaries(prev => ({ ...prev, [recordingId]: currentSummary || '' }));
    setEditedCategories(prev => ({ ...prev, [recordingId]: currentCategory || 'other' }));
  };

  const handleCancelEditSummary = (recordingId) => {
    setEditingSummary(prev => ({ ...prev, [recordingId]: false }));
    setEditedSummaries(prev => ({ ...prev, [recordingId]: '' }));
    setEditedCategories(prev => ({ ...prev, [recordingId]: '' }));
  };

  const handleSaveSummary = async (recordingId) => {
    try {
      await audioRecordingsAPI.updateRecording(sessionId, recordingId, editedSummaries[recordingId], editedCategories[recordingId]);
      setEditingSummary(prev => ({ ...prev, [recordingId]: false }));
      loadRecordings(); // Reload to get updated data
    } catch (err) {
      console.error('Error updating recording:', err);
      setError('Failed to update recording');
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getPreviewText = (text, lineCount = 2, charLimit = 200) => {
    if (!text) return '';
    const lines = text.split('\n');

    // If text is short enough, show it all
    if (lines.length <= lineCount && text.length <= charLimit) {
      return text;
    }

    // Show first N lines
    const previewLines = lines.slice(0, lineCount).join('\n');

    // If preview is still too long, truncate at character limit
    if (previewLines.length > charLimit) {
      return previewLines.substring(0, charLimit) + '...';
    }

    return previewLines;
  };

  const shouldShowExpandButton = (text) => {
    if (!text) return false;
    const lines = text.split('\n');
    // Show button if there are more than 2 lines OR if text is longer than 200 characters
    return lines.length > 2 || text.length > 200;
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

  // Group dates by year for year separators
  const datesByYear = dates.reduce((acc, date) => {
    const year = new Date(date).getFullYear().toString();
    if (!acc[year]) acc[year] = [];
    acc[year].push(date);
    return acc;
  }, {});
  const sortedYears = Object.keys(datesByYear).sort((a, b) => b - a);

  const handleDateClick = (date) => {
    setSelectedDate(date);
    const element = dateRefs.current[date];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const cancelUpload = () => {
    uploadCancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const allowedTypes = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/wav', 'audio/webm', 'audio/ogg'];
    const allowedExtensions = ['.mp3', '.mp4', '.m4a', '.wav', '.webm', '.ogg'];
    const maxSize = 100 * 1024 * 1024; // 100MB per file

    // Validate all files first
    const invalidFiles = [];
    const oversizedFiles = [];

    files.forEach(file => {
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExt)) {
        invalidFiles.push(file.name);
      }
      if (file.size > maxSize) {
        oversizedFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      setError(`Invalid file type(s): ${invalidFiles.join(', ')}. Please upload audio files only (MP3, M4A, WAV, WebM, OGG).`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (oversizedFiles.length > 0) {
      setError(`File(s) exceed 100MB limit: ${oversizedFiles.join(', ')}. Each file must be 100MB or less.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    await processFileUpload(files);
  };

  const processFileUpload = async (files) => {
    setUploading(true);
    setError(null);
    uploadCancelledRef.current = false;

    // Initialize progress for each file
    const initialProgress = files.map((file, index) => ({
      id: index,
      filename: file.name,
      status: 'pending',
      progress: 0,
      message: 'Waiting...'
    }));
    setUploadProgress(initialProgress);

    let successCount = 0;
    let failCount = 0;

    // Upload files sequentially to avoid overwhelming the backend
    for (let i = 0; i < files.length; i++) {
      // Check if upload was cancelled
      if (uploadCancelledRef.current) {
        // Mark remaining files as cancelled
        setUploadProgress(prev => prev.map((p, idx) =>
          idx >= i && p.status === 'pending' ? { ...p, status: 'cancelled', message: 'Cancelled' } : p
        ));
        break;
      }

      const file = files[i];

      // Create new AbortController for this upload
      abortControllerRef.current = new AbortController();

      try {
        // Update status to uploading
        setUploadProgress(prev => prev.map((p, idx) =>
          idx === i ? { ...p, status: 'uploading', message: 'Uploading & transcribing...' } : p
        ));

        // Pass false for skipJournalSynthesis so journal entries ARE created for direct uploads
        const response = await conversationAPI.transcribeAudio(file, sessionId, false, {
          signal: abortControllerRef.current.signal
        });

        // Check if cancelled while upload was in progress
        // The upload completed on the backend, so we need to clean up
        if (uploadCancelledRef.current) {
          // Delete the recording that was just created
          if (response?.data?.recording_id) {
            setUploadProgress(prev => prev.map((p, idx) =>
              idx === i ? { ...p, status: 'cancelled', message: 'Cleaning up...' } : p
            ));
            try {
              await audioRecordingsAPI.deleteRecording(sessionId, response.data.recording_id);
            } catch (deleteErr) {
              console.error('Failed to delete cancelled recording:', deleteErr);
            }
          }
          setUploadProgress(prev => prev.map((p, idx) =>
            idx === i ? { ...p, status: 'cancelled', message: 'Cancelled' } : p
          ));
          // Mark remaining files as cancelled
          setUploadProgress(prev => prev.map((p, idx) =>
            idx > i && p.status === 'pending' ? { ...p, status: 'cancelled', message: 'Cancelled' } : p
          ));
          break;
        }

        // Update status to success
        setUploadProgress(prev => prev.map((p, idx) =>
          idx === i ? { ...p, status: 'success', progress: 100, message: 'Complete' } : p
        ));

        successCount++;
      } catch (err) {
        // Check if this was a cancellation (axios uses CanceledError with code ERR_CANCELED)
        const isCancelled = err.name === 'CanceledError' ||
                           err.name === 'AbortError' ||
                           err.code === 'ERR_CANCELED' ||
                           uploadCancelledRef.current;
        if (isCancelled) {
          // The backend may have finished processing before the abort took effect
          // Poll for the recording and delete it when found
          setUploadProgress(prev => prev.map((p, idx) =>
            idx === i ? { ...p, status: 'cancelled', message: 'Cleaning up...' } : p
          ));
          try {
            const uploadedBaseName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension

            // Estimate max processing time based on file size
            // Audio transcription takes roughly 0.5-1x real-time
            // Audio files are typically ~1MB per minute, so ~30s processing per MB
            // Base: 15s for upload/conversion + ~30s per MB for transcription, max 300s
            const fileSizeMB = file.size / (1024 * 1024);
            const maxWaitMs = Math.min(15000 + fileSizeMB * 30000, 300000);
            const pollIntervalMs = 3000; // Poll every 3 seconds
            const startTime = Date.now();

            // Poll until we find the recording or timeout
            while (Date.now() - startTime < maxWaitMs) {
              // Check if user started a new upload (cancel flag would be cleared)
              if (!uploadCancelledRef.current) break;

              await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

              // Fetch recent recordings and find one matching this file
              // Note: Backend converts audio to MP3, so compare base filename without extension
              const listResponse = await audioRecordingsAPI.getRecordings(sessionId);
              const recs = listResponse.data.recordings || listResponse.data;
              const recentRec = recs.find(r => {
                const recBaseName = r.filename.replace(/\.[^/.]+$/, ''); // Remove extension
                return recBaseName === uploadedBaseName &&
                  new Date(r.created_at + 'Z') > new Date(Date.now() - 300000); // Created in last 5 minutes
              });

              if (recentRec) {
                await audioRecordingsAPI.deleteRecording(sessionId, recentRec.id);
                break; // Successfully deleted
              }
            }
          } catch (cleanupErr) {
            console.error('Failed to clean up cancelled upload:', cleanupErr);
          }

          setUploadProgress(prev => prev.map((p, idx) =>
            idx === i ? { ...p, status: 'cancelled', message: 'Cancelled' } : p
          ));
          // Mark remaining files as cancelled
          setUploadProgress(prev => prev.map((p, idx) =>
            idx > i && p.status === 'pending' ? { ...p, status: 'cancelled', message: 'Cancelled' } : p
          ));
          break;
        }

        console.error(`Error uploading ${file.name}:`, err);
        const errorMessage = err.response?.data?.detail || 'Upload failed';

        // Update status to error
        setUploadProgress(prev => prev.map((p, idx) =>
          idx === i ? { ...p, status: 'error', message: errorMessage } : p
        ));

        failCount++;
      }
    }

    // Clear the abort controller
    abortControllerRef.current = null;

    // Reload recordings to show the new ones (only if not cancelled)
    if (!uploadCancelledRef.current) {
      await loadRecordings();
    } else if (successCount > 0) {
      // If some files uploaded before cancel, still reload
      await loadRecordings();
    }

    // Clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Show summary message
    if (uploadCancelledRef.current) {
      if (successCount > 0) {
        setUploadProgress(prev => [
          ...prev.filter(p => p.id !== 'summary'),
          { id: 'summary', status: 'warning', message: `Upload cancelled. ${successCount} recording${successCount > 1 ? 's' : ''} uploaded before cancellation.` }
        ]);
      } else {
        setUploadProgress(prev => [
          ...prev.filter(p => p.id !== 'summary'),
          { id: 'summary', status: 'info', message: 'Upload cancelled.' }
        ]);
      }
    } else if (successCount > 0 && failCount === 0) {
      setUploadProgress(prev => [
        ...prev,
        { id: 'summary', status: 'info', message: `Successfully uploaded ${successCount} recording${successCount > 1 ? 's' : ''}. Journal entries have been created.` }
      ]);
    } else if (successCount > 0 && failCount > 0) {
      setUploadProgress(prev => [
        ...prev,
        { id: 'summary', status: 'warning', message: `Uploaded ${successCount} recording${successCount > 1 ? 's' : ''}, ${failCount} failed. Journal entries created for successful uploads.` }
      ]);
    } else if (failCount > 0) {
      setError(`Failed to upload ${failCount} recording${failCount > 1 ? 's' : ''}.`);
    }

    // Clear progress after 5 seconds
    setTimeout(() => {
      setUploadProgress([]);
      setUploading(false);
      setError(null);
    }, 5000);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading recordings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Audio Recordings
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Upload and manage audio recordings with AI transcription and categorization
            </p>
          </div>

          {/* Upload button */}
          <div className="text-right">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/m4a,audio/wav,audio/webm,audio/ogg,.mp3,.mp4,.m4a,.wav,.webm,.ogg"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              id="audio-file-upload"
            />
            <label
              htmlFor="audio-file-upload"
              className={`btn-primary inline-flex items-center gap-2 cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Upload audio files (MP3, M4A, WAV, WebM, OGG) - Max 100MB each (long files automatically chunked)"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="hidden sm:inline">Uploading...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="hidden sm:inline">Upload Audio</span>
                  <span className="sm:hidden">Upload</span>
                </>
              )}
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 hidden sm:block">
              Max 100MB • Long files auto-chunked
            </p>
          </div>
        </div>

        {/* Important Banner */}
        <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-600 p-4 rounded-r-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1">Important</h3>
              <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                AI transcriptions and summaries may contain errors. Please review for accuracy.
              </p>
            </div>
          </div>
        </div>

        {/* Upload progress */}
        {uploadProgress.length > 0 && (
          <div className="mb-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Upload Progress
                </h3>
              </div>
              {uploading && (
                <button
                  onClick={cancelUpload}
                  className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                  title="Cancel upload"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {uploadProgress.map((item) => {
              if (item.id === 'summary') {
                const bgColor = item.status === 'info' ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' :
                                item.status === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300' :
                                'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300';
                return (
                  <div key={item.id} className={`border px-3 py-2 rounded ${bgColor}`}>
                    {item.message}
                  </div>
                );
              }

              const statusIcon = {
                pending: (
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                uploading: (
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ),
                success: (
                  <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ),
                error: (
                  <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ),
                cancelled: (
                  <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                )
              };

              const statusColor = {
                pending: 'text-gray-600 dark:text-gray-400',
                uploading: 'text-blue-700 dark:text-blue-300',
                success: 'text-green-700 dark:text-green-300',
                error: 'text-red-700 dark:text-red-300',
                cancelled: 'text-gray-500 dark:text-gray-400'
              };

              return (
                <div key={item.id} className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex-shrink-0">
                      {statusIcon[item.status]}
                    </div>
                    <span className={`text-sm font-medium ${statusColor[item.status]} flex-1 truncate min-w-0`} title={item.filename}>
                      {item.filename}
                    </span>
                    <span className={`text-xs ${statusColor[item.status]} flex-shrink-0 whitespace-nowrap`}>
                      {item.message}
                    </span>
                  </div>
                  {item.status === 'uploading' && (
                    <div className="ml-6 mr-6 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-300 animate-pulse" style={{ width: '70%' }}></div>
                    </div>
                  )}
                  {item.status === 'success' && (
                    <div className="ml-6 mr-6 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-green-600 dark:bg-green-400 h-1.5 rounded-full transition-all duration-300" style={{ width: '100%' }}></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Controls */}
        <div className="mb-6 space-y-3 sm:space-y-4">
          {/* Search */}
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { isSearchFocused.current = true; }}
              onBlur={() => { isSearchFocused.current = false; }}
              placeholder="Search recordings by summary or transcription..."
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

          {/* Filter by category */}
          <div className="flex items-center gap-3">
            <label htmlFor="category-filter" className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
              Category:
            </label>
            <select
              id="category-filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input w-full sm:w-auto"
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
          <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {recordings.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No recordings found</h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchQuery || selectedCategory !== 'all'
                ? 'Try adjusting your filters or search term'
                : 'Record audio in conversations or upload audio files to see them here'
              }
            </p>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-4 lg:gap-6">
            {/* Mobile: Date filter button */}
            <div className="lg:hidden mb-4">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm"
              >
                <span className="text-sm font-medium text-gray-900 dark:text-white">Jump to Date</span>
                <svg className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${showSidebar ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Sidebar: Date navigation */}
            <div className={`lg:col-span-1 ${showSidebar ? 'block mb-4' : 'hidden lg:block'}`}>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm lg:sticky lg:top-4">
                <div className="p-3 md:p-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">Dates</h2>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-64 lg:max-h-[calc(100vh-22rem)] overflow-y-auto">
                  {sortedYears.map((year) => (
                    <div key={year}>
                      {/* Year separator - only show if multiple years exist */}
                      {sortedYears.length > 1 && (
                        <div className="sticky top-0 bg-gray-100 dark:bg-gray-700 px-3 py-2 border-b border-gray-200 dark:border-gray-600">
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                            {year}
                          </span>
                        </div>
                      )}
                      {datesByYear[year].map((date) => (
                        <button
                          key={date}
                          onClick={() => {
                            handleDateClick(date);
                            setShowSidebar(false); // Close sidebar on mobile after selection
                          }}
                          className={`w-full text-left p-3 md:p-4 transition hover:bg-gray-50 dark:hover:bg-gray-700 ${
                            selectedDate === date ? 'bg-primary-50 dark:bg-primary-900/30 border-l-4 border-primary-600' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs md:text-sm font-medium ${
                              isToday(date) ? 'text-primary-700 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'
                            }`}>
                              {isToday(date) ? 'Today' : formatDateShort(date)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {groupedRecordings[date].length}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(date).toLocaleDateString('en-US', { weekday: 'long' })}
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Main content: Recordings by date */}
            <div className="lg:col-span-3 space-y-6">
              {dates.map((date) => (
                <div
                  key={date}
                  ref={(el) => (dateRefs.current[date] = el)}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:p-6 scroll-mt-4"
                >
                  {/* Date Header */}
                  <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <svg className="w-4 h-4 md:w-5 md:h-5 mr-2 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {date}
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 font-normal">
                      ({groupedRecordings[date].length} recording{groupedRecordings[date].length !== 1 ? 's' : ''})
                    </span>
                  </h2>

                  {/* Recordings for this date */}
                  <div className="space-y-4">
                    {groupedRecordings[date].map((recording) => {
                      const categoryColor = getCategoryColor(recording.category);
                      const categoryLabel = getCategoryLabel(recording.category);
                      const badgeClasses = {
                        gray: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
                        blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300',
                        purple: 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300',
                        green: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300',
                        orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300',
                        red: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300',
                        indigo: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300',
                        cyan: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-300',
                        pink: 'bg-pink-100 dark:bg-pink-900/50 text-pink-800 dark:text-pink-300',
                        yellow: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300',
                        teal: 'bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-300',
                        lime: 'bg-lime-100 dark:bg-lime-900/50 text-lime-800 dark:text-lime-300',
                        amber: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300',
                      };

                      return (
                        <div key={recording.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-md transition">
                          {/* Header with category and delete button */}
                          <div className="flex items-start justify-between mb-3 gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${badgeClasses[categoryColor]}`}>
                                {categoryLabel}
                              </span>
                              <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
                                {(() => {
                                  const timestamp = recording.created_at.endsWith('Z') ? recording.created_at : recording.created_at + 'Z';
                                  return new Date(timestamp).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  });
                                })()}
                              </span>
                              <span className="text-xs md:text-sm font-medium text-primary-600 dark:text-primary-400">
                                {formatDuration(recording.duration)}
                              </span>
                              {/* Source tag for collaborative sessions - show editor if edited, otherwise creator */}
                              {hasCollaborators && (
                                <SourceTag
                                  sourceTag={recording.last_edited_by || recording.created_by}
                                  currentUserId={user?.id}
                                  variant="small"
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => handleEditSummary(recording.id, recording.ai_summary, recording.category)}
                                className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title="Edit recording"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteRecording(recording)}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title="Delete recording"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* AI Summary */}
                          {(recording.ai_summary || editingSummary[recording.id]) && (
                            <div className="mb-3">
                              {editingSummary[recording.id] ? (
                                <div className="space-y-2">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                                    <select
                                      value={editedCategories[recording.id] || 'other'}
                                      onChange={(e) => setEditedCategories(prev => ({ ...prev, [recording.id]: e.target.value }))}
                                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    >
                                      {CATEGORIES.filter(cat => cat.value !== 'all').map((cat) => (
                                        <option key={cat.value} value={cat.value}>
                                          {cat.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Summary</label>
                                    <textarea
                                      value={editedSummaries[recording.id] || ''}
                                      onChange={(e) => setEditedSummaries(prev => ({ ...prev, [recording.id]: e.target.value }))}
                                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                      rows="2"
                                      placeholder="Enter summary..."
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleSaveSummary(recording.id)}
                                      className="px-3 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => handleCancelEditSummary(recording.id)}
                                      className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded-md transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-gray-900 dark:text-white font-semibold">{recording.ai_summary}</p>
                              )}
                            </div>
                          )}

                          {/* Transcription */}
                          {recording.transcribed_text && (
                            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded mb-3">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Transcription:</p>
                                <div className="flex items-center gap-3">
                                  {shouldShowExpandButton(recording.transcribed_text) && (
                                    <button
                                      onClick={() => toggleTranscript(recording.id)}
                                      className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
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
                                  <button
                                    onClick={() => handleCopyTranscript(recording)}
                                    className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1"
                                    title="Copy transcript"
                                  >
                                    {copiedTranscriptId === recording.id ? (
                                      <>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span>Copied!</span>
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        <span>Copy</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
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

      {/* Audio Recording Delete Confirmation Modal */}
      {recordingToDelete && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Delete Recording</h2>
                <button
                  onClick={() => setRecordingToDelete(null)}
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
                <div className="flex-shrink-0 w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Delete this audio recording?
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This recording will be permanently removed from your care session
                  </p>
                </div>
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3">
                <p className="text-sm text-orange-900 dark:text-orange-200 mb-2 font-medium">
                  Recording Details:
                </p>
                <ul className="text-sm text-orange-800 dark:text-orange-300 space-y-1.5">
                  <li>• <strong>Category:</strong> {getCategoryLabel(recordingToDelete.category)}</li>
                  <li>• <strong>Duration:</strong> {recordingToDelete.duration ? `${Math.floor(recordingToDelete.duration / 60)}:${String(Math.floor(recordingToDelete.duration % 60)).padStart(2, '0')}` : 'Unknown'}</li>
                  <li>• <strong>Recorded:</strong> {formatLocalDate(recordingToDelete.created_at)}</li>
                  {recordingToDelete.ai_summary && (
                    <li>• <strong>Summary:</strong> {recordingToDelete.ai_summary}</li>
                  )}
                </ul>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-4 py-3">
                <p className="text-sm text-red-900 dark:text-red-200 font-bold">
                  This action cannot be undone. The recording and transcription will be permanently deleted.
                </p>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setRecordingToDelete(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteRecording}
                  className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 font-medium"
                >
                  Delete Recording
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

// Audio player component
const AudioPlayer = ({ recordingId, getAudioUrl }) => {
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadAudio = async () => {
      setLoading(true);
      const url = await getAudioUrl(recordingId);
      setAudioUrl(url);
      setLoading(false);
    };
    loadAudio();
  }, [recordingId, getAudioUrl]);

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
