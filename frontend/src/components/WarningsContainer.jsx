import React from 'react';

/**
 * Reusable warnings container that can display multiple warnings
 * Each warning has a type, title, and message
 */
const WarningsContainer = ({ warnings = [] }) => {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg divide-y divide-amber-200 dark:divide-amber-800">
      {warnings.map((warning, index) => (
        <div key={index} className="p-2 md:p-3">
          <div className="flex items-start space-x-2">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="h-4 w-4 md:h-5 md:w-5 text-amber-600 dark:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-0.5">{warning.title}</h3>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
                {warning.message}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default WarningsContainer;
