import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { toolsAPI, documentAPI } from '../../services/api';
import { useSessionContext } from '../../contexts/SessionContext';

const MedicalSummary = () => {
  const { activeSessionId: sessionId, loading: sessionLoading } = useSessionContext();
  const [medicalText, setMedicalText] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadedFile(file);
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sessionId);

      const response = await documentAPI.upload(formData);
      const extractedText = response.data.extracted_text;

      if (extractedText) {
        setMedicalText(extractedText);
      } else {
        setError('Could not extract text from this file. Please try pasting the text manually.');
      }
    } catch (err) {
      setError('Failed to upload document: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!medicalText.trim()) {
      setError('Please provide medical text or upload a document.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await toolsAPI.generateSummary(medicalText);
      setSummary(response.data);
    } catch (err) {
      setError('Failed to generate summary: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sessionLoading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">
        Medical Summary Generator
      </h1>

      <div className="card mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
          Upload Medical Document or Paste Text
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Document (PDF, Image, or Text)
          </label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.txt"
            onChange={handleFileUpload}
            className="input"
            disabled={loading}
          />
          {uploadedFile && (
            <p className="mt-2 text-sm text-gray-600">
              Uploaded: {uploadedFile.name}
            </p>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Or Paste Medical Text
          </label>
          <textarea
            value={medicalText}
            onChange={(e) => setMedicalText(e.target.value)}
            placeholder="Paste medical notes, lab results, or clinical updates here..."
            rows={10}
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
          onClick={handleGenerateSummary}
          disabled={loading || !medicalText.trim()}
          className="btn-primary"
        >
          {loading ? 'Generating Summary...' : 'Generate Summary'}
        </button>
      </div>

      {summary && (
        <div className="card">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">Summary</h2>
          <div className="prose prose-sm sm:prose-base max-w-none">
            <ReactMarkdown>{summary.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default MedicalSummary;
