import React, { useState } from 'react';
import logo from '../logos/large_logo.png';
import jasonSignature from '../logos/jason_signature.png';
import robSignature from '../logos/rob_signature.png';

const About = () => {
  const [activeTab, setActiveTab] = useState('story');
  const [expandedFaq, setExpandedFaq] = useState(null);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mx-auto mb-4">
          <img
            src={logo}
            alt="AretaCare Logo"
            className="w-20 h-20 object-contain"
          />
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
          <button
            onClick={() => setActiveTab('faq')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'faq'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            FAQs
          </button>
        </div>
      </div>

      {/* The Platform Tab */}
      {activeTab === 'platform' && (
      <>
      {/* Privacy & Security */}
      <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition">
        <div className="flex items-center mb-4">
          <div className="flex items-center justify-center w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg mr-4">
            <svg className="w-7 h-7 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Privacy & Security</h4>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mb-3">Your personal data is stored securely and never sold:</p>
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
            <span>Deletion is <strong>permanent</strong> and removes all associated personal data from our servers</span>
          </li>
          <li className="flex items-start">
            <span className="text-gray-600 dark:text-gray-400 mr-2 mt-1">•</span>
            <span>You control who has access to your sessions through collaboration settings</span>
          </li>
        </ul>
      </div>

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
              <span>Care Journal and Health Profile keep all your information organized</span>
            </li>
            <li className="flex items-start">
              <span className="text-purple-600 dark:text-purple-400 mr-2 mt-1">•</span>
              <span>Documents and Audio Recordings store and categorize your files</span>
            </li>
            <li className="flex items-start">
              <span className="text-purple-600 dark:text-purple-400 mr-2 mt-1">•</span>
              <span>Coach and Translator help you prepare questions and understand medical terms</span>
            </li>
          </ul>
        </div>

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
              AretaCare began for me on a late-night flight from Chicago to San Antonio. I was traveling because my mother was in the hospital, and I knew I needed to be there with her. When I arrived just before midnight, I walked through quiet hallways and into her room, trying to understand what was happening as clearly as possible.
            </p>

            <p>
              My mother was alert and in severe pain. She had an NG tube in her nose and had not been allowed to drink any water. She was uncomfortable and frustrated, doing her best to stay steady as her care plan continued to evolve.
            </p>

            <p>
              Not long after I arrived, she asked if I could help her to the bathroom. She wanted to get up and walk on her own. Before I could move, a nurse entered the room and said, "Doctor's orders are not to move her."
            </p>

            <p>
              That instruction did not match what I had been told earlier. I understood that she was supposed to move. In that moment, I saw how difficult it can be for families to navigate conflicting information. The nurse was doing her best with the information she had. I was trying to support my mother. Yet the details did not align, leaving me unsure what was actually safe or correct.
            </p>

            <p>
              I stayed at her bedside. I slept in the chair next to her and woke whenever someone entered the room. Over the next hours and days, nurses rotated in and out. Some explained things carefully. Others were moving quickly while managing many patients. Doctors came through during rounds. Each specialist offered a piece of the picture, but the pieces did not always connect.
            </p>

            <p>
              There were tests. Multiple CT scans. Multiple MRI scans. Each produced radiology reports filled with technical language that raised new questions. Medications changed. Instructions shifted between day and night shifts. A whiteboard tried to help, but it never captured the full story.
            </p>

            <p>
              Our family worked hard to stay aligned. We shared group texts, exchanged notes, and tried to keep everyone informed across different cities. Everyone wanted to make sure my mother felt supported and understood.
            </p>

            <p>
              My cousin in Michigan is a nurse practitioner, and she helped guide us from afar. She reviewed updates, translated medical language, and helped us prepare questions. Her support was invaluable, but it also revealed something important. Families should not have to rely on having a medical professional in the family to understand what is happening to someone they love.
            </p>

            <p>
              During those days, I realized what I wished we had.
            </p>

            <p>
              I wanted a simple and reliable way to track changes as they happened. I wanted someone who could explain updates in plain English, help organize information, and guide us in preparing thoughtful questions for the care team. A steady presence. A calm partner. Someone who helps families stay grounded when everything feels complex and constantly in motion.
            </p>

            <p className="font-medium text-gray-900 dark:text-white">
              Not a doctor.<br />
              Not someone giving medical advice.
            </p>

            <p className="font-medium text-gray-900 dark:text-white">
              A guide.<br />
              A companion.<br />
              Someone who helps families understand what is happening and what to ask next.
            </p>

            <p>
              That experience shaped the vision that became AretaCare.
            </p>

            <p>
              As the idea for AretaCare took shape, it became clear that it would require strong technical execution alongside empathy and clarity. Rob and I have been close friends for over twenty years, and that long-standing trust made him the natural partner to build the platform. Rob designed and developed the website and the systems that power AretaCare, transforming a deeply personal experience into a practical, dependable tool for families. His work provides the technical foundation that enables AretaCare to serve families consistently, with care and reliability.
            </p>

            <p>
              AretaCare grew from sitting beside my mother and seeing how easily information can scatter and become overwhelming. It grew from watching how hard families work to stay informed and united. Our hope is that AretaCare gives families the clarity, confidence, and support I wish we had during those long nights and complicated days.
            </p>

            {/* Jason's Signature */}
            <div className="mt-8 flex justify-center">
              <img
                src={jasonSignature}
                alt="Jason Whiteman"
                className="h-24 w-auto invert-0 dark:invert dark:brightness-200"
              />
            </div>

            {/* Separator */}
            <div className="my-12 flex items-center justify-center">
              <div className="flex-grow border-t border-primary-200 dark:border-gray-600"></div>
              <span className="mx-4 text-primary-400 dark:text-gray-500">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </span>
              <div className="flex-grow border-t border-primary-200 dark:border-gray-600"></div>
            </div>

            {/* Rob's Story */}
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">Why I Built AretaCare</h3>

            <p>
              Listening to Jason talk about caring for his mom brought back memories of my own family's experiences.
            </p>

            <p>
              I was young when my grandmother had a series of strokes, and at the time I didn't fully understand what was happening. It wasn't until years later that I grasped how much my parents had been navigating, how many long drives to the hospital, how many phone calls, how many late nights managing details I never saw.
            </p>

            <p>
              Even though I wasn't the one coordinating her care, I remember the heaviness in our house during that time. I remember the strain on my mom, the quiet exhaustion that came with trying to support someone while still handling everything else. Looking back, I can see how much the uncertainty weighed on everyone.
            </p>

            <p>
              When Jason described the confusion of his mother's hospital stay, it clicked. I imagined my own parents trying to keep track of shifting instructions, conflicting updates, and unfamiliar terminology. No one walked them through what questions to ask. No one helped translate the medical jargon into something they could act on. They just did their best with what they had.
            </p>

            <p>
              That's a big part of why AretaCare resonated with me. It isn't about replacing doctors or giving medical advice. It's about providing families with an extra layer of organization and understanding when everything feels overwhelming.
            </p>

            <p>
              From a technical standpoint, I've worked to build a platform that's both secure and easy to use. I wanted families to feel confident storing sensitive documents and conversations in one place. I also wanted the AI to be genuinely helpful: translating jargon, surfacing relevant details, helping people prepare questions they might not have known to ask.
            </p>

            <p>
              There's something deeply human about standing beside someone who's vulnerable and trying to make sense of what's happening. I've thought a lot about how technology can support that moment without getting in the way. The goal is to give families more clarity so they can focus on what really matters: being present with the person they love.
            </p>

            <p>
              I don't know if AretaCare could have changed anything for my grandmother or my parents all those years ago. But I do believe it can make a difference for families going through similar situations now. And if it helps even one person feel less lost, the sense that they don't have to carry the burden alone.
            </p>

            {/* Rob's Signature */}
            <div className="mt-8 flex justify-center">
              <img
                src={robSignature}
                alt="Rob Whiteman"
                className="h-24 w-auto invert-0 dark:invert dark:brightness-200"
              />
            </div>
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
                  AretaCare's core platform is free and will remain free. You shouldn't have to check your insurance coverage to get the help you need.
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
                  We can't promise that the internet is safe or that no one will ever attempt to break in. What we can promise is that we will never be the ones you have to worry about. We won't sell your personal data. We won't share it with hospitals or insurers. We won't hold it hostage. If you choose to delete your data, it's deleted. This is your information, and you stay in control of it.
                </p>
                <p>
                  To fund the platform, we may offer aggregate, population-level insights derived from patterns across many users. These insights contain no individual records and cannot be traced back to any specific person.
                </p>
                <p className="font-semibold text-gray-900 dark:text-white bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border-l-2 border-amber-500 dark:border-amber-400">
                  AretaCare will never sell your personal data or use it in ways that compromise your privacy.
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
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border-l-2 border-indigo-500 dark:border-indigo-400">
                  <p className="font-semibold text-gray-900 dark:text-white mb-3">
                    AretaCare is open source because transparency builds trust
                  </p>
                  <a
                    href="https://github.com/artificiallyhuman/aretacare"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-800 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    View GitHub Repo
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The FAQ Tab */}
      {activeTab === 'faq' && (
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">Frequently Asked Questions</h3>

          {/* GETTING STARTED */}

          {/* FAQ 1: What is AretaCare? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 1 ? null : 1)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">What is AretaCare?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 1 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 1 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2">
                AretaCare is a secure platform for patients and caregivers to organize medical information, understand complex concepts, and prepare for clearer conversations with care teams. It keeps notes, documents, audio recordings, and updates together in one place.
              </div>
            )}
          </div>

          {/* FAQ 2: How is this different than ChatGPT? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 2 ? null : 2)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">How is this different than ChatGPT?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 2 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 2 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2">
                AretaCare uses the same AI models, but it's built for a specific purpose. Instead of one-off chats, you get a dedicated place to organize your care information and collaborate with family or other caregivers. You also stay in control of your data, with the ability to add, edit, or delete anything at any time.
              </div>
            )}
          </div>

          {/* FAQ 3: What does it mean that AretaCare is in beta? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 3 ? null : 3)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">What does it mean that AretaCare is in beta?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 3 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 3 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2 space-y-3">
                <p>The beta is an early version of the platform. It's stable and secure, but still evolving. A few things to know:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Some features are still being refined</li>
                  <li>Occasional bugs or interruptions are possible</li>
                  <li>You should keep separate copies of important documents</li>
                  <li>Feedback helps shape what comes next</li>
                </ul>
                <p>The beta phase helps ensure the core experience works well before expanding further.</p>
              </div>
            )}
          </div>

          {/* FAQ 4: Why can I only have three owned sessions? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 4 ? null : 4)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">Why can I only have three owned sessions?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 4 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 4 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2">
                Sessions are meant to be temporary workspaces. Limiting owned sessions helps keep things manageable. Sessions where you're a collaborator don't count against this limit. You can delete old sessions to create room for new ones in Settings.
              </div>
            )}
          </div>

          {/* FAQ 5: What kind of information can I store in AretaCare? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 5 ? null : 5)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">What kind of information can I store in AretaCare?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 5 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 5 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2 space-y-3">
                <p>Anything that helps you manage care:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Notes and questions</li>
                  <li>Documents and images</li>
                  <li>Audio recordings</li>
                  <li>Journal entries</li>
                  <li>Appointment details</li>
                  <li>Symptoms, medications, and updates</li>
                </ul>
                <p>If it helps you stay organized, it fits.</p>
              </div>
            )}
          </div>

          {/* SECURITY & PRIVACY */}

          {/* FAQ 6: Is my data secure? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 6 ? null : 6)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">Is my data secure?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 6 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 6 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2">
                Yes. Your data is encrypted in transit and at rest. Files are stored in encrypted cloud storage, and accounts use hashed passwords, secure login tokens, and email verification.
              </div>
            )}
          </div>

          {/* FAQ 7: Who can see my information? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 7 ? null : 7)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">Who can see my information?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 7 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 7 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2">
                Only you and the people you invite to collaborate on a session. AretaCare never sells your personal data or shares it with hospitals, insurers, advertisers, or data brokers.
              </div>
            )}
          </div>

          {/* FAQ 8: Does AretaCare sell or share my data? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 8 ? null : 8)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">Does AretaCare sell or share my data?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 8 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 8 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2 space-y-3">
                <p>No. Your personal data is never sold or used for advertising. You stay in control of what you add and what you delete.</p>
                <p>To fund the platform, we may generate aggregate, population-level insights from patterns across many users, but these insights contain no individual records and cannot be traced back to any specific person.</p>
              </div>
            )}
          </div>

          {/* FAQ 9: Is AretaCare a HIPAA-covered service? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 9 ? null : 9)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">Is AretaCare a HIPAA-covered service?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 9 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 9 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2 space-y-3">
                <p>No. AretaCare is a consumer-facing tool, not a HIPAA-covered entity or business associate. It does not connect to hospitals, insurers, or electronic health record systems, and it does not receive information directly from healthcare providers.</p>
                <p>Even though HIPAA does not apply, AretaCare uses strong security and privacy practices like encrypted storage, secure authentication, and strict access controls.</p>
              </div>
            )}
          </div>

          {/* DATA MANAGEMENT */}

          {/* FAQ 10: Can I delete my data? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 10 ? null : 10)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">Can I delete my data?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 10 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 10 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2">
                Yes. You can delete documents, audio recordings, journal entries, sessions, or your entire account. When you delete something, it's removed from our database and from encrypted storage forever.
              </div>
            )}
          </div>

          {/* FAQ 11: Is my data backed up? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 11 ? null : 11)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">Is my data backed up?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 11 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 11 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2">
                Your data is stored securely, but because this is a beta, you should keep your own copies of essential documents.
              </div>
            )}
          </div>

          {/* USAGE & LIMITATIONS */}

          {/* FAQ 12: Does AretaCare give medical advice? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 12 ? null : 12)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">Does AretaCare give medical advice?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 12 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 12 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2">
                No. AretaCare helps you understand information and stay organized, but it doesn't diagnose conditions, recommend treatments, or serve as medical advice.
              </div>
            )}
          </div>

          {/* FAQ 13: Can doctors use AretaCare with me? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 13 ? null : 13)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">Can doctors use AretaCare with me?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 13 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 13 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2">
                Not right now. AretaCare is designed for personal use by patients and caregivers. It isn't part of clinical workflows and shouldn't replace any official medical systems.
              </div>
            )}
          </div>

          {/* PLATFORM DETAILS */}

          {/* FAQ 14: Why is AretaCare free? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 14 ? null : 14)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">Why is AretaCare free?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 14 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 14 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2">
                The goal is to make the platform accessible to anyone who needs help managing care. Optional ways to support AretaCare may be added later, but the core platform will remain free to use.
              </div>
            )}
          </div>

          {/* FAQ 15: Is AretaCare open source? */}
          <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-lg border-l-4 border-blue-500 dark:border-blue-400 shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => setExpandedFaq(expandedFaq === 15 ? null : 15)}
              className="w-full px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white">Is AretaCare open source?</span>
              <svg
                className={`w-5 h-5 text-blue-500 dark:text-blue-400 transition-transform ${expandedFaq === 15 ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === 15 && (
              <div className="px-6 pt-5 pb-6 text-gray-600 dark:text-gray-400 leading-relaxed border-t border-blue-200 dark:border-blue-800 mt-2">
                Yes. Anyone can review how the platform works, suggest improvements, or verify how data is handled in our public <a href="https://github.com/artificiallyhuman/aretacare" target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline font-medium">GitHub repository</a>.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default About;
