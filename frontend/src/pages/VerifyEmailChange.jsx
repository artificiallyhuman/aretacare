import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useSessionContext } from '../contexts/SessionContext';
import SEO from '../components/SEO';
import logo from '../logos/large_logo.png';

export default function VerifyEmailChange() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, setUser } = useSessionContext();

  // Store token in state and clear from URL for security
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken) {
      // Store token in state
      setToken(urlToken);
      // Remove token from URL without adding to history (security best practice)
      window.history.replaceState({}, document.title, '/verify-email-change');
    } else {
      setLoading(false);
      setError('No verification token provided');
    }
  }, [searchParams]);

  useEffect(() => {
    if (token) {
      verifyEmail();
    }
  }, [token]);

  const verifyEmail = async () => {
    try {
      const response = await authAPI.verifyEmailChange(token);
      setSuccess(true);
      setNewEmail(response.data.email);

      // Log out user after email change for security
      if (response.data.logout) {
        setTimeout(async () => {
          await authAPI.logout();
          navigate('/login');
        }, 3000);
      } else {
        // Fallback redirect
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to verify email change');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <SEO title="Verify Email Change" path="/verify-email-change" noindex />
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
          Email Verification
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {loading ? (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Verifying your email address...</p>
            </div>
          ) : success ? (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 px-4 py-3 rounded-lg">
                <p className="font-medium">Email verified successfully!</p>
                <p className="text-sm mt-1">
                  Your email address has been changed to <strong>{newEmail}</strong>.
                </p>
                <p className="text-sm mt-2">Redirecting to login...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                <p className="font-medium">Verification Failed</p>
                <p className="text-sm mt-1">{error}</p>
              </div>

              <div className="text-center">
                <Link
                  to="/login"
                  className="text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  Back to Login
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
