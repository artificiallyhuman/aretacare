import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { toolsAPI, conversationAPI } from '../../services/api';
import { useSessionContext } from '../../contexts/SessionContext';
import { formatTime } from '../../utils/dateUtils';
import AudioWaveform from '../../components/AudioWaveform';

const MAX_RECORDING_SECONDS = 900; // 15 minutes (corresponds to ~50MB at typical WebM bitrate)

const ConversationCoach = () => {
  const { activeSessionId: sessionId } = useSessionContext();
  const [situation, setSituation] = useState('');
  const [coaching, setCoaching] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioStream, setAudioStream] = useState(null);
  const [recordingTimeLeft, setRecordingTimeLeft] = useState(MAX_RECORDING_SECONDS);
  const [recordingAutoStopped, setRecordingAutoStopped] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // Countdown timer for recording
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingTimeLeft((prev) => {
          if (prev <= 1) {
            // Time's up - auto-stop recording
            setRecordingAutoStopped(true);
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Reset timer when not recording
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setRecordingTimeLeft(MAX_RECORDING_SECONDS);
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording]);

  const handleGetCoaching = async () => {
    if (!situation.trim()) {
      setError('Please describe the situation.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await toolsAPI.getConversationCoach(situation, sessionId);
      setCoaching(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to get coaching. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream); // Save stream for waveform visualization

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.addEventListener('dataavailable', (event) => {
        audioChunksRef.current.push(event.data);
      });

      mediaRecorder.addEventListener('stop', async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);

        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
        setAudioStream(null); // Clear stream reference
      });

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Unable to access microphone. Please check your browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob) => {
    setIsTranscribing(true);

    // Show message if recording was auto-stopped
    if (recordingAutoStopped) {
      alert('Recording reached the 15-minute maximum length and was automatically stopped.');
      setRecordingAutoStopped(false);
    }

    try {
      const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
      const response = await conversationAPI.transcribeAudio(audioFile, sessionId);
      const transcribedText = response.data.transcribed_text;

      // Add transcribed text to the situation input
      setSituation(prev => prev ? `${prev}\n${transcribedText}` : transcribedText);
    } catch (error) {
      console.error('Error transcribing audio:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to transcribe audio. Please try again.';
      setError(errorMessage);
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          Conversation Coach
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Draft questions and talking points to prepare for conversations with your care team
        </p>
      </div>

      <div className="card mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Prepare for Healthcare Conversations
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Describe the Upcoming Conversation or Appointment
          </label>

          {/* Recording/Transcribing status */}
          {isRecording && (
            <div className="mb-3 p-3 bg-red-100 dark:bg-red-900/40 rounded-lg border-2 border-red-300 dark:border-red-700 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-red-800 dark:text-red-300">Recording... Click "Stop Recording" when finished</span>
                </div>
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5 text-red-700 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className={`text-base font-bold font-mono ${recordingTimeLeft < 60 ? 'text-red-700 dark:text-red-300 animate-pulse' : 'text-red-800 dark:text-red-300'}`}>
                    {formatTime(recordingTimeLeft)}
                  </span>
                </div>
              </div>
              {/* Live waveform visualization */}
              <AudioWaveform stream={audioStream} isRecording={isRecording} />
              {recordingTimeLeft < 60 && (
                <div className="text-xs text-red-700 dark:text-red-300 font-medium text-center">
                  ⚠️ Less than 1 minute remaining
                </div>
              )}
            </div>
          )}
          {isTranscribing && (
            <div className="mb-3 flex items-center space-x-2 p-3 bg-blue-100 dark:bg-blue-900/40 rounded-lg border-2 border-blue-300 dark:border-blue-700 shadow-sm">
              <svg className="w-5 h-5 text-blue-700 dark:text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Transcribing your audio...</span>
            </div>
          )}

          <textarea
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            placeholder="Type or record your description... e.g., 'I have a follow-up appointment with the cardiologist tomorrow to discuss my mother's recent test results.'"
            rows={6}
            className="textarea"
            disabled={loading || isTranscribing}
          />
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* Microphone button */}
          {!isRecording && (
            <button
              type="button"
              onClick={startRecording}
              disabled={loading || isTranscribing}
              className={`p-3 rounded-lg transition border text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/30 border-primary-200 dark:border-primary-700 ${(loading || isTranscribing) ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Start recording"
            >
              {isTranscribing ? (
                <svg className="w-6 h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>
          )}

          {/* Stop recording button */}
          {isRecording && (
            <button
              type="button"
              onClick={stopRecording}
              className="px-4 py-3 rounded-lg transition border-2 bg-red-600 hover:bg-red-700 text-white border-red-700 font-medium flex items-center gap-2 animate-pulse"
              title="Stop recording"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop Recording
            </button>
          )}

          {/* Submit button */}
          <button
            onClick={handleGetCoaching}
            disabled={loading || !situation.trim()}
            className="btn-primary"
          >
            {loading ? 'Preparing Coaching...' : 'Get Conversation Coaching'}
          </button>
        </div>
      </div>

      {coaching && (
        <div className="card">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Conversation Coaching
          </h2>
          <div className="prose prose-sm max-w-none prose-gray dark:prose-invert prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-800 dark:prose-p:text-gray-200">
            <ReactMarkdown
              components={{
                p: ({node, ...props}) => <p className="mb-2 leading-relaxed text-gray-800 dark:text-gray-200" {...props} />,
                h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-3 mt-4 text-gray-900 dark:text-white" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-lg font-semibold mb-2 mt-3 text-gray-900 dark:text-white" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-base font-semibold mb-2 mt-3 text-gray-900 dark:text-white" {...props} />,
                ul: ({node, ...props}) => <ul className="mb-3 space-y-1 pl-5 text-gray-800 dark:text-gray-200" {...props} />,
                ol: ({node, ...props}) => <ol className="mb-3 space-y-1 pl-5 text-gray-800 dark:text-gray-200" {...props} />,
                li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                code: ({node, inline, ...props}) =>
                  inline
                    ? <code className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-sm" {...props} />
                    : <code className="block bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 p-3 rounded my-2 text-sm overflow-x-auto" {...props} />,
                blockquote: ({node, ...props}) => (
                  <blockquote className="border-l-4 border-primary-400 pl-4 my-2 italic text-gray-700 dark:text-gray-300" {...props} />
                ),
                strong: ({node, ...props}) => <strong className="font-bold text-gray-900 dark:text-white" {...props} />,
              }}
            >
              {coaching.content}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationCoach;
