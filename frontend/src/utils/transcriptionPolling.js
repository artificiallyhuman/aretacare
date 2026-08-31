import { audioRecordingsAPI } from '../services/api';
import { isAbortError, getRetryAfterSeconds } from './requestUtils';

/**
 * Polling for background audio transcription.
 *
 * `POST /conversation/transcribe` with `background=true` answers 202 as soon as the
 * recording is saved and transcribes in a background job. Clients then poll
 * `GET /audio-recordings/{session_id}/{recording_id}` until `transcription_status`
 * leaves "processing". An older backend that doesn't know `background` answers 200
 * with the transcript inline and no `transcription_status` key, which callers must
 * treat as "completed inline" — see isProcessingUpload().
 */

export const TRANSCRIPTION_FAILED_MESSAGE =
  'Transcription failed. The recording was saved in Audio Recordings.';
export const TRANSCRIPTION_TIMEOUT_MESSAGE =
  "Transcription is taking longer than expected. It's saved in Audio Recordings and the transcript will appear there.";
const RECORDING_GONE_MESSAGE = 'The recording is no longer available.';

// First polls are quick (a short clip finishes in seconds), then settle to 5s
const POLL_DELAYS_MS = [2000, 2000, 3000];
const STEADY_POLL_DELAY_MS = 5000;

const MIN_DEADLINE_MS = 3 * 60 * 1000;
const MAX_DEADLINE_MS = 30 * 60 * 1000;
const UNKNOWN_DURATION_DEADLINE_MS = 10 * 60 * 1000;

/**
 * True only when an upload response says the transcript is still being produced.
 * A missing `transcription_status` (old backend) means it was transcribed inline.
 *
 * @param {import('axios').AxiosResponse} response - Response from transcribeAudio
 * @returns {boolean}
 */
export const isProcessingUpload = (response) =>
  response?.data?.transcription_status === 'processing';

/**
 * How long to keep polling before giving up. Transcription runs at well under
 * real time, so 2x the recording length plus a couple of minutes of transcode /
 * queue headroom, bounded to 3-30 minutes. Duration is null for WebM until the
 * job probes the transcoded MP3, hence the fixed fallback.
 *
 * @param {number|null|undefined} durationSeconds - Recording length if known
 * @returns {number} Deadline in milliseconds from now
 */
export const transcriptionDeadlineMs = (durationSeconds) => {
  if (!(durationSeconds > 0)) return UNKNOWN_DURATION_DEADLINE_MS;
  return Math.min(
    MAX_DEADLINE_MS,
    Math.max(MIN_DEADLINE_MS, (2 * durationSeconds + 120) * 1000)
  );
};

const makeAbortError = () => {
  const error = new Error('Transcription polling was aborted');
  error.name = 'AbortError';
  return error;
};

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(makeAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Poll a recording until its transcript is ready.
 *
 * @param {number|string} sessionId - Care session that owns the recording
 * @param {number} recordingId - `recording_id` from the upload response
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - Abort → rejects with an error whose name is 'AbortError'
 * @param {number|null} [options.durationSeconds] - `duration` from the upload response, sizes the deadline
 * @returns {Promise<object>} The recording object (with `transcribed_text`) once completed
 * @throws {Error} With a user-facing `message` when transcription failed or the deadline passed
 */
export const waitForTranscription = async (
  sessionId,
  recordingId,
  { signal, durationSeconds } = {}
) => {
  const deadline = Date.now() + transcriptionDeadlineMs(durationSeconds);
  let extraDelayMs = 0;

  for (let attempt = 0; ; attempt += 1) {
    const delay = attempt < POLL_DELAYS_MS.length ? POLL_DELAYS_MS[attempt] : STEADY_POLL_DELAY_MS;
    await sleep(delay + extraDelayMs, signal);
    extraDelayMs = 0;

    let recording;
    try {
      const response = await audioRecordingsAPI.getRecording(sessionId, recordingId, { signal });
      recording = response.data;
    } catch (err) {
      if (isAbortError(err)) throw makeAbortError();
      const status = err.response?.status;
      if (status === 404) throw new Error(RECORDING_GONE_MESSAGE);
      // Other 4xx (auth, permission) won't fix themselves - surface the server's message
      if (status && status >= 400 && status < 500 && status !== 429) throw err;
      // Network blip, 5xx or 429: keep polling until the deadline. A 429 also
      // waits out the window the server reports instead of hammering it.
      if (Date.now() >= deadline) throw new Error(TRANSCRIPTION_TIMEOUT_MESSAGE);
      if (status === 429) extraDelayMs = getRetryAfterSeconds(err, 10) * 1000;
      continue;
    }

    // A missing status can only come from a backend without background
    // transcription, whose recordings are always complete
    const status = recording?.transcription_status ?? 'completed';
    if (status === 'completed') return recording;
    if (status === 'failed') throw new Error(TRANSCRIPTION_FAILED_MESSAGE);

    if (Date.now() >= deadline) throw new Error(TRANSCRIPTION_TIMEOUT_MESSAGE);
  }
};
