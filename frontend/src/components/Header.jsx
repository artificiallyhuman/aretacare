import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSessionContext } from '../contexts/SessionContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAdmin } from '../contexts/AdminContext';

const Header = ({ onLogout, user }) => {
  const navigate = useNavigate();
  const { sessions, activeSession, switchSession, createSession } = useSessionContext();
  const { isDark, toggleTheme } = useTheme();
  const { isAdmin } = useAdmin();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const toolsDropdownRef = useRef(null);
  const userDropdownRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(event.target)) {
        setToolsDropdownOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setUserDropdownOpen(false);
      }
    };

    if (toolsDropdownOpen || userDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [toolsDropdownOpen, userDropdownOpen]);

  const handleNewSession = async () => {
    setCreatingSession(true);
    try {
      await createSession();
      setUserDropdownOpen(false);
      setMobileSessionsOpen(false);
      setMobileMenuOpen(false);
      navigate('/');
    } catch (error) {
      alert(error.message || 'Failed to create session');
    } finally {
      setCreatingSession(false);
    }
  };

  const handleSwitchSession = async (sessionId) => {
    await switchSession(sessionId);
    setUserDropdownOpen(false);
    setMobileSessionsOpen(false);
    setMobileMenuOpen(false);
    navigate('/');
  };

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
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
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">AretaCare</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">AI Care Advocate</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1">
            <Link to="/" className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors">
              Conversation
            </Link>
            <Link to="/journal" className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors">
              Journal
            </Link>
            <Link to="/daily-plan" className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors">
              Daily Plan
            </Link>

            {/* Tools Dropdown */}
            <div className="relative" ref={toolsDropdownRef}>
              <button
                onClick={() => setToolsDropdownOpen(!toolsDropdownOpen)}
                className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors flex items-center space-x-1"
              >
                <span>Tools</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {toolsDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
                  <Link
                    to="/tools/jargon"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-primary-600 dark:hover:text-primary-400"
                    onClick={() => setToolsDropdownOpen(false)}
                  >
                    Jargon Translator
                  </Link>
                  <Link
                    to="/tools/coach"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-primary-600 dark:hover:text-primary-400"
                    onClick={() => setToolsDropdownOpen(false)}
                  >
                    Conversation Coach
                  </Link>
                  <Link
                    to="/tools/documents"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-primary-600 dark:hover:text-primary-400"
                    onClick={() => setToolsDropdownOpen(false)}
                  >
                    Documents Manager
                  </Link>
                  <Link
                    to="/audio-recordings"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-primary-600 dark:hover:text-primary-400"
                    onClick={() => setToolsDropdownOpen(false)}
                  >
                    Audio Recordings
                  </Link>
                </div>
              )}
            </div>

            <div className="ml-4 pl-4 border-l border-gray-200 dark:border-gray-700 flex items-center space-x-3">
              <Link to="/about" className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors">
                About
              </Link>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                aria-label="Toggle theme"
              >
                {isDark ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {/* User/Session Dropdown */}
              <div className="relative" ref={userDropdownRef}>
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center space-x-2 pl-2 px-3 py-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{user?.name?.split(' ')[0]}</span>
                    {activeSession && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{activeSession.name}</span>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {userDropdownOpen && (
                  <div className="absolute top-full right-0 mt-1 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
                    {/* Sessions Section */}
                    <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Sessions</p>
                    </div>

                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        onClick={() => handleSwitchSession(session.id)}
                        className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                          session.id === activeSession?.id
                            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span className="truncate">{session.name}</span>
                        {session.id === activeSession?.id && (
                          <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}

                    <button
                      onClick={handleNewSession}
                      disabled={creatingSession}
                      className="w-full text-left px-4 py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>{creatingSession ? 'Creating...' : 'New Session'}</span>
                    </button>

                    <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
                      {isAdmin && (
                        <Link
                          to="/admin"
                          className="block px-4 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 font-medium"
                          onClick={() => setUserDropdownOpen(false)}
                        >
                          Admin Console
                        </Link>
                      )}
                      <Link
                        to="/settings"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                        onClick={() => setUserDropdownOpen(false)}
                      >
                        Settings
                      </Link>
                      <button
                        onClick={() => {
                          onLogout();
                          setUserDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </nav>

          {/* Mobile menu button and user info */}
          <div className="flex lg:hidden items-center space-x-2">
            {/* Theme Toggle for Mobile */}
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            <div className="w-7 h-7 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-primary-700 dark:text-primary-300">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
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
          <div className="lg:hidden border-t border-gray-200 dark:border-gray-700">
            {/* Main Navigation Section */}
            <div className="py-2 bg-white dark:bg-gray-800">
              <div className="px-3 py-1.5">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Navigation</p>
              </div>
              <div className="flex flex-col space-y-0.5">
                <Link
                  to="/"
                  className="px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Conversation
                </Link>
                <Link
                  to="/journal"
                  className="px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Journal
                </Link>
                <Link
                  to="/daily-plan"
                  className="px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Daily Plan
                </Link>
              </div>
            </div>

            {/* Tools Section */}
            <div className="py-2 bg-white dark:bg-gray-800 border-t border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setMobileToolsOpen(!mobileToolsOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span>Tools</span>
                <svg
                  className={`w-4 h-4 transition-transform ${mobileToolsOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {mobileToolsOpen && (
                <div className="flex flex-col space-y-0.5 mt-1 bg-white dark:bg-gray-800 border-l-2 border-primary-200 dark:border-primary-700 ml-3">
                  <Link
                    to="/tools/jargon"
                    className="block pl-6 pr-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Jargon Translator
                  </Link>
                  <Link
                    to="/tools/coach"
                    className="block pl-6 pr-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Conversation Coach
                  </Link>
                  <Link
                    to="/tools/documents"
                    className="block pl-6 pr-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Documents Manager
                  </Link>
                  <Link
                    to="/audio-recordings"
                    className="block pl-6 pr-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Audio Recordings
                  </Link>
                </div>
              )}
            </div>

            {/* Account Section */}
            <div className="py-2 bg-gray-50 dark:bg-gray-700 border-t border-b border-gray-200 dark:border-gray-600">
              {/* User Info - Clickable to expand sessions */}
              <button
                onClick={() => setMobileSessionsOpen(!mobileSessionsOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{user?.name}</span>
                    {activeSession && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{activeSession.name}</span>
                    )}
                  </div>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${mobileSessionsOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Sessions Dropdown */}
              {mobileSessionsOpen && (
                <div className="bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 py-2">
                  <div className="px-3 py-1.5">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sessions</p>
                  </div>

                  <div className="flex flex-col space-y-0.5">
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        onClick={() => handleSwitchSession(session.id)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                          session.id === activeSession?.id
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-600 hover:text-primary-600 dark:hover:text-primary-400'
                        }`}
                      >
                        <span className="truncate">{session.name}</span>
                        {session.id === activeSession?.id && (
                          <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}

                    <button
                      onClick={handleNewSession}
                      disabled={creatingSession}
                      className="w-full text-left px-3 py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-white dark:hover:bg-gray-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>{creatingSession ? 'Creating...' : 'New Session'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* About & Settings Links */}
            <div className="py-2 bg-white dark:bg-gray-800">
              <div className="flex flex-col space-y-0.5">
                <Link
                  to="/about"
                  className="block px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  About
                </Link>

                {isAdmin && (
                  <Link
                    to="/admin"
                    className="block px-3 py-2.5 text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Admin Console
                  </Link>
                )}

                <Link
                  to="/settings"
                  className="block px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Settings
                </Link>
              </div>
            </div>

            {/* Logout Section */}
            <div className="py-2 bg-gray-50 dark:bg-gray-700 border-t border-gray-300 dark:border-gray-600">
              <button
                onClick={() => {
                  onLogout();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
