import React, { useState, useRef } from 'react';
import { conversationAPI } from '../services/api';
import { useSession } from '../hooks/useSession';
import AudioWaveform from './AudioWaveform';

const MessageInput = ({ onSendMessage, onFileUpload, loading }) => {
  const { sessionId } = useSession();
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioStream, setAudioStream] = useState(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const textareaRef = useRef(null);

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
    try {
      const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
      const response = await conversationAPI.transcribeAudio(audioFile, sessionId);
      const transcribedText = response.data.transcribed_text;

      // Add transcribed text to the message input
      setMessage(prev => prev ? `${prev}\n${transcribedText}` : transcribedText);
    } catch (error) {
      console.error('Error transcribing audio:', error);
      alert('Failed to transcribe audio. Please try again.');
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t-2 border-primary-200 bg-gradient-to-r from-primary-50 to-blue-50 p-2 md:p-4 shadow-lg">
      {/* Recording/Transcribing status */}
      {isRecording && (
        <div className="mb-2 md:mb-3 p-2 md:p-3 bg-red-100 rounded-lg border-2 border-red-300 shadow-sm space-y-2">
          <div className="flex items-center space-x-2">
            <div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-red-600 rounded-full animate-pulse"></div>
            <span className="text-xs md:text-sm font-medium text-red-800">Recording... Click "Stop" when finished</span>
          </div>
          {/* Live waveform visualization */}
          <AudioWaveform stream={audioStream} isRecording={isRecording} />
        </div>
      )}
      {isTranscribing && (
        <div className="mb-2 md:mb-3 flex items-center space-x-2 p-2 md:p-3 bg-blue-100 rounded-lg border-2 border-blue-300 shadow-sm">
          <svg className="w-4 h-4 md:w-5 md:h-5 text-blue-700 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-xs md:text-sm font-medium text-blue-800">Transcribing your audio...</span>
        </div>
      )}

      {/* File preview */}
      {selectedFile && (
        <div className="mb-2 md:mb-3 flex items-center space-x-2 p-2 md:p-3 bg-white rounded-lg border border-primary-200 shadow-sm">
          <svg className="w-4 h-4 md:w-5 md:h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span className="text-xs md:text-sm text-gray-800 flex-1 font-medium truncate">{selectedFile.name}</span>
          <button
            type="button"
            onClick={removeFile}
            className="text-red-600 hover:text-red-700 text-xs md:text-sm font-medium"
          >
            Remove
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="bg-white rounded-lg md:rounded-xl shadow-md border border-primary-200">
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
            placeholder="Type your message..."
            className="flex-1 resize-none border-0 rounded-lg px-2 py-2 md:px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50 max-h-[200px] overflow-y-auto text-base"
            rows={1}
            disabled={loading}
            style={{ minHeight: '40px' }}
          />
        </div>

        {/* Bottom row: Send button (full width on mobile) */}
        <div className="px-1.5 pb-1.5 md:px-2 md:pb-2">
          <button
            type="submit"
            disabled={loading || (!message.trim() && !selectedFile)}
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

export default MessageInput;
