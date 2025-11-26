import React from 'react';
import { Link } from 'react-router-dom';
import Disclaimer from '../components/Disclaimer';

const Home = () => {
  const features = [
    {
      title: 'Medical Summary Generator',
      description: 'Upload medical notes or paste text to get a clear, structured summary with key findings and recommended questions.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      link: '/summary',
      color: 'bg-blue-100 text-blue-600',
    },
    {
      title: 'Jargon Translator',
      description: 'Translate complex medical terminology into simple, understandable language.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      link: '/jargon',
      color: 'bg-green-100 text-green-600',
    },
    {
      title: 'Conversation Coach',
      description: 'Prepare for healthcare appointments with suggested questions and conversation tips.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
      link: '/coach',
      color: 'bg-purple-100 text-purple-600',
    },
    {
      title: 'Care Assistant Chat',
      description: 'Have a conversation with AretaCare about medical information and care navigation.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
        </svg>
      ),
      link: '/chat',
      color: 'bg-amber-100 text-amber-600',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Welcome to AretaCare
        </h1>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          Your AI care advocate, helping families navigate complex medical information
          with clarity, compassion, and confidence.
        </p>
      </div>

      <Disclaimer />

      <div className="grid md:grid-cols-2 gap-6 mt-10">
        {features.map((feature, index) => (
          <Link
            key={index}
            to={feature.link}
            className="group bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 p-6 transition-all duration-200 hover:border-primary-300"
          >
            <div className="flex items-start space-x-4">
              <div className={`flex-shrink-0 w-14 h-14 ${feature.color} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                {feature.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-primary-600 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12 bg-gradient-to-br from-primary-50 to-blue-50 rounded-xl border border-primary-100 p-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">
          How AretaCare Helps You
        </h2>
        <ul className="grid md:grid-cols-2 gap-4">
          <li className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-gray-700">Organizes medical updates and clinical notes into clear summaries</span>
          </li>
          <li className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-gray-700">Translates medical terminology into understandable language</span>
          </li>
          <li className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-gray-700">Suggests meaningful questions to ask your healthcare team</span>
          </li>
          <li className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-gray-700">Provides calm, professional support during stressful times</span>
          </li>
          <li className="flex items-start space-x-3 md:col-span-2">
            <svg className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-gray-700">Respects medical professionals and maintains safe boundaries</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Home;
