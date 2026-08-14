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
