import React, { useEffect, useRef } from 'react';

/**
 * AudioWaveform - Real-time audio visualization component
 * Shows a live waveform when recording to provide visual feedback
 * that the microphone is working and picking up sound
 */
const AudioWaveform = ({ stream, isRecording }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (!stream || !isRecording) {
      // Stop animation and cleanup
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      return;
    }

    // Set up Web Audio API for waveform visualization
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    analyser.fftSize = 2048;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasContext = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const draw = () => {
      if (!isRecording) return;

      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(dataArray);

      // Check for dark mode
      const isDarkMode = document.documentElement.classList.contains('dark');

      // Clear canvas
      canvasContext.fillStyle = isDarkMode ? 'rgb(127, 29, 29)' : 'rgb(254, 242, 242)'; // dark:red-900 : red-50
      canvasContext.fillRect(0, 0, width, height);

      // Draw waveform
      canvasContext.lineWidth = 2;
      canvasContext.strokeStyle = isDarkMode ? 'rgb(252, 165, 165)' : 'rgb(220, 38, 38)'; // dark:red-300 : red-600
      canvasContext.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          canvasContext.moveTo(x, y);
        } else {
          canvasContext.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasContext.lineTo(width, height / 2);
      canvasContext.stroke();
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        // Null the ref: the effect body re-runs right after this cleanup, and
        // its !stream branch would close() the same context a second time —
        // an unhandled InvalidStateError rejection on every recording stop.
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stream, isRecording]);

  return (
    <div className="w-full h-6 rounded overflow-hidden">
      <canvas
        ref={canvasRef}
        width={600}
        height={24}
        className="w-full h-full"
      />
    </div>
  );
};

export default AudioWaveform;
