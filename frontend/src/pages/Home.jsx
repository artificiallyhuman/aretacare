import React from 'react';
import { Link } from 'react-router-dom';
import Disclaimer from '../components/Disclaimer';

const Home = () => {
  const features = [
    {
      title: 'Medical Summary Generator',
      description: 'Upload medical notes or paste text to get a clear, structured summary with key findings and recommended questions.',
      icon: '📋',
      link: '/summary',
    },
    {
      title: 'Jargon Translator',
      description: 'Translate complex medical terminology into simple, understandable language.',
      icon: '🔍',
      link: '/jargon',
    },
    {
      title: 'Conversation Coach',
      description: 'Prepare for healthcare appointments with suggested questions and conversation tips.',
      icon: '💬',
      link: '/coach',
    },
    {
      title: 'Care Assistant Chat',
      description: 'Have a conversation with AretaCare about medical information and care navigation.',
      icon: '🤝',
      link: '/chat',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to AretaCare
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Your AI care advocate, helping families navigate complex medical information
          with clarity, compassion, and confidence.
        </p>
      </div>

      <Disclaimer />

      <div className="grid md:grid-cols-2 gap-6 mt-12">
        {features.map((feature, index) => (
          <Link
            key={index}
            to={feature.link}
            className="card hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start">
              <div className="text-4xl mr-4">{feature.icon}</div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12 card bg-primary-50 border border-primary-200">
        <h2 className="text-2xl font-semibold text-primary-900 mb-4">
          How AretaCare Helps You
        </h2>
        <ul className="space-y-3 text-primary-800">
          <li className="flex items-start">
            <span className="mr-2">✓</span>
            <span>Organizes medical updates and clinical notes into clear summaries</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">✓</span>
            <span>Translates medical terminology into understandable language</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">✓</span>
            <span>Suggests meaningful questions to ask your healthcare team</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">✓</span>
            <span>Provides calm, professional support during stressful times</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">✓</span>
            <span>Respects medical professionals and maintains safe boundaries</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Home;
