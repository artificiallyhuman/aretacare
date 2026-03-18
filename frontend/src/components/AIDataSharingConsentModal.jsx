import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';

const DATA_CATEGORIES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    title: 'Conversations',
    description: 'Messages and chat history',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    title: 'Health Information',
    description: 'Profile, conditions, medications, allergies',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'Documents & Audio',
    description: 'Uploaded files and recordings',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    title: 'Journal & Digests',
    description: 'Notes, summaries, and daily digests',
  },
];

export default function AIDataSharingConsentModal({ user, setUser }) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState('');

  if (!user || user.has_ai_data_sharing_consent) return null;

  const handleAccept = async () => {
    setIsAccepting(true);
    setError('');
    try {
      await authAPI.acceptAIDataSharing();
      setUser({ ...user, has_ai_data_sharing_consent: true });
    } catch {
      setError('Something went wrong. Please try again.');
      setIsAccepting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            How AretaCare Uses AI
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Before you begin, please review how your data is processed by a third-party AI service.
          </p>
        </div>

        {/* Data Categories */}
        <div className="px-6">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
            {DATA_CATEGORIES.map((cat) => (
              <div key={cat.title} className="flex items-start gap-3">
                <div className="flex-shrink-0 text-primary-600 dark:text-primary-400 mt-0.5">
                  {cat.icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{cat.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{cat.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclosure */}
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            This data is sent to <strong>OpenAI</strong> to power AretaCare's AI features, including conversation responses, journal synthesis, daily digests, audio transcription, and health profile generation.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            OpenAI processes this data under their API data usage policy and <strong>does not use it to train their models</strong>.
          </p>
        </div>

        {/* Links */}
        <div className="px-6 pb-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-600">
            <Link
              to="/privacy"
              target="_blank"
              className="flex items-center justify-between px-4 py-3 text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              <span>AretaCare Privacy Policy</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
            <a
              href="https://openai.com/enterprise-privacy/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              <span>OpenAI API Data Privacy</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-6 pb-2">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Accept Button */}
        <div className="px-6 pb-6">
          <button
            onClick={handleAccept}
            disabled={isAccepting}
            className="w-full px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAccepting ? 'Please wait...' : 'I Understand and Agree'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
