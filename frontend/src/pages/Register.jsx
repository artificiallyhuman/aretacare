import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import WarningsContainer from '../components/WarningsContainer';

function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acknowledgeNotMedicalAdvice, setAcknowledgeNotMedicalAdvice] = useState(false);
  const [acknowledgeBetaVersion, setAcknowledgeBetaVersion] = useState(false);
  const [acknowledgeEmailCommunications, setAcknowledgeEmailCommunications] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const warnings = [
    {
      title: 'Important',
      message: 'AretaCare is an AI assistant, not a medical professional. For any medical decisions, please consult your healthcare team.'
    },
    {
      title: 'Beta Version',
      message: 'This system is currently in beta and may be unstable. Users may experience data loss from time to time. Please do not rely on this system for critical medical information storage.'
    }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password length
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    // Validate acknowledgements
    if (!acknowledgeNotMedicalAdvice) {
      setError('You must acknowledge that AretaCare is not medical advice');
      return;
    }

    if (!acknowledgeBetaVersion) {
      setError('You must acknowledge the beta version status and potential data loss');
      return;
    }

    if (!acknowledgeEmailCommunications) {
      setError('You must acknowledge that you will receive email communications');
      return;
    }

    setLoading(true);

    try {
      const response = await authAPI.register(
        name,
        email,
        password,
        acknowledgeNotMedicalAdvice,
        acknowledgeBetaVersion,
        acknowledgeEmailCommunications
      );
      const { access_token, user } = response.data;

      // Store auth token and user info
      localStorage.setItem('auth_token', access_token);
      localStorage.setItem('user', JSON.stringify(user));

      // Reload to home page to reinitialize session
      window.location.href = '/';
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      {/* Warnings Container - First thing user sees */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 mb-6">
        <WarningsContainer warnings={warnings} />
      </div>

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

        <h2 className="mt-6 text-center text-2xl sm:text-3xl font-bold text-gray-900">
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Join AretaCare to get started
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-6 px-4 shadow-md sm:rounded-xl sm:px-10 border border-gray-200">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Enter your full name"
                disabled={loading}
                className="input"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
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
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="8-72 characters"
                disabled={loading}
                minLength={8}
                maxLength={72}
                className="input"
              />
              <p className="mt-1 text-xs text-gray-500">Must be 8-72 characters long</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter your password"
                disabled={loading}
                minLength={8}
                maxLength={72}
                className="input"
              />
            </div>

            {/* Acknowledgement Checkboxes */}
            <div className="space-y-3 pt-2 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-3">
                Please acknowledge the following:
              </p>

              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="acknowledgeNotMedicalAdvice"
                  checked={acknowledgeNotMedicalAdvice}
                  onChange={(e) => setAcknowledgeNotMedicalAdvice(e.target.checked)}
                  disabled={loading}
                  className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded cursor-pointer"
                  required
                />
                <label htmlFor="acknowledgeNotMedicalAdvice" className="ml-3 text-sm text-gray-700 cursor-pointer">
                  I understand that AretaCare is an AI assistant, not a medical professional, and I should consult my healthcare team for any medical decisions.
                </label>
              </div>

              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="acknowledgeBetaVersion"
                  checked={acknowledgeBetaVersion}
                  onChange={(e) => setAcknowledgeBetaVersion(e.target.checked)}
                  disabled={loading}
                  className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded cursor-pointer"
                  required
                />
                <label htmlFor="acknowledgeBetaVersion" className="ml-3 text-sm text-gray-700 cursor-pointer">
                  I understand this system is in beta and may be unstable. I acknowledge there may be data loss from time to time, and I will not rely on this system for critical medical information storage.
                </label>
              </div>

              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="acknowledgeEmailCommunications"
                  checked={acknowledgeEmailCommunications}
                  onChange={(e) => setAcknowledgeEmailCommunications(e.target.checked)}
                  disabled={loading}
                  className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded cursor-pointer"
                  required
                />
                <label htmlFor="acknowledgeEmailCommunications" className="ml-3 text-sm text-gray-700 cursor-pointer">
                  I understand I will receive email communications from AretaCare, including notifications about password changes, account updates, and session sharing activities.
                </label>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 font-semibold"
              >
                {loading ? 'Creating account...' : 'Create account'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Already have an account?</span>
              </div>
            </div>

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                Sign in to your account
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Legal Links */}
      <div className="mt-4 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 text-center">
        <div className="flex justify-center gap-4 text-xs text-gray-500">
          <Link to="/terms" className="hover:text-gray-700 underline">
            Terms of Service
          </Link>
          <span>•</span>
          <Link to="/privacy" className="hover:text-gray-700 underline">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Register;
