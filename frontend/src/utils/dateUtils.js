/**
 * Parses a date string in either YYYY-MM-DD format or locale format
 * @param {string} dateString - Date string to parse
 * @returns {Date} Parsed date object
 */
const parseDate = (dateString) => {
  // Check if it's YYYY-MM-DD format (used by JournalView)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  // Otherwise parse as locale string (used by Documents, AudioRecordings)
  return new Date(dateString);
};

/**
 * Checks if a date string represents today
 * @param {string} dateString - Date in YYYY-MM-DD or locale format
 * @returns {boolean} True if the date is today
 */
export const isToday = (dateString) => {
  const date = parseDate(dateString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

/**
 * Checks if a date string represents a future date
 * @param {string} dateString - Date in YYYY-MM-DD or locale format
 * @returns {boolean} True if the date is in the future
 */
export const isFuture = (dateString) => {
  const entryDate = parseDate(dateString);
  entryDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return entryDate > today;
};

/**
 * Formats a date string to short format (e.g., "Dec 14")
 * @param {string} dateString - Date in YYYY-MM-DD or locale format
 * @returns {string} Short formatted date
 */
export const formatDateShort = (dateString) => {
  const date = parseDate(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Formats a UTC timestamp to the user's local timezone
 * @param {string} utcTimestamp - ISO timestamp from backend (UTC)
 * @returns {string} Formatted date/time string in user's local timezone
 */
export const formatLocalDateTime = (utcTimestamp) => {
  if (!utcTimestamp) return '-';

  // Ensure the timestamp is treated as UTC
  const dateStr = utcTimestamp.endsWith('Z') ? utcTimestamp : `${utcTimestamp}Z`;
  const date = new Date(dateStr);

  // Format in user's local timezone
  return date.toLocaleString();
};

/**
 * Formats seconds as MM:SS for recording timers
 * @param {number} seconds - Total seconds
 * @returns {string} Formatted time string (e.g., "14:30")
 */
export const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Formats a UTC timestamp to just the local date (no time)
 * @param {string} utcTimestamp - ISO timestamp from backend (UTC)
 * @returns {string} Formatted date string in user's local timezone
 */
export const formatLocalDate = (utcTimestamp) => {
  if (!utcTimestamp) return '-';

  // Ensure the timestamp is treated as UTC
  const dateStr = utcTimestamp.endsWith('Z') ? utcTimestamp : `${utcTimestamp}Z`;
  const date = new Date(dateStr);

  // Format as date only in user's local timezone
  return date.toLocaleDateString();
};
