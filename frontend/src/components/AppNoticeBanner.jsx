import React, { useCallback, useEffect, useRef, useState } from 'react';
import { noticeAPI } from '../services/api';

// The admin-published in-app notice (Admin → In-App Notice). It is the second electronic
// channel for breach notifications (docs/BREACH_RESPONSE.md), so it shows for every
// signed-in user, before AI consent and on every page. Plain text only: the body is never
// rendered as HTML or markdown, and the server only accepts https links on aretacare.com.

const DISMISSED_KEY = 'dismissedNoticeId';
const REFRESH_MS = 10 * 60 * 1000;

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(id) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(id));
  } catch {
    // Storage unavailable (private mode, blocked): the banner simply returns next load.
  }
}

const AppNoticeBanner = ({ userId }) => {
  const [notice, setNotice] = useState(null);
  const [dismissedId, setDismissedId] = useState(readDismissed);
  const lastFetch = useRef(0);

  const load = useCallback(async () => {
    lastFetch.current = Date.now();
    try {
      const response = await noticeAPI.getCurrent();
      setNotice(response.data?.notice ?? null);
    } catch {
      // Keep whatever is showing; the next visit or refresh tries again.
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setNotice(null);
      return undefined;
    }
    load();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > REFRESH_MS) {
        load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, load]);

  if (!notice || String(notice.id) === dismissedId) return null;

  const dismiss = () => {
    writeDismissed(notice.id);
    setDismissedId(String(notice.id));
  };
  const link = notice.link_url && notice.link_url.startsWith('https://') ? notice.link_url : null;

  return (
    <div
      role="region"
      aria-label="Important notice"
      className="border-b border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-start gap-3">
        <svg className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="flex-1 min-w-0 max-h-48 overflow-y-auto">
          <p className="font-semibold text-gray-900 dark:text-white">{notice.title}</p>
          <p className="mt-1 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line break-words">{notice.body}</p>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-amber-800 dark:text-amber-300 underline hover:no-underline"
            >
              {notice.link_label || 'Learn more'}
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="flex-shrink-0 rounded-md px-2 py-1 text-sm font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-800/50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default AppNoticeBanner;
