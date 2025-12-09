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
