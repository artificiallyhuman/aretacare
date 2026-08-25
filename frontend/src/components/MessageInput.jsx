import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { conversationAPI } from '../services/api';
import { useSessionContext } from '../contexts/SessionContext';
import { formatTime } from '../utils/dateUtils';
import { isAbortError } from '../utils/requestUtils';
import { isProcessingUpload, waitForTranscription } from '../utils/transcriptionPolling';
import AudioWaveform from './AudioWaveform';

const MAX_RECORDING_SECONDS = 900; // 15 minutes (corresponds to ~50MB at typical WebM bitrate)
const SILENCE_THRESHOLD = 5; // Minimum average audio level to consider as non-silent (0-255 scale)

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
  const [fileError, setFileError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioStream, setAudioStream] = useState(null);
  const [recordingTimeLeft, setRecordingTimeLeft] = useState(MAX_RECORDING_SECONDS);
  const [recordingAutoStopped, setRecordingAutoStopped] = useState(false);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [audioRecordingId, setAudioRecordingId] = useState(null);
  const [showNotification, setShowNotification] = useState(false);
  const [showSilenceWarning, setShowSilenceWarning] = useState(false);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const textareaRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const promptRotationTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const maxAudioLevelRef = useRef(0);
  const silenceCheckIntervalRef = useRef(null);
  const recordingCancelledRef = useRef(false);
  // Mirrors audioStream so the unmount cleanup below sees the live stream
  // rather than the value captured when the effect was created
  const audioStreamRef = useRef(null);
  // Stops the transcription poll if the chat unmounts while it is waiting
  const transcriptionAbortRef = useRef(null);

  // Release the microphone if the component unmounts mid-recording. The
  // MediaRecorder "stop" handler and cancelRecording() only run on user-initiated
  // stops, so navigating away from the chat would otherwise leave the mic live
  // with no UI left to turn it off.
  useEffect(() => {
    return () => {
      if (silenceCheckIntervalRef.current) {
        clearInterval(silenceCheckIntervalRef.current);
        silenceCheckIntervalRef.current = null;
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        // Skip the stop handler's transcribe path - there is no component left to update
        recordingCancelledRef.current = true;
        mediaRecorderRef.current.stop();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
      transcriptionAbortRef.current?.abort();
    };
  }, []);

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

  // Auto-hide notification after 5 seconds
  useEffect(() => {
    if (showNotification) {
      const timer = setTimeout(() => {
        setShowNotification(false);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [showNotification]);

  // Auto-hide silence warning after 5 seconds
  useEffect(() => {
    if (showSilenceWarning) {
      const timer = setTimeout(() => {
        setShowSilenceWarning(false);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [showSilenceWarning]);

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
      onSendMessage(message, selectedFile, audioRecordingId);
      setMessage('');
      setSelectedFile(null);
      setAudioRecordingId(null);  // Clear audio recording ID after sending
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
    if (!file) return;

    // Same rules as Documents.jsx — reject client-side so the user gets an
    // immediate error instead of an optimistic bubble that vanishes after the
    // server rejects the upload
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'text/plain'];
    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.txt'];
    const maxSize = 30 * 1024 * 1024; // 30MB

    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExt)) {
      setFileError(`Invalid file type: ${file.name}. Please upload PDF, image (PNG, JPG), or text files only.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > maxSize) {
      setFileError(`File exceeds 30MB limit: ${file.name}. Please choose a smaller file.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFileError(null);
    setSelectedFile(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    try {
      // Reset cancellation flag
      recordingCancelledRef.current = false;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream); // Save stream for waveform visualization
      audioStreamRef.current = stream; // Kept in sync for the unmount cleanup

      // Set up audio analysis for silence detection
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      maxAudioLevelRef.current = 0;

      // Monitor audio levels during recording
      silenceCheckIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
        if (average > maxAudioLevelRef.current) {
          maxAudioLevelRef.current = average;
        }
      }, 100);

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
        // If recording was cancelled, cancelRecording() already handled cleanup
        if (recordingCancelledRef.current) {
          return;
        }

        // Clean up silence detection
        if (silenceCheckIntervalRef.current) {
          clearInterval(silenceCheckIntervalRef.current);
          silenceCheckIntervalRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        // Longer delay to ensure all data events have been processed, especially on mobile
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check for silence before transcribing
        if (maxAudioLevelRef.current < SILENCE_THRESHOLD) {
          setShowSilenceWarning(true);
          stream.getTracks().forEach(track => track.stop());
          setAudioStream(null);
          audioStreamRef.current = null;
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });

        await transcribeAudio(audioBlob);

        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
        setAudioStream(null); // Clear stream reference
        audioStreamRef.current = null;
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

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Set cancellation flag BEFORE stopping - the stop handler will check this
      recordingCancelledRef.current = true;

      // Clean up silence detection
      if (silenceCheckIntervalRef.current) {
        clearInterval(silenceCheckIntervalRef.current);
        silenceCheckIntervalRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Stop the media recorder - the stop handler will see the cancelled flag and skip transcription
      mediaRecorderRef.current.stop();

      // Stop all tracks to release the microphone
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        setAudioStream(null);
        audioStreamRef.current = null;
      }

      // Clear recording data
      audioChunksRef.current = [];
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
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/[: ]/g, '-')}`;
      const audioFile = new File([audioBlob], `Recording_${timestamp}.webm`, { type: 'audio/webm' });
      // Pass skipJournalSynthesis=true for conversation recordings (will synthesize when message is sent)
      const response = await conversationAPI.transcribeAudio(audioFile, sessionId, true);
      const recordingId = response.data.recording_id;

      // Store the recording ID to link to journal entry when message is sent
      setAudioRecordingId(recordingId);

      // The backend answers 202 once the recording is saved and transcribes in the
      // background; poll until the transcript is ready. An older backend answers
      // 200 with the transcript inline (no transcription_status) - use it as-is.
      let transcribedText = response.data.transcribed_text;
      if (isProcessingUpload(response)) {
        transcriptionAbortRef.current?.abort();
        const controller = new AbortController();
        transcriptionAbortRef.current = controller;
        try {
          const recording = await waitForTranscription(sessionId, recordingId, {
            signal: controller.signal,
            durationSeconds: response.data.duration,
          });
          transcribedText = recording.transcribed_text;
        } finally {
          if (transcriptionAbortRef.current === controller) {
            transcriptionAbortRef.current = null;
          }
        }
      }

      // Hide transcribing indicator once transcription is complete
      setIsTranscribing(false);

      // Automatically send the transcribed message
      const finalMessage = message ? `${message}\n${transcribedText}` : transcribedText;

      // Clear the input and send the message
      setMessage('');

      // Send the message with the audio recording ID
      await onSendMessage(finalMessage, null, recordingId);

      // Show temporary notification about Audio Recordings
      setShowNotification(true);

    } catch (error) {
      // The poll was abandoned because the chat unmounted - nothing left to tell
      if (isAbortError(error)) return;
      console.error('Error transcribing audio:', error);
      // Polling errors carry their user-facing text in .message
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to transcribe audio. Please try again.';
      alert(errorMessage);
      setIsTranscribing(false);
    } finally {
      setAudioRecordingId(null); // Clear the recording ID
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-1 md:mt-2 border-t-2 border-primary-200 dark:border-primary-800 bg-gradient-to-r from-primary-50 to-blue-50 dark:from-gray-800 dark:to-gray-800 p-2 md:p-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg transition-colors duration-200 flex-shrink-0">

      {/* Audio recording saved notification */}
      {showNotification && (
        <div className="mb-2 md:mb-3 bg-blue-100 dark:bg-blue-900/90 border-2 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100 px-4 py-3 rounded-lg shadow-lg animate-fade-in">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span className="text-sm font-medium">You can view and delete this recording in the Audio Recordings tool</span>
          </div>
        </div>
      )}

      {/* Silence warning */}
      {showSilenceWarning && (
        <div className="mb-2 md:mb-3 bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 px-4 py-3 rounded-lg shadow-lg animate-fade-in">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            <span className="text-sm font-medium">No audio detected. Please check your microphone and try again.</span>
          </div>
        </div>
      )}

      {/* File validation error */}
      {fileError && (
        <div className="mb-2 md:mb-3 bg-red-50 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-700 text-red-900 dark:text-red-100 px-4 py-3 rounded-lg shadow-lg animate-fade-in">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            <span className="text-sm font-medium w-0 flex-1">{fileError}</span>
            <button
              type="button"
              onClick={() => setFileError(null)}
              className="text-xs md:text-sm font-semibold shrink-0 hover:underline"
            >
              Dismiss
            </button>
          </div>
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
        <div className="flex items-center space-x-1.5 md:space-x-2 p-1.5 md:p-2">
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
            title="Attach a document or image (use Document Manager for multiple at once)"
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

          {/* Recording control buttons */}
          {isRecording && (
            <>
              {/* Cancel recording button */}
              <button
                type="button"
                onClick={cancelRecording}
                aria-label="Cancel voice recording"
                className="p-1.5 md:p-2 px-2.5 md:px-3 rounded-lg transition bg-gray-500 hover:bg-gray-600 text-white font-medium text-xs flex items-center gap-1 flex-shrink-0"
                title="Cancel recording"
              >
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="hidden sm:inline">Cancel</span>
              </button>
              {/* End recording button */}
              <button
                type="button"
                onClick={stopRecording}
                aria-label="End voice recording"
                aria-pressed={isRecording}
                className="p-1.5 md:p-2 px-2.5 md:px-3 rounded-lg transition bg-red-600 hover:bg-red-700 text-white font-medium text-xs flex items-center gap-1 animate-pulse flex-shrink-0"
                title="End recording and send"
              >
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                <span>End</span>
              </button>
            </>
          )}

          {/* Text input / Recording / Transcribing area */}
          {isRecording ? (
            <div className="flex-1 flex items-center gap-2 px-2 py-2 md:px-3 bg-red-50 dark:bg-red-900/30 rounded-lg border-2 border-red-300 dark:border-red-800" style={{ minHeight: '40px' }}>
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse flex-shrink-0"></div>
              <div className="flex-1 min-w-0">
                <AudioWaveform stream={audioStream} isRecording={isRecording} />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {recordingTimeLeft < 60 && (
                  <span className="text-red-600 dark:text-red-400 text-xs md:text-sm">⚠️</span>
                )}
                <span className={`text-xs md:text-sm font-bold font-mono ${recordingTimeLeft < 60 ? 'text-red-700 dark:text-red-300 animate-pulse' : 'text-red-800 dark:text-red-300'}`}>
                  {formatTime(recordingTimeLeft)}
                </span>
              </div>
            </div>
          ) : isTranscribing ? (
            <div className="flex-1 flex items-center space-x-2 px-2 py-2 md:px-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border-2 border-blue-300 dark:border-blue-800" style={{ minHeight: '40px' }}>
              <svg className="w-4 h-4 md:w-5 md:h-5 text-blue-700 dark:text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-xs md:text-sm font-medium text-blue-800 dark:text-blue-300">Transcribing your audio...</span>
            </div>
          ) : (
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
          )}
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
