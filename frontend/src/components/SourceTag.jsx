import React from 'react';

/**
 * SourceTag - Displays initials of who created/edited an item in collaborative sessions.
 * Shows initials in a small badge with full name on hover.
 *
 * @param {Object} sourceTag - The source tag info object with user_id, name, initials
 * @param {string} currentUserId - The current user's ID (to hide tags for own items)
 * @param {string} variant - 'default' | 'user' | 'small' - styling variant
 */
const SourceTag = ({ sourceTag, currentUserId, variant = 'default' }) => {
  // Don't show tag if no data or if it's the current user's item
  if (!sourceTag || sourceTag.user_id === currentUserId) {
    return null;
  }

  // Style variants
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-full cursor-default';

  const variantClasses = {
    default: 'text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300',
    user: 'text-xs px-1.5 py-0.5 bg-primary-200 dark:bg-primary-700 text-primary-800 dark:text-primary-200',
    small: 'text-[10px] px-1 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300',
  };

  return (
    <span
      className={`${baseClasses} ${variantClasses[variant] || variantClasses.default}`}
      title={sourceTag.name}
    >
      {sourceTag.initials}
    </span>
  );
};

export default SourceTag;
