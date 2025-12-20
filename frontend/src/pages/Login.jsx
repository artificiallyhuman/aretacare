import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import logo from '../logos/large_logo.png';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [idleLogout, setIdleLogout] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isDark, toggleTheme } = useTheme();

  // Check for URL parameters
  useEffect(() => {
    if (searchParams.get('idle') === 'true') {
      setIdleLogout(true);
      window.history.replaceState({}, '', '/login');
    }
    if (searchParams.get('verified') === 'true') {
      setEmailVerified(true);
      window.history.replaceState({}, '', '/login');
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setEmailNotVerified(false);
    setResendSuccess(false);
    setLoading(true);

    try {
      const response = await authAPI.login(email, password);
      const { access_token } = response.data;

      // Store access token (short-lived, 1 hour)
      // Note: refresh_token is handled via HttpOnly cookie for security (set by server)
      localStorage.setItem('auth_token', access_token);

      // Reload to home page to reinitialize session
      window.location.href = '/';
    } catch (err) {
      const detail = err.response?.data?.detail;

      // Check for EMAIL_NOT_VERIFIED error code
      if (typeof detail === 'object' && detail?.code === 'EMAIL_NOT_VERIFIED') {
        setEmailNotVerified(true);
        setUnverifiedEmail(detail.email || email);
        setError('');
      } else if (typeof detail === 'object' && detail?.message) {
        setError(detail.message);
      } else {
        setError(detail || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendingVerification(true);
    setResendSuccess(false);

    try {
      await authAPI.resendVerification(unverifiedEmail);
      setResendSuccess(true);
    } catch (err) {
      // Don't show error - the endpoint always returns success message for security
      setResendSuccess(true);
    } finally {
      setResendingVerification(false);
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

      {/* Important Notice - First thing user sees */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 mb-6">
        <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-600 p-4 rounded-r-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-xs font-semibold text-amber-800 dark:text-amber-400 mb-1.5">Important</h3>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                AretaCare is an AI assistant, not a medical professional. Consult your care team for any medical decisions. This service is not HIPAA-covered and is intended for personal use. Do not rely on AretaCare as your primary source of medical information.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="flex items-center space-x-4">
            <img
              src={logo}
              alt="AretaCare Logo"
              className="w-16 h-16 object-contain"
            />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">AretaCare<span className="font-normal">™</span></h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Care | Clarity | Confidence</p>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400 text-balance">
          A platform for patients and caregivers navigating the healthcare system.{' '}
          <Link
            to="/about"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors"
          >
            Learn more →
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-800 py-6 px-4 shadow-md sm:rounded-xl sm:px-10 border border-gray-200 dark:border-gray-700 transition-colors duration-200">
          {emailVerified && (
            <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg text-sm flex items-start">
              <svg className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Your email has been verified. You can now sign in to AretaCare.</span>
            </div>
          )}
          {idleLogout && (
            <div className="mb-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-lg text-sm flex items-start">
              <svg className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>You were logged out due to inactivity. Please sign in again.</span>
            </div>
          )}
          {emailNotVerified && (
            <div className="mb-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-4 py-4 rounded-lg">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Email not verified
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    Please check your email and click the verification link to complete registration.
                  </p>
                  {resendSuccess ? (
                    <p className="text-sm text-green-700 dark:text-green-400 mt-2">
                      Verification email sent! Check your inbox.
                    </p>
                  ) : (
                    <button
                      onClick={handleResendVerification}
                      disabled={resendingVerification}
                      className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 underline disabled:opacity-50"
                    >
                      {resendingVerification ? 'Sending...' : 'Resend verification email'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
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
                className="input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Password
                </label>
                <Link
                  to="/password-reset"
                  className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                disabled={loading}
                minLength={8}
                className="input"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 font-semibold"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">New to AretaCare?</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {/* Create account link */}
              <Link
                to="/register"
                className="block w-full text-center px-4 py-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors"
              >
                Create a free account
              </Link>

            </div>
          </div>
        </div>
      </div>

      {/* Legal Links */}
      <div className="mt-4 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 text-center">
        <div className="flex justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <Link to="/terms" className="hover:text-gray-700 dark:hover:text-gray-300 underline">
            Terms of Service
          </Link>
          <span>•</span>
          <Link to="/privacy" className="hover:text-gray-700 dark:hover:text-gray-300 underline">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
