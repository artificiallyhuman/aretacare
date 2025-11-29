import React, { useState } from 'react';

const About = () => {
  const [activeTab, setActiveTab] = useState('platform');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900/50 rounded-full mx-auto mb-4">
          <svg
            className="w-8 h-8 text-primary-600 dark:text-primary-400"
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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome to AretaCare</h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">Your AI Care Advocate</p>
        <p className="text-gray-700 dark:text-gray-300 max-w-xl mx-auto">
          AretaCare helps you understand complex medical information, organize your health journey, and prepare meaningful questions for your healthcare team.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('platform')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'platform'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            The Platform
          </button>
          <button
            onClick={() => setActiveTab('story')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'story'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            The Story
          </button>
        </div>
      </div>

      {/* The Platform Tab */}
      {activeTab === 'platform' && (
      <>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-lg mr-4">
              <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Conversation</h4>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-3">A running dialogue that references your journal for context:</p>
          <ul className="text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <li className="flex items-start">
              <span className="text-blue-600 dark:text-blue-400 mr-2 mt-1">•</span>
              <span>Type messages, record audio, or upload documents like lab results</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 dark:text-blue-400 mr-2 mt-1">•</span>
              <span>Get personalized support based on your complete care history</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 dark:text-blue-400 mr-2 mt-1">•</span>
              <span>Understand complex medical terminology in the context of your situation</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 dark:text-blue-400 mr-2 mt-1">•</span>
              <span>Prepare thoughtful questions for your healthcare team</span>
            </li>
          </ul>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900/50 rounded-lg mr-4">
              <svg className="w-7 h-7 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Journal</h4>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-3">Your care journey automatically organized into a daily timeline:</p>
          <ul className="text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <li className="flex items-start">
              <span className="text-green-600 dark:text-green-400 mr-2 mt-1">•</span>
              <span>Intelligent categorization into medications, symptoms, appointments, test results, and questions</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-600 dark:text-green-400 mr-2 mt-1">•</span>
              <span>View entries by date, edit or add notes manually</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-600 dark:text-green-400 mr-2 mt-1">•</span>
              <span>Maintain a comprehensive record of your healthcare experience</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-600 dark:text-green-400 mr-2 mt-1">•</span>
              <span>Track patterns and trends over time</span>
            </li>
          </ul>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-amber-100 dark:bg-amber-900/50 rounded-lg mr-4">
              <svg className="w-7 h-7 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Daily Plan</h4>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-3">AI-generated daily summaries to keep you organized and focused:</p>
          <ul className="text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <li className="flex items-start">
              <span className="text-amber-600 dark:text-amber-400 mr-2 mt-1">•</span>
              <span>Automatically generated each day based on your journal, conversations, and documents</span>
            </li>
            <li className="flex items-start">
              <span className="text-amber-600 dark:text-amber-400 mr-2 mt-1">•</span>
              <span>Concise format highlighting today's priorities, important reminders, and questions for care team</span>
            </li>
            <li className="flex items-start">
              <span className="text-amber-600 dark:text-amber-400 mr-2 mt-1">•</span>
              <span>Edit and customize your daily plan to fit your needs</span>
            </li>
            <li className="flex items-start">
              <span className="text-amber-600 dark:text-amber-400 mr-2 mt-1">•</span>
              <span>View sidebar in conversation page or dedicated daily plan page with full history</span>
            </li>
          </ul>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/50 rounded-lg mr-4">
              <svg className="w-7 h-7 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Tools</h4>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-3">Specialized features to support your healthcare advocacy:</p>
          <ul className="text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <li className="flex items-start">
              <span className="text-purple-600 dark:text-purple-400 mr-2 mt-1">•</span>
              <span>Jargon Translator explains medical terms in plain language</span>
            </li>
            <li className="flex items-start">
              <span className="text-purple-600 dark:text-purple-400 mr-2 mt-1">•</span>
              <span>Conversation Coach helps you prepare questions and talking points before appointments</span>
            </li>
            <li className="flex items-start">
              <span className="text-purple-600 dark:text-purple-400 mr-2 mt-1">•</span>
              <span>Documents Manager uploads medical files with AI categorization, automatic descriptions, and searchable text extraction</span>
            </li>
            <li className="flex items-start">
              <span className="text-purple-600 dark:text-purple-400 mr-2 mt-1">•</span>
              <span>Audio Recordings captures voice notes with automatic transcription, AI categorization, and searchable summaries</span>
            </li>
          </ul>
        </div>

      </div>

      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition">
        <div className="flex items-center mb-4">
          <div className="flex items-center justify-center w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg mr-4">
            <svg className="w-7 h-7 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Sessions & Sharing</h4>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mb-3">Organize different care situations and collaborate with family members:</p>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h5 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Multiple Sessions</h5>
            <ul className="text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
              <li className="flex items-start">
                <span className="text-indigo-600 dark:text-indigo-400 mr-2 mt-1">•</span>
                <span>Create up to 3 sessions to organize different care situations or family members</span>
              </li>
              <li className="flex items-start">
                <span className="text-indigo-600 dark:text-indigo-400 mr-2 mt-1">•</span>
                <span>Each session has its own conversations, journal, documents, audio recordings, and daily plans</span>
              </li>
              <li className="flex items-start">
                <span className="text-indigo-600 dark:text-indigo-400 mr-2 mt-1">•</span>
                <span>Switch between sessions instantly using the dropdown in the header</span>
              </li>
            </ul>
          </div>
          <div>
            <h5 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Share with Family</h5>
            <ul className="text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
              <li className="flex items-start">
                <span className="text-indigo-600 dark:text-indigo-400 mr-2 mt-1">•</span>
                <span>Invite family members or caregivers to collaborate on a session by email</span>
              </li>
              <li className="flex items-start">
                <span className="text-indigo-600 dark:text-indigo-400 mr-2 mt-1">•</span>
                <span>Up to 5 people can share a session, keeping everyone informed and aligned</span>
              </li>
              <li className="flex items-start">
                <span className="text-indigo-600 dark:text-indigo-400 mr-2 mt-1">•</span>
                <span>Collaborators have full access to add, edit, and view all session content</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition">
        <div className="flex items-center mb-4">
          <div className="flex items-center justify-center w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg mr-4">
            <svg className="w-7 h-7 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Privacy & Security</h4>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mb-3">Your data belongs to you and is stored securely:</p>
        <ul className="text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
          <li className="flex items-start">
            <span className="text-gray-600 dark:text-gray-400 mr-2 mt-1">•</span>
            <span>All conversations, journal entries, documents, and recordings are tied to your session</span>
          </li>
          <li className="flex items-start">
            <span className="text-gray-600 dark:text-gray-400 mr-2 mt-1">•</span>
            <span>Clear your entire session at any time using the trash icon in the header</span>
          </li>
          <li className="flex items-start">
            <span className="text-gray-600 dark:text-gray-400 mr-2 mt-1">•</span>
            <span>Clearing <strong>permanently deletes</strong> all conversations, journal entries, uploaded documents, and audio recordings</span>
          </li>
          <li className="flex items-start">
            <span className="text-gray-600 dark:text-gray-400 mr-2 mt-1">•</span>
            <span>Once cleared, your data <strong>cannot be recovered</strong></span>
          </li>
        </ul>
      </div>
      </>
      )}

      {/* The Story Tab */}
      {activeTab === 'story' && (
      <div className="bg-gradient-to-br from-primary-50 to-blue-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border border-primary-200 dark:border-gray-700 p-8 shadow-sm">
        <div className="max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">Why I Created AretaCare</h3>

          <div className="prose prose-gray dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed">
            <p>
              AretaCare began for me on a late-night flight to San Antonio. I traveled because my mother was in the hospital, and I knew I needed to be there with her. When I arrived just before midnight, I walked through the quiet hallways and into her room, trying to understand the situation as clearly as possible.
            </p>

            <p>
              My mother was alert and in excruciating pain. She had an NG tube in her nose and had not been allowed to drink any water. She was uncomfortable and frustrated, trying to stay steady as her care plan continued to evolve.
            </p>

            <p>
              Not long after I walked in, she asked me if I could help her to the bathroom. She wanted to get up and walk on her own. Before I could move to help her, a nurse entered and told us, "Doctor's orders are not to move her."
            </p>

            <p>
              This did not match what I had been told earlier. I knew she was supposed to move. That moment showed me how difficult it can be for families to navigate conflicting instructions. The nurse was doing her best with the information she had. I was trying to support my mother. Yet the details did not align, leaving me to try to understand what was actually safe and correct.
            </p>

            <p>
              I stayed at her bedside. I slept in the chair next to her and woke whenever someone entered the room. Over the next hours and days, nurses came and went. Some explained things clearly. Others were moving quickly, balancing many patients. Doctors came through during rounds. Each specialist offered a piece of the overall picture, but the pieces did not always connect.
            </p>

            <p>
              There were tests. Multiple CT scans. Multiple MRI scans. Each one produced radiology reports filled with technical language that raised new questions for us. There were medications to track, instructions that shifted between day and night shifts, and a whiteboard that tried to help but never captured the whole story.
            </p>

            <p>
              My family worked hard to stay up to date. We shared group texts, exchanged notes, and tried to keep everyone on the same page, even though we were in different cities. Everyone wanted to make sure my mother felt supported and understood.
            </p>

            <p>
              My cousin in Michigan is a nurse practitioner, and she helped guide us from afar. She reviewed every update, translated the medical terms, and helped us prepare questions. Her help was invaluable, but it also revealed something important. Families should not have to rely on a medical professional in the family to understand what is happening to someone they love.
            </p>

            <p>
              During those days, I realized what I wished we had. I wanted a straightforward way to keep track of every change. I wanted someone who could explain updates in plain English, help organize the information, and guide us in preparing thoughtful questions for the care team. A steady presence. A calm partner. Someone who helps a family stay grounded during moments that can feel confusing and constant.
            </p>

            <p className="font-medium text-gray-900 dark:text-white">
              Not a doctor.<br />
              Not someone giving medical advice.<br />
              A guide. A companion who helps families understand what is happening and what to ask next.
            </p>

            <p>
              This is why I created AretaCare. It grew from sitting beside my mother and seeing how easily information can scatter and become overwhelming. It grew from watching how hard families work to stay informed and united. My hope is that AretaCare will give families the clarity, organization, and support I wished we had during those long nights and complicated days.
            </p>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default About;
