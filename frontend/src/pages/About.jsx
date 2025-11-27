import React from 'react';

const About = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mx-auto mb-4">
          <svg
            className="w-8 h-8 text-primary-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to AretaCare</h2>
        <p className="text-lg text-gray-600 mb-4">Your AI Care Advocate</p>
        <p className="text-gray-700 max-w-xl mx-auto">
          AretaCare helps you understand complex medical information, organize your health journey, and prepare meaningful questions for your healthcare team.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg mr-4">
              <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900">Conversation</h4>
          </div>
          <p className="text-gray-600 mb-3">A running dialogue that references your journal for context:</p>
          <ul className="text-gray-600 space-y-2 leading-relaxed">
            <li className="flex items-start">
              <span className="text-blue-600 mr-2 mt-1">•</span>
              <span>Type messages, record audio, or upload documents like lab results</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 mr-2 mt-1">•</span>
              <span>Get personalized support based on your complete care history</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 mr-2 mt-1">•</span>
              <span>Understand complex medical terminology in the context of your situation</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 mr-2 mt-1">•</span>
              <span>Prepare thoughtful questions for your healthcare team</span>
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg mr-4">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900">Journal</h4>
          </div>
          <p className="text-gray-600 mb-3">Your care journey automatically organized into a daily timeline:</p>
          <ul className="text-gray-600 space-y-2 leading-relaxed">
            <li className="flex items-start">
              <span className="text-green-600 mr-2 mt-1">•</span>
              <span>Intelligent categorization into medications, symptoms, appointments, test results, and questions</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-600 mr-2 mt-1">•</span>
              <span>View entries by date, edit or add notes manually</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-600 mr-2 mt-1">•</span>
              <span>Maintain a comprehensive record of your healthcare experience</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-600 mr-2 mt-1">•</span>
              <span>Track patterns and trends over time</span>
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-lg mr-4">
              <svg className="w-7 h-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900">Tools</h4>
          </div>
          <p className="text-gray-600 mb-3">Specialized features to support your healthcare advocacy:</p>
          <ul className="text-gray-600 space-y-2 leading-relaxed">
            <li className="flex items-start">
              <span className="text-purple-600 mr-2 mt-1">•</span>
              <span><strong>Jargon Translator:</strong> Explains medical terms in plain language</span>
            </li>
            <li className="flex items-start">
              <span className="text-purple-600 mr-2 mt-1">•</span>
              <span><strong>Conversation Coach:</strong> Helps you prepare questions and talking points before appointments</span>
            </li>
            <li className="flex items-start">
              <span className="text-purple-600 mr-2 mt-1">•</span>
              <span><strong>Documents Manager:</strong> Upload and organize medical files with text extraction</span>
            </li>
            <li className="flex items-start">
              <span className="text-purple-600 mr-2 mt-1">•</span>
              <span><strong>Audio Recordings:</strong> Store and transcribe voice notes from appointments or thoughts</span>
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-lg mr-4">
              <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900">Privacy & Security</h4>
          </div>
          <p className="text-gray-600 mb-3">Your data belongs to you and is stored securely:</p>
          <ul className="text-gray-600 space-y-2 leading-relaxed">
            <li className="flex items-start">
              <span className="text-gray-600 mr-2 mt-1">•</span>
              <span>All conversations, journal entries, documents, and recordings are tied to your session</span>
            </li>
            <li className="flex items-start">
              <span className="text-gray-600 mr-2 mt-1">•</span>
              <span>Clear your entire session at any time using the trash icon in the header</span>
            </li>
            <li className="flex items-start">
              <span className="text-gray-600 mr-2 mt-1">•</span>
              <span><strong>Clearing permanently deletes all conversations, journal entries, uploaded documents, and audio recordings</strong></span>
            </li>
            <li className="flex items-start">
              <span className="text-gray-600 mr-2 mt-1">•</span>
              <span><strong>Once cleared, your data cannot be recovered</strong></span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default About;
