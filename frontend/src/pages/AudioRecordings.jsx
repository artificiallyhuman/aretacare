import React, { useState, useEffect } from 'react';
import { useSession } from '../hooks/useSession';
import { audioRecordingsAPI } from '../services/api';

const AudioRecordings = () => {
  const { sessionId, loading: sessionLoading } = useSession();
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingDescription, setEditingDescription] = useState('');
  const [audioUrls, setAudioUrls] = useState({});
  const [expandedTranscripts, setExpandedTranscripts] = useState({});

  useEffect(() => {
    if (sessionId) {
      loadRecordings();
    }
  }, [sessionId]);

  const loadRecordings = async () => {
    setLoading(true);
    try {
      const response = await audioRecordingsAPI.getRecordings(sessionId);
      setRecordings(response.data.recordings);
    } catch (err) {
      console.error('Error loading recordings:', err);
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

  const handleEditDescription = (recording) => {
    setEditingId(recording.id);
    setEditingDescription(recording.description || '');
  };

  const handleSaveDescription = async (recordingId) => {
    try {
      await audioRecordingsAPI.updateRecording(sessionId, recordingId, editingDescription);
      setEditingId(null);
      loadRecordings();
    } catch (err) {
      console.error('Error updating description:', err);
      alert('Failed to update description');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingDescription('');
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
      alert('Failed to delete recording');
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString) => {
    // Add 'Z' if not present to ensure UTC parsing, then convert to local time
    const dateStr = dateString.endsWith('Z') ? dateString : dateString + 'Z';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPreviewText = (text, lineCount = 2) => {
    if (!text) return '';
    const lines = text.split('\n');
    if (lines.length <= lineCount) return text;
    return lines.slice(0, lineCount).join('\n');
  };

  const toggleTranscript = (recordingId) => {
    setExpandedTranscripts(prev => ({
      ...prev,
      [recordingId]: !prev[recordingId]
    }));
  };

  if (sessionLoading || loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Loading recordings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Audio Recordings</h1>
        <p className="text-gray-600">
          Browse and manage your audio recordings. Each recording includes its transcription and can be played back or deleted.
        </p>
      </div>

      {recordings.length === 0 ? (
        <div className="card text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No recordings yet</h3>
          <p className="text-gray-600">
            Start recording audio in the conversation to see them here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {recordings.map((recording) => (
            <div key={recording.id} className="card hover:shadow-md transition">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <span className="text-sm text-gray-500">{formatDate(recording.created_at)}</span>
                    <span className="text-sm font-medium text-primary-600">{formatDuration(recording.duration)}</span>
                  </div>

                  {editingId === recording.id ? (
                    <div className="mb-3">
                      <textarea
                        value={editingDescription}
                        onChange={(e) => setEditingDescription(e.target.value)}
                        className="textarea w-full"
                        rows="2"
                        placeholder="Edit the description for this recording..."
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleSaveDescription(recording.id)}
                          className="btn-primary text-sm"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3">
                      {recording.description && (
                        <div className="mb-2">
                          <p className="text-gray-900 font-medium">{recording.description}</p>
                          <button
                            onClick={() => handleEditDescription(recording)}
                            className="text-xs text-primary-600 hover:text-primary-700 mt-1"
                          >
                            Edit description
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {recording.transcribed_text && (
                    <div className="bg-gray-50 p-3 rounded">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-700">Transcription:</p>
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
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">
                        {expandedTranscripts[recording.id]
                          ? recording.transcribed_text
                          : getPreviewText(recording.transcribed_text)}
                      </p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleDeleteRecording(recording.id)}
                  className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded"
                  title="Delete recording"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Audio player */}
              <AudioPlayer recordingId={recording.id} getAudioUrl={getAudioUrl} />
            </div>
          ))}
        </div>
      )}
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
    return <div className="text-sm text-gray-500">Loading audio...</div>;
  }

  if (!audioUrl) {
    return <div className="text-sm text-red-500">Failed to load audio</div>;
  }

  return (
    <audio controls className="w-full mt-3">
      <source src={audioUrl} type="audio/mpeg" />
      Your browser does not support the audio element.
    </audio>
  );
};

export default AudioRecordings;
