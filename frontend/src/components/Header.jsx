import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const Header = ({ onClearSession, onLogout, user }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setToolsDropdownOpen(false);
      }
    };

    if (toolsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [toolsDropdownOpen]);

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2 sm:space-x-3">
            <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-primary-600 rounded-lg">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">AretaCare</h1>
              <p className="text-xs text-gray-500 hidden sm:block">AI Care Advocate</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1">
            <Link to="/" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors">
              Conversation
            </Link>
            <Link to="/journal" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors">
              Journal
            </Link>

            {/* Tools Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setToolsDropdownOpen(!toolsDropdownOpen)}
                className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors flex items-center space-x-1"
              >
                <span>Tools</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {toolsDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-10">
                  <Link
                    to="/tools/jargon"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-primary-600"
                    onClick={() => setToolsDropdownOpen(false)}
                  >
                    Jargon Translator
                  </Link>
                  <Link
                    to="/tools/coach"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-primary-600"
                    onClick={() => setToolsDropdownOpen(false)}
                  >
                    Conversation Coach
                  </Link>
                  <Link
                    to="/tools/documents"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-primary-600"
                    onClick={() => setToolsDropdownOpen(false)}
                  >
                    Documents
                  </Link>
                </div>
              )}
            </div>

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
                title="Start Fresh Session (clears all conversations and journal entries)"
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

          {/* Mobile menu button and user info */}
          <div className="flex lg:hidden items-center space-x-2">
            <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-primary-700">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-700 hover:text-primary-600 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 py-3">
            <div className="flex flex-col space-y-1">
              <Link
                to="/"
                className="px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Conversation
              </Link>
              <Link
                to="/journal"
                className="px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Journal
              </Link>

              {/* Tools Section */}
              <div className="border-t border-gray-200 pt-2 mt-2">
                <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Tools
                </p>
                <div className="flex flex-col space-y-1 mt-1">
                  <Link
                    to="/tools/jargon"
                    className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Jargon Translator
                  </Link>
                  <Link
                    to="/tools/coach"
                    className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Conversation Coach
                  </Link>
                  <Link
                    to="/tools/documents"
                    className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-md transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Documents
                  </Link>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-3 mt-3 space-y-2">
                <div className="px-3 py-2 flex items-center space-x-2">
                  <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-primary-700">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-base font-medium text-gray-700">{user?.name}</span>
                </div>

                <button
                  onClick={() => {
                    onClearSession();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors flex items-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Start Fresh Session</span>
                </button>

                <button
                  onClick={() => {
                    onLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-base font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
