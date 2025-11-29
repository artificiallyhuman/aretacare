import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { toolsAPI } from '../../services/api';
import { useSessionContext } from '../../contexts/SessionContext';

const JargonTranslator = () => {
  const { activeSessionId: sessionId } = useSessionContext();
  const [medicalTerm, setMedicalTerm] = useState('');
  const [context, setContext] = useState('');
  const [translation, setTranslation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleTranslate = async () => {
    if (!medicalTerm.trim()) {
      setError('Please enter a medical term.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await toolsAPI.translateJargon(medicalTerm, context, sessionId);
      setTranslation(response.data);
    } catch (err) {
      setError('Failed to translate term: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
        Medical Jargon Translator
      </h1>

      <div className="card mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Enter Medical Term
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Medical Term or Phrase
          </label>
          <input
            type="text"
            value={medicalTerm}
            onChange={(e) => setMedicalTerm(e.target.value)}
            placeholder="e.g., 'hypertension', 'CBC', 'tachycardia'"
            className="input"
            disabled={loading}
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Context (Optional)
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Provide additional context if available..."
            rows={3}
            className="textarea"
            disabled={loading}
          />
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleTranslate}
          disabled={loading || !medicalTerm.trim()}
          className="btn-primary"
        >
          {loading ? 'Translating...' : 'Translate'}
        </button>
      </div>

      {translation && (
        <div className="card">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Translation: {translation.term}
          </h2>

          <div className="prose prose-sm max-w-none prose-gray dark:prose-invert prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-800 dark:prose-p:text-gray-200 mb-4">
            <ReactMarkdown
              components={{
                p: ({node, ...props}) => <p className="mb-2 leading-relaxed text-gray-800 dark:text-gray-200" {...props} />,
                h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-3 mt-4 text-gray-900 dark:text-white" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-lg font-semibold mb-2 mt-3 text-gray-900 dark:text-white" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-base font-semibold mb-2 mt-3 text-gray-900 dark:text-white" {...props} />,
                ul: ({node, ...props}) => <ul className="mb-3 space-y-1 pl-5 text-gray-800 dark:text-gray-200" {...props} />,
                ol: ({node, ...props}) => <ol className="mb-3 space-y-1 pl-5 text-gray-800 dark:text-gray-200" {...props} />,
                li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                code: ({node, inline, ...props}) =>
                  inline
                    ? <code className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-sm" {...props} />
                    : <code className="block bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 p-3 rounded my-2 text-sm overflow-x-auto" {...props} />,
                blockquote: ({node, ...props}) => (
                  <blockquote className="border-l-4 border-primary-400 pl-4 my-2 italic text-gray-700 dark:text-gray-300" {...props} />
                ),
                strong: ({node, ...props}) => <strong className="font-bold text-gray-900 dark:text-white" {...props} />,
              }}
            >
              {translation.explanation}
            </ReactMarkdown>
          </div>

          {translation.context_note && (
            <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 sm:p-4 mt-4">
              <div className="text-sm text-yellow-800 dark:text-yellow-300">
                <strong>Note:</strong> <ReactMarkdown className="inline">{translation.context_note}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default JargonTranslator;
