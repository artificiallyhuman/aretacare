import { useState } from 'react';
import { Link } from 'react-router-dom';
import { waitlistAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import logo from '../logos/large_logo.png';
import jasonSignature from '../logos/jason_signature.png';
import robSignature from '../logos/rob_signature.png';

function Waitlist() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadyOnList, setAlreadyOnList] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { isDark, toggleTheme } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await waitlistAPI.join(email);
      setSuccess(true);
      setMessage(response.data.message);
      setAlreadyOnList(response.data.already_on_list || false);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to join waitlist. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      {/* Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 p-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 transition-colors z-50"
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

      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        {/* Logo and Title */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-4">
            <img src={logo} alt="AretaCare Logo" className="w-16 h-16 object-contain" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                AretaCare<span className="font-normal text-xl align-super">™</span>
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 tracking-wide">Care | Clarity | Confidence</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 py-8 px-6 shadow-md sm:rounded-xl sm:px-10 border border-gray-200 dark:border-gray-700">
          {success ? (
            <div className="text-center">
              {alreadyOnList ? (
                <>
                  <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-6">
                    <svg className="h-8 w-8 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Already on the List</h2>
                </>
              ) : (
                <>
                  <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-6">
                    <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">You're on the List</h2>
                </>
              )}
              <p className="text-gray-600 dark:text-gray-400 mb-6">{message}</p>
              <Link
                to="/login"
                className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                Return to Login
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-4">
                Join the Waitlist
              </h2>

              <div className="mb-6 space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  AretaCare began as a platform for friends and family, and we've been inspired by the early interest it's received. To ensure we grow in a thoughtful and sustainable way, we're inviting new users in phases.
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Please submit your email address, and we'll reach out with an invitation as space becomes available.
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Your interest means a great deal to us and helps guide our investment in the platform. Thank you for your patience.
                </p>
                <div className="flex items-center justify-center gap-8 pt-2">
                  <div className="text-center">
                    <img src={jasonSignature} alt="Jason" className="h-12 dark:invert dark:brightness-200" />
                  </div>
                  <div className="text-center">
                    <img src={robSignature} alt="Rob" className="h-12 dark:invert dark:brightness-200" />
                  </div>
                </div>
              </div>

              {error && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="your@email.com"
                    disabled={loading}
                    className="appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-semibold text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Joining...
                    </span>
                  ) : (
                    'Join Waitlist'
                  )}
                </button>
              </form>

              <div className="mt-6 text-center space-y-2">
                <Link
                  to="/login"
                  className="block text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Already have an account? Log in
                </Link>
                <Link
                  to="/about"
                  className="block text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Learn more about AretaCare
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Waitlist;
