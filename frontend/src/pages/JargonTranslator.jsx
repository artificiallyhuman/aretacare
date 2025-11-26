import React, { useState } from 'react';
import { medicalAPI } from '../services/api';
import Disclaimer from '../components/Disclaimer';

const JargonTranslator = () => {
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
      const response = await medicalAPI.translateJargon(medicalTerm, context);
      setTranslation(response.data);
    } catch (err) {
      setError('Failed to translate term: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">
        Medical Jargon Translator
      </h1>

      <Disclaimer />

      <div className="card mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
          Enter Medical Term
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
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
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
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
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
            Translation: {translation.term}
          </h2>

          <div className="prose max-w-none">
            <div className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap mb-4">
              {translation.explanation}
            </div>

            {translation.context_note && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 mt-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> {translation.context_note}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default JargonTranslator;
