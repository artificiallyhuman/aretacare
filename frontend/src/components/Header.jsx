import React from 'react';
import { Link } from 'react-router-dom';

const Header = ({ onClearSession, onLogout, user }) => {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 bg-primary-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">AretaCare</h1>
              <p className="text-xs text-gray-500">AI Care Advocate</p>
            </div>
          </Link>

          <nav className="flex items-center space-x-1">
            <Link to="/" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors">
              Home
            </Link>
            <Link to="/summary" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors">
              Summary
            </Link>
            <Link to="/jargon" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors">
              Translator
            </Link>
            <Link to="/coach" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors">
              Coach
            </Link>
            <Link to="/chat" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors">
              Chat
            </Link>

            <div className="ml-4 pl-4 border-l border-gray-200 flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-700">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-medium text-gray-700">{user?.name?.split(' ')[0]}</span>
              </div>

              <button
                onClick={onClearSession}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Clear Session"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>

              <button
                onClick={onLogout}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                Logout
              </button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
