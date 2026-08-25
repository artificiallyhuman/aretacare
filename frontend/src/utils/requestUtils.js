/**
 * True when a rejected request was aborted rather than failed.
 *
 * Loaders abort their in-flight request when the active care session changes or
 * the page unmounts; those rejections are expected and must never surface as a
 * user-facing error. Axios reports aborts as CanceledError/ERR_CANCELED, the
 * native fetch/AbortController path as AbortError.
 *
 * @param {unknown} err - Rejection value from an aborted or failed request
 * @returns {boolean} True if the rejection was caused by an abort
 */
export const isAbortError = (err) =>
  err?.name === 'CanceledError' ||
  err?.name === 'AbortError' ||
  err?.code === 'ERR_CANCELED';

const RETRY_AFTER_UNIT_SECONDS = { second: 1, minute: 60, hour: 3600, day: 86400 };

/**
 * Seconds to wait before retrying a 429 response.
 *
 * Reads the `retry_after` body field written by the backend's rate-limit handler
 * and the `Retry-After` header (only readable when CORS exposes it). The body value
 * is slowapi's limit description ("10 per 1 minute"), not a count of seconds, so
 * it is parsed as the length of the fixed window; a plain number of seconds and an
 * HTTP-date header are also accepted.
 *
 * @param {unknown} err - Axios rejection for a 429 response
 * @param {number} [fallbackSeconds=60] - Used when nothing parseable is present
 * @param {number} [maxSeconds=60] - Upper bound on the returned wait
 * @returns {number} Whole seconds, between 1 and maxSeconds
 */
export const getRetryAfterSeconds = (err, fallbackSeconds = 60, maxSeconds = 60) => {
  const parse = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value).trim();
    if (/^\d+(\.\d+)?$/.test(text)) return parseFloat(text);
    const window = text.match(/per\s*(\d+)?\s*(second|minute|hour|day)/i);
    if (window) {
      return (parseInt(window[1] || '1', 10)) * RETRY_AFTER_UNIT_SECONDS[window[2].toLowerCase()];
    }
    const date = Date.parse(text);
    if (!Number.isNaN(date)) return (date - Date.now()) / 1000;
    return null;
  };

  const candidates = [
    err?.response?.data?.retry_after,
    err?.response?.headers?.['retry-after'],
  ];
  let seconds = null;
  for (const candidate of candidates) {
    seconds = parse(candidate);
    if (seconds !== null) break;
  }
  if (seconds === null) seconds = fallbackSeconds;
  return Math.min(maxSeconds, Math.max(1, Math.ceil(seconds)));
};
