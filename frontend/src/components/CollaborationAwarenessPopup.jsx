import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSessionContext } from '../contexts/SessionContext';

export default function CollaborationAwarenessPopup() {
  const { activeSession, sessions, loading } = useSessionContext();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const prevSessionIdRef = useRef(null);

  useEffect(() => {
    if (loading || !activeSession) return;

    // Consume login flag if present
    const justLoggedIn = sessionStorage.getItem('just_logged_in');
    if (justLoggedIn) {
      sessionStorage.removeItem('just_logged_in');
    }

    const isCollab = activeSession.collaborators && activeSession.collaborators.length > 0;
    const sessionChanged = prevSessionIdRef.current !== null && prevSessionIdRef.current !== activeSession.id;

    // Show on login to a collaborative session, or on switching to one
    if (isCollab && (justLoggedIn || sessionChanged)) {
      setShow(true);
    }

    prevSessionIdRef.current = activeSession.id;
  }, [loading, activeSession?.id]);

  if (!show || !activeSession) return null;

  const collaboratorCount = activeSession.collaborators.length;
  const peopleWord = collaboratorCount === 1 ? 'person' : 'people';

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Caution: Shared Session</h2>
            </div>
            <button
              onClick={() => setShow(false)}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-4 py-3">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Your current session <strong>"{activeSession.name}"</strong> is shared with{' '}
              <strong>{collaboratorCount} {peopleWord}</strong>.
              Anything you enter (e.g., messages, documents) can be viewed by collaborators.
            </p>
          </div>

          {/* List collaborator names */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Collaborators:</p>
            <ul className="space-y-0.5">
              {activeSession.collaborators.map(c => (
                <li key={c.user_id} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500"></span>
                  {c.name}
                </li>
              ))}
            </ul>
          </div>

          {/* Show option to switch if user has other sessions */}
          {sessions.length > 1 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              You can switch to a different session using the session menu in the header.
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShow(false)}
            className="w-full px-4 py-2 bg-primary-600 dark:bg-primary-700 text-white rounded hover:bg-primary-700 dark:hover:bg-primary-600 font-medium text-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
