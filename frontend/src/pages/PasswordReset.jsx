import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';
import logo from '../logos/large_logo.png';

export default function PasswordReset() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Store token in state and clear from URL for security
  // This prevents the token from being exposed in browser history, referrer headers, and logs
  const [token, setToken] = useState(null);

  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken) {
      // Store token in state
      setToken(urlToken);
      // Remove token from URL without adding to history (security best practice)
      // This prevents the token from appearing in browser history or being leaked via referrer
      window.history.replaceState({}, document.title, '/password-reset');
    }
  }, [searchParams]);

  // Step 1: Request reset
  const [email, setEmail] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestError, setRequestError] = useState('');

  // Step 2: Reset password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState('');

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setRequestError('');
    setRequestLoading(true);

    try {
      await authAPI.requestPasswordReset(email);
      setRequestSuccess(true);
    } catch (error) {
      setRequestError(error.response?.data?.detail || 'Failed to send reset email');
    } finally {
      setRequestLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setResetError('Password must be at least 8 characters');
      return;
    }

    setResetLoading(true);

    try {
      await authAPI.resetPassword(token, newPassword);
      setResetSuccess(true);

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (error) {
      setResetError(error.response?.data?.detail || 'Failed to reset password');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="flex items-center space-x-3">
            <img
              src={logo}
              alt="AretaCare Logo"
              className="w-12 h-12 object-contain"
            />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AretaCare<span className="font-normal">™</span></h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Calm | Clarity | Confidence</p>
            </div>
          </div>
        </div>

        <h2 className="mt-6 text-center text-2xl font-bold text-gray-900 dark:text-white">
          {token ? 'Reset Your Password' : 'Forgot Your Password?'}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          {token
            ? 'Enter your new password below'
            : 'Enter your email and we\'ll send you a reset link'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {!token ? (
            // Step 1: Request password reset
            <>
              {requestSuccess ? (
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 px-4 py-3 rounded-lg">
                    <p className="font-medium">Check your email!</p>
                    <p className="text-sm mt-1">
                      If an account exists with this email, we've sent password reset instructions.
                    </p>
                  </div>

                  <div className="text-center">
                    <Link
                      to="/login"
                      className="text-sm font-medium text-primary-600 hover:text-primary-700"
                    >
                      Back to login
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRequestReset} className="space-y-6">
                  {requestError && (
                    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                      {requestError}
                    </div>
                  )}

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Email address
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="mt-1 input"
                      placeholder="your@email.com"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={requestLoading}
                    className="w-full btn-primary"
                  >
                    {requestLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>

                  <div className="text-center">
                    <Link
                      to="/login"
                      className="text-sm font-medium text-primary-600 hover:text-primary-700"
                    >
                      Back to login
                    </Link>
                  </div>
                </form>
              )}
            </>
          ) : (
            // Step 2: Reset password with token
            <>
              {resetSuccess ? (
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 px-4 py-3 rounded-lg">
                    <p className="font-medium">Password reset successful.</p>
                    <p className="text-sm mt-1">Redirecting to login...</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-6">
                  {resetError && (
                    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                      {resetError}
                    </div>
                  )}

                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      New Password
                    </label>
                    <div className="relative mt-1">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        id="newPassword"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        className="input pr-10"
                        placeholder="At least 8 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        tabIndex={-1}
                      >
                        {showNewPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Confirm New Password
                    </label>
                    <div className="relative mt-1">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        id="confirmPassword"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                        className="input pr-10"
                        placeholder="Re-enter your password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full btn-primary"
                  >
                    {resetLoading ? 'Resetting...' : 'Reset Password'}
                  </button>

                  <div className="text-center">
                    <Link
                      to="/login"
                      className="text-sm font-medium text-primary-600 hover:text-primary-700"
                    >
                      Back to login
                    </Link>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
