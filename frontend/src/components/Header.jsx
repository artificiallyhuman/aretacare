import React from 'react';
import { Link } from 'react-router-dom';

const Header = ({ onClearSession }) => {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <Link to="/" className="flex items-center">
            <h1 className="text-2xl font-bold text-primary-600">AretaCare</h1>
            <span className="ml-2 text-sm text-gray-600">Your Family's AI Care Advocate</span>
          </Link>

          <nav className="flex items-center space-x-6">
            <Link to="/" className="text-gray-700 hover:text-primary-600 transition-colors">
              Home
            </Link>
            <Link to="/summary" className="text-gray-700 hover:text-primary-600 transition-colors">
              Medical Summary
            </Link>
            <Link to="/jargon" className="text-gray-700 hover:text-primary-600 transition-colors">
              Jargon Translator
            </Link>
            <Link to="/coach" className="text-gray-700 hover:text-primary-600 transition-colors">
              Conversation Coach
            </Link>
            <Link to="/chat" className="text-gray-700 hover:text-primary-600 transition-colors">
              Chat
            </Link>
            <button
              onClick={onClearSession}
              className="text-sm text-gray-600 hover:text-red-600 transition-colors"
            >
              Clear Session
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
