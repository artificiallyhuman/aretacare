import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { toolsAPI, conversationAPI } from '../../services/api';
import { useSession } from '../../hooks/useSession';

const ConversationCoach = () => {
  const { sessionId } = useSession();
  const [situation, setSituation] = useState('');
  const [coaching, setCoaching] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const handleGetCoaching = async () => {
    if (!situation.trim()) {
      setError('Please describe the situation.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await toolsAPI.getConversationCoach(situation);
      setCoaching(response.data);
    } catch (err) {
      setError('Failed to get coaching: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    try {
      const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
      const response = await conversationAPI.transcribeAudio(audioFile, sessionId);
      const transcribedText = response.data.transcribed_text;

      // Add transcribed text to the situation input
      setSituation(prev => prev ? `${prev}\n${transcribedText}` : transcribedText);
    } catch (error) {
      console.error('Error transcribing audio:', error);
      setError('Failed to transcribe audio. Please try again.');
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">
        Conversation Coach
      </h1>

      <div className="card mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
          Prepare for Healthcare Conversations
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Describe the Upcoming Conversation or Appointment
          </label>

          {/* Recording/Transcribing status */}
          {isRecording && (
            <div className="mb-3 flex items-center space-x-2 p-3 bg-red-100 rounded-lg border-2 border-red-300 shadow-sm">
              <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-red-800">Recording... Click "Stop Recording" when finished</span>
            </div>
          )}
          {isTranscribing && (
            <div className="mb-3 flex items-center space-x-2 p-3 bg-blue-100 rounded-lg border-2 border-blue-300 shadow-sm">
              <svg className="w-5 h-5 text-blue-700 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm font-medium text-blue-800">Transcribing your audio...</span>
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
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
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
              className={`p-3 rounded-lg transition border text-primary-600 hover:text-primary-700 hover:bg-primary-50 border-primary-200 ${(loading || isTranscribing) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
