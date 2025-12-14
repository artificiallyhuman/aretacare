import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { conversationAPI } from '../services/api';
import { useSessionContext } from '../contexts/SessionContext';
import { formatTime } from '../utils/dateUtils';
import AudioWaveform from './AudioWaveform';

const MAX_RECORDING_SECONDS = 900; // 15 minutes (corresponds to ~50MB at typical WebM bitrate)

const ROTATING_PROMPTS = [
  "My mom's been in the hospital for a week…",
  "I was just admitted to the ER with a broken leg…",
  "My husband was diagnosed with prostate cancer…",
  "I'm pregnant and might have to go on bed rest…",
  "My lab results came back and I'm worried…",
  "I'm caring for my dad and feeling overwhelmed…"
];

const ROTATING_PROMPTS_MOBILE = [
  "My mom's in the hospital…",
  "I was admitted to the ER…",
  "My husband has prostate cancer…",
  "I'm pregnant and on bed rest…",
  "My lab results came back…",
  "I'm exhausted from caring for…"
];

const MessageInput = ({ onSendMessage, loading, hasMessages = false }) => {
  const { activeSessionId: sessionId } = useSessionContext();
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioStream, setAudioStream] = useState(null);
  const [recordingTimeLeft, setRecordingTimeLeft] = useState(MAX_RECORDING_SECONDS);
  const [recordingAutoStopped, setRecordingAutoStopped] = useState(false);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const textareaRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const promptRotationTimerRef = useRef(null);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Rotating prompt animation for new sessions
  useEffect(() => {
    if (!hasMessages && !message) {
      // Start rotating prompts every 4 seconds
      promptRotationTimerRef.current = setInterval(() => {
        setCurrentPromptIndex((prev) => (prev + 1) % ROTATING_PROMPTS.length);
      }, 4000);
    } else {
      // Clear rotation if user has messages or starts typing
      if (promptRotationTimerRef.current) {
        clearInterval(promptRotationTimerRef.current);
        promptRotationTimerRef.current = null;
      }
    }

    return () => {
      if (promptRotationTimerRef.current) {
        clearInterval(promptRotationTimerRef.current);
      }
    };
  }, [hasMessages, message]);

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
    // Intentionally excluding stopRecording from deps - only restart timer when recording state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  // Auto-resize textarea as content grows
  const handleTextareaChange = (e) => {
    setMessage(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() || selectedFile) {
      onSendMessage(message, selectedFile);
      setMessage('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream); // Save stream for waveform visualization

      // Use supported audio format - prefer Opus codec in WebM container
      let options = { mimeType: 'audio/webm;codecs=opus' };

      // Fallback to default if Opus not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = {};
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      mediaRecorder.addEventListener('stop', async () => {
        // Longer delay to ensure all data events have been processed, especially on mobile
        await new Promise(resolve => setTimeout(resolve, 500));

        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });

        await transcribeAudio(audioBlob);

        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
        setAudioStream(null); // Clear stream reference
      });

      // Start recording with timeslice to ensure proper WebM container structure
      // Request data every 1 second for reliable encoding
      mediaRecorder.start(1000);
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Unable to access microphone. Please check your browser permissions.');
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      // Request any buffered data before stopping
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.requestData();
        // Longer wait for mobile devices to ensure data is dispatched
        await new Promise(resolve => setTimeout(resolve, 300));
      }
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
      // Pass skipJournalSynthesis=true for conversation recordings (will synthesize when message is sent)
      const response = await conversationAPI.transcribeAudio(audioFile, sessionId, true);
      const transcribedText = response.data.transcribed_text;

      // Add transcribed text to the message input
      setMessage(prev => prev ? `${prev}\n${transcribedText}` : transcribedText);
    } catch (error) {
      console.error('Error transcribing audio:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to transcribe audio. Please try again.';
      alert(errorMessage);
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t-2 border-primary-200 dark:border-primary-800 bg-gradient-to-r from-primary-50 to-blue-50 dark:from-gray-800 dark:to-gray-800 p-2 md:p-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg transition-colors duration-200">
      {/* Recording/Transcribing status */}
      {isRecording && (
        <div className="mb-2 md:mb-3 p-2 md:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg border-2 border-red-300 dark:border-red-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-red-600 rounded-full animate-pulse"></div>
              <span className="text-xs md:text-sm font-medium text-red-800 dark:text-red-300">Recording... Click "Stop" when finished</span>
            </div>
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 md:w-5 md:h-5 text-red-700 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className={`text-sm md:text-base font-bold font-mono ${recordingTimeLeft < 60 ? 'text-red-700 dark:text-red-300 animate-pulse' : 'text-red-800 dark:text-red-300'}`}>
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
        <div className="mb-2 md:mb-3 flex items-center space-x-2 p-2 md:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg border-2 border-blue-300 dark:border-blue-800 shadow-sm">
          <svg className="w-4 h-4 md:w-5 md:h-5 text-blue-700 dark:text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-xs md:text-sm font-medium text-blue-800 dark:text-blue-300">Transcribing your audio...</span>
        </div>
      )}

      {/* File preview */}
      {selectedFile && (
        <div className="mb-2 md:mb-3 flex items-center gap-2 p-2 md:p-3 bg-white dark:bg-gray-700 rounded-lg border border-primary-200 dark:border-gray-600 shadow-sm">
          <svg className="w-4 h-4 md:w-5 md:h-5 text-primary-600 dark:text-primary-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span className="text-xs md:text-sm text-gray-800 dark:text-gray-200 font-medium w-0 flex-1 truncate">{selectedFile.name}</span>
          <button
            type="button"
            onClick={removeFile}
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs md:text-sm font-medium shrink-0"
          >
            Remove
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="bg-white dark:bg-gray-800 rounded-lg md:rounded-xl shadow-md border border-primary-200 dark:border-gray-700 transition-colors duration-200">
        {/* Top row: Action buttons and textarea */}
        <div className="flex items-end space-x-1.5 md:space-x-2 p-1.5 md:p-2">
          {/* File upload button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".pdf,.txt,.jpg,.jpeg,.png"
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer p-1.5 md:p-2 text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition flex-shrink-0"
            title="Upload document or image"
          >
            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </label>

          {/* Audio recording button */}
          {!isRecording && (
            <button
              type="button"
              onClick={startRecording}
              disabled={loading || isTranscribing}
              aria-label={isTranscribing ? "Transcribing audio" : "Start voice recording"}
              className={`p-1.5 md:p-2 rounded-lg transition text-primary-600 hover:text-primary-700 hover:bg-primary-50 flex-shrink-0 ${(loading || isTranscribing) ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Start recording"
            >
              {isTranscribing ? (
                <svg className="w-5 h-5 md:w-6 md:h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              aria-label="Stop voice recording"
              aria-pressed={isRecording}
              className="px-2 py-1.5 md:py-2 rounded-lg transition bg-red-600 hover:bg-red-700 text-white font-medium text-xs flex items-center gap-1 animate-pulse flex-shrink-0"
              title="Stop recording"
            >
              <svg className="w-3 h-3 md:w-4 md:h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              <span>Stop</span>
            </button>
          )}

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaChange}
            onKeyPress={handleKeyPress}
            placeholder={
              hasMessages
                ? "Type your message..."
                : (isMobile ? ROTATING_PROMPTS_MOBILE[currentPromptIndex] : ROTATING_PROMPTS[currentPromptIndex])
            }
            className="flex-1 resize-none border-0 rounded-lg px-2 py-2 md:px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 max-h-[200px] overflow-y-auto text-base transition-all duration-500"
            rows={1}
            disabled={loading}
            style={{ minHeight: '40px' }}
          />
        </div>

        {/* Bottom row: Send button (full width on mobile) */}
        <div className="px-1.5 pb-1.5 md:px-2 md:pb-2">
          <button
            type="submit"
            disabled={loading || isRecording || isTranscribing || (!message.trim() && !selectedFile)}
            className="btn-primary w-full py-2 md:py-2.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-shadow text-sm md:text-base"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Thinking...
              </span>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </div>
    </form>
  );
};

MessageInput.propTypes = {
  onSendMessage: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  hasMessages: PropTypes.bool,
};

MessageInput.defaultProps = {
  loading: false,
  hasMessages: false,
};

export default MessageInput;
