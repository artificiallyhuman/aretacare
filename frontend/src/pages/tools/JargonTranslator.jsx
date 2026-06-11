import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { MarkdownLink } from '../../utils/markdownComponents';
import { toolsAPI } from '../../services/api';
import { useSessionContext } from '../../contexts/SessionContext';
import { markdownToHtml } from '../../utils/markdownUtils';
import SEO from '../../components/SEO';

const JargonTranslator = () => {
  const { activeSessionId: sessionId, user } = useSessionContext();
  const [medicalTerm, setMedicalTerm] = useState('');
  const [context, setContext] = useState('');
  const [translation, setTranslation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

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
      setError(err.response?.data?.detail || 'Failed to translate term. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!translation) return;

    try {
      // Combine explanation and context note if present
      let content = translation.explanation;
      if (translation.context_note) {
        content += `\n\n**Note:** ${translation.context_note}`;
      }

      // Convert markdown to HTML for rich text paste
      const html = markdownToHtml(content);

      // Create clipboard item with both HTML and plain text
      const blob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([content], { type: 'text/plain' });

      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blob,
          'text/plain': textBlob
        })
      ]);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback to plain text if clipboard API fails
      try {
        let content = translation.explanation;
        if (translation.context_note) {
          content += `\n\nNote: ${translation.context_note}`;
        }
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy also failed:', fallbackErr);
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <SEO />
      {!user && (
        <div className="mb-4 flex items-center justify-between">
          <Link to="/" className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1 group">
            <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to home
          </Link>
        </div>
      )}

      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          Medical Jargon Translator
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Get plain-language explanations of medical terms
        </p>
        <div className="mt-4 space-y-3 text-sm sm:text-base text-gray-700 dark:text-gray-300 max-w-3xl">
          <p>
            Doctor visits, discharge summaries, and lab reports are full of words most patients never learned in school. This free tool turns medical jargon into plain English so you and your family can actually understand what's being said.
          </p>
          <p>
            Paste a term, an abbreviation, a lab value, a drug name, or a diagnosis — for example <em>hypertension</em>, <em>CBC with differential</em>, <em>BNP</em>, <em>NPO after midnight</em>, or <em>tachycardia</em>. You'll get a short, clear explanation along with what it usually means in everyday care and which questions are worth asking your clinician.
          </p>
        </div>
      </div>

      {/* Important Banner */}
      <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-600 p-4 rounded-r-lg">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1">Important</h3>
            <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
              Explanations are for informational purposes only and are not medical advice.
            </p>
          </div>
        </div>
      </div>

      {!user && (
        <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            <Link to="/login" className="font-medium underline hover:no-underline">Sign in</Link> to get personalized results based on your health journal.
          </p>
        </div>
      )}

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

      {translation && (<>
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Translation: {translation.term}
            </h2>
            <button
              onClick={handleCopy}
              className="p-2 sm:px-3 sm:py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition flex items-center space-x-1.5"
              title="Copy to clipboard"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="hidden sm:inline">Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="hidden sm:inline">Copy</span>
                </>
              )}
            </button>
          </div>

          <div className="prose prose-sm max-w-none prose-gray dark:prose-invert prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-800 dark:prose-p:text-gray-200 mb-4">
            <ReactMarkdown
              components={{
                a: MarkdownLink,
                p: ({node, ...props}) => <p className="mb-2 leading-relaxed text-gray-800 dark:text-gray-200" {...props} />,
                h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-3 mt-4 text-gray-900 dark:text-white" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-lg font-semibold mb-2 mt-3 text-gray-900 dark:text-white" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-base font-semibold mb-2 mt-3 text-gray-900 dark:text-white" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc mb-3 space-y-1 pl-5 text-gray-800 dark:text-gray-200" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal mb-3 space-y-1 pl-5 text-gray-800 dark:text-gray-200" {...props} />,
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
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 sm:p-4 mt-4">
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <strong>Note:</strong> <ReactMarkdown className="inline">{translation.context_note}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Sources are AI-generated and may not link to the exact page. Verify information with your healthcare provider.
        </p>
      </>)}
    </div>
  );
};

export default JargonTranslator;
