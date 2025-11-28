import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function PasswordReset() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  // Step 1: Request reset
  const [email, setEmail] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestError, setRequestError] = useState('');

  // Step 2: Reset password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-12 h-12 bg-primary-600 rounded-lg">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AretaCare</h1>
              <p className="text-xs text-gray-500">AI Care Advocate</p>
            </div>
          </div>
        </div>

        <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">
          {token ? 'Reset Your Password' : 'Forgot Your Password?'}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {token
            ? 'Enter your new password below'
            : 'Enter your email and we\'ll send you a reset link'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {!token ? (
            // Step 1: Request password reset
            <>
              {requestSuccess ? (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
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
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                      {requestError}
                    </div>
                  )}

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
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
                  <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                    <p className="font-medium">Password reset successful!</p>
                    <p className="text-sm mt-1">Redirecting to login...</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-6">
                  {resetError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                      {resetError}
                    </div>
                  )}

                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                      New Password
                    </label>
                    <input
                      type="password"
                      id="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      className="mt-1 input"
                      placeholder="At least 8 characters"
                    />
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      className="mt-1 input"
                      placeholder="Re-enter your password"
                    />
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
