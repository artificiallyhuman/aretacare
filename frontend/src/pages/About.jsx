import React, { useState } from 'react';

const About = () => {
  const [activeTab, setActiveTab] = useState('story');

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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome to AretaCare<span className="font-normal">™</span></h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">Care | Clarity | Confidence</p>
        <p className="text-gray-700 dark:text-gray-300 max-w-xl mx-auto">
          AretaCare helps you make sense of complicated medical information, stay organized through stressful moments, and have confident conversations with your care team.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('story')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'story'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Story
          </button>
          <button
            onClick={() => setActiveTab('platform')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'platform'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Platform
          </button>
          <button
            onClick={() => setActiveTab('principles')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'principles'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Principles
          </button>
        </div>
      </div>

      {/* The Platform Tab */}
      {activeTab === 'platform' && (
      <>
      <div className="grid md:grid-cols-2 gap-6">
        {/* Conversation */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-lg mr-4">
              <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Conversation</h4>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-3">A simple place to manage your care journey:</p>
          <ul className="text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <li className="flex items-start">
              <span className="text-blue-600 dark:text-blue-400 mr-2 mt-1">•</span>
              <span>Interact your way: type messages, record voice notes, and share documents</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 dark:text-blue-400 mr-2 mt-1">•</span>
              <span>Get personalized support based on your complete care history</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 dark:text-blue-400 mr-2 mt-1">•</span>
              <span>Everything is organized automatically in the background</span>
            </li>
          </ul>
        </div>

        {/* Daily Plan */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-amber-100 dark:bg-amber-900/50 rounded-lg mr-4">
              <svg className="w-7 h-7 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Daily Plan</h4>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-3">AI-generated daily plans that keep you focused on what matters:</p>
          <ul className="text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <li className="flex items-start">
              <span className="text-amber-600 dark:text-amber-400 mr-2 mt-1">•</span>
              <span>Created each day using your journal, conversations, and documents</span>
            </li>
            <li className="flex items-start">
              <span className="text-amber-600 dark:text-amber-400 mr-2 mt-1">•</span>
              <span>Highlights priorities, reminders, and questions for the care team</span>
            </li>
            <li className="flex items-start">
              <span className="text-amber-600 dark:text-amber-400 mr-2 mt-1">•</span>
              <span>Fully editable so you can make it your own</span>
            </li>
          </ul>
        </div>

        {/* Collaboration */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg mr-4">
              <svg className="w-7 h-7 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Collaboration</h4>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-3">Keep everyone aligned and working together:</p>
          <ul className="text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <li className="flex items-start">
              <span className="text-emerald-600 dark:text-emerald-400 mr-2 mt-1">•</span>
              <span>Up to 10 people can collaborate on each AretaCare session</span>
            </li>
            <li className="flex items-start">
              <span className="text-emerald-600 dark:text-emerald-400 mr-2 mt-1">•</span>
              <span>A single source of truth for conversations, documents, and care information</span>
            </li>
            <li className="flex items-start">
              <span className="text-emerald-600 dark:text-emerald-400 mr-2 mt-1">•</span>
              <span>Invite family members and caregivers to join your sessions</span>
            </li>
          </ul>
        </div>

        {/* Tools */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/50 rounded-lg mr-4">
              <svg className="w-7 h-7 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Tools</h4>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-3">Advanced features that put you in control of your care journey:</p>
          <ul className="text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <li className="flex items-start">
              <span className="text-purple-600 dark:text-purple-400 mr-2 mt-1">•</span>
              <span>Journal, Documents, and Audio keep everything organized in one place</span>
            </li>
            <li className="flex items-start">
              <span className="text-purple-600 dark:text-purple-400 mr-2 mt-1">•</span>
              <span>Coach helps you prepare thoughtful questions before appointments</span>
            </li>
            <li className="flex items-start">
              <span className="text-purple-600 dark:text-purple-400 mr-2 mt-1">•</span>
              <span>Translator explains medical terms in language you can understand</span>
            </li>
          </ul>
        </div>

      </div>

      {/* Privacy & Security */}
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
            <span>Each session keeps conversations, journal, documents, and audio recordings separate</span>
          </li>
          <li className="flex items-start">
            <span className="text-gray-600 dark:text-gray-400 mr-2 mt-1">•</span>
            <span>Delete individual sessions or your entire account anytime from Settings</span>
          </li>
          <li className="flex items-start">
            <span className="text-gray-600 dark:text-gray-400 mr-2 mt-1">•</span>
            <span>Deletion is <strong>permanent</strong> and removes all associated data from our servers</span>
          </li>
          <li className="flex items-start">
            <span className="text-gray-600 dark:text-gray-400 mr-2 mt-1">•</span>
            <span>You control who has access to your sessions through collaboration settings</span>
          </li>
        </ul>
      </div>
      </>
      )}

      {/* The Story Tab */}
      {activeTab === 'story' && (
      <div className="bg-gradient-to-br from-primary-50 to-blue-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border border-primary-200 dark:border-gray-700 p-8 shadow-sm">
        <div className="max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">Why I Created AretaCare<span className="font-normal">™</span></h3>

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
              This is why I created AretaCare. It grew from sitting beside my mother and seeing how easily information can scatter and become overwhelming. It grew from watching how hard families work to stay informed and united. My hope is that AretaCare will give families the care, clarity, and confidence I wished we had during those long nights and complicated days.
            </p>
          </div>
        </div>
      </div>
      )}

      {/* The Principles Tab */}
      {activeTab === 'principles' && (
        <div className="space-y-6">
          {/* Principle 1 */}
          <div className="bg-gradient-to-br from-white to-blue-50/30 dark:from-gray-800 dark:to-blue-900/10 rounded-xl border-l-4 border-blue-500 dark:border-blue-400 shadow-md">
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="flex-grow">
                  <h3 className="text-2xl font-bold text-blue-600 dark:text-blue-400">Built for patients and caregivers</h3>
                </div>
              </div>
              <div className="prose prose-gray dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed pl-16">
                <p>
                  Most healthcare platforms balance the needs of multiple stakeholders (e.g., hospitals, insurers, investors). We don't. AretaCare is built for patients and caregivers, plain and simple.
                </p>
                <p>
                  That choice informs every part of the platform. We designed AretaCare so families can work together in one place, with conversations, data, and documents organized and accessible. We intentionally don't give medical advice or steer care decisions. Instead, we help you make sense of the professional care you're receiving and support you in advocating for yourself and the people you love.
                </p>
                <p className="font-semibold text-gray-900 dark:text-white bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border-l-2 border-blue-500 dark:border-blue-400">
                  AretaCare exists to provide patients and caregivers with clarity and confidence.
                </p>
              </div>
            </div>
          </div>

          {/* Principle 2 */}
          <div className="bg-gradient-to-br from-white to-green-50/30 dark:from-gray-800 dark:to-green-900/10 rounded-xl border-l-4 border-green-500 dark:border-green-400 shadow-md">
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900/50 rounded-lg">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-grow">
                  <h3 className="text-2xl font-bold text-green-600 dark:text-green-400">Free for all who need it</h3>
                </div>
              </div>
              <div className="prose prose-gray dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed pl-16">
                <p>
                  Caregiving is stressful enough without worrying about another bill.
                </p>
                <p>
                  AretaCare’s core platform is free and will remain free. You shouldn’t have to check your insurance coverage to get the help you need.
                </p>
                <p>
                  To keep innovating and delivering the service you deserve, AretaCare needs a sustainable model. We'll explore options like optional premium features that pay the bills without putting core features behind a paywall.
                </p>
                <p className="font-semibold text-gray-900 dark:text-white bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border-l-2 border-green-500 dark:border-green-400">
                  AretaCare is available to anyone who needs it, regardless of their ability to pay.
                </p>
              </div>
            </div>
          </div>

          {/* Principle 3 */}
          <div className="bg-gradient-to-br from-white to-purple-50/30 dark:from-gray-800 dark:to-purple-900/10 rounded-xl border-l-4 border-purple-500 dark:border-purple-400 shadow-md">
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-grow">
                  <h3 className="text-2xl font-bold text-purple-600 dark:text-purple-400">Powered by the latest technology</h3>
                </div>
              </div>
              <div className="prose prose-gray dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed pl-16">
                <p>
                  Technology is moving fast, and the people who need it most shouldn't wait years for new capabilities to trickle into tools built for them.
                </p>
                <p>
                  Our commitment is to stay on the frontier and bring new technologies to patients and caregivers quickly and responsibly. When better AI models, infrastructure, and devices become available, our first instinct is to test and integrate them. Not because it's trendy, but because new capabilities can help you understand complex situations more clearly, spot problems sooner, and stay organized under pressure.
                </p>
                <p className="font-semibold text-gray-900 dark:text-white bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border-l-2 border-purple-500 dark:border-purple-400">
                  AretaCare strives to bring patients and caregivers the best technology available.
                </p>
              </div>
            </div>
          </div>

          {/* Principle 4 */}
          <div className="bg-gradient-to-br from-white to-amber-50/30 dark:from-gray-800 dark:to-amber-900/10 rounded-xl border-l-4 border-amber-500 dark:border-amber-400 shadow-md">
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                  <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="flex-grow">
                  <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400">It's your data, not ours</h3>
                </div>
              </div>
              <div className="prose prose-gray dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed pl-16">
                <p>
                  We take your trust seriously. You're sharing personal, sometimes deeply sensitive information with us so you can manage care more effectively. That trust comes with clear responsibilities.
                </p>
                <p>
                  We can't promise that the internet is safe or that no one will ever attempt to break in. What we can promise is that we will never be the ones you have to worry about. We won't sell your data. We won't share it with hospitals or insurers. We won't hold it hostage. If you choose to delete your data, it's deleted. This is your information, and you stay in control of it.
                </p>
                <p className="font-semibold text-gray-900 dark:text-white bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border-l-2 border-amber-500 dark:border-amber-400">
                  AretaCare will always respect your personal data and never profit from it.
                </p>
              </div>
            </div>
          </div>

          {/* Principle 5 */}
          <div className="bg-gradient-to-br from-white to-indigo-50/30 dark:from-gray-800 dark:to-indigo-900/10 rounded-xl border-l-4 border-indigo-500 dark:border-indigo-400 shadow-md">
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                  <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </div>
                <div className="flex-grow">
                  <h3 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Built in the open</h3>
                </div>
              </div>
              <div className="prose prose-gray dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed pl-16">
                <p>
                  AretaCare is open source for a simple reason: transparency builds trust.
                </p>
                <p>
                  Experts can review how the platform works, suggest improvements, and help make the platform safer and more reliable. Even if you never read a line of code, you benefit from a community of people who can verify that we're doing what we say we're doing. When we say your data is deleted when you press a button, you shouldn't have to take that on faith: it's visible in the code.
                </p>
                <p className="font-semibold text-gray-900 dark:text-white bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border-l-2 border-indigo-500 dark:border-indigo-400">
                  AretaCare is open source because transparency builds trust: {' '}
                  <a
                    href="https://github.com/artificiallyhuman/aretacare"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-200 underline"
                  >
                    github.com/artificiallyhuman/aretacare
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default About;
