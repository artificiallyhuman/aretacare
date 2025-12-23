import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { authAPI, waitlistAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import logo from '../logos/large_logo.png';

function Register() {
  const { isDark, toggleTheme } = useTheme();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acknowledgeNotMedicalAdvice, setAcknowledgeNotMedicalAdvice] = useState(false);
  const [acknowledgeHIPAA, setAcknowledgeHIPAA] = useState(false);
  const [acknowledgeEmailCommunications, setAcknowledgeEmailCommunications] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const navigate = useNavigate();

  // Check for invitation parameters in URL
  const invitationEmail = searchParams.get('email');
  const invitationToken = searchParams.get('token');
  const isInvitation = !!(invitationEmail && invitationToken);

  // Pre-populate email from invitation
  useEffect(() => {
    if (invitationEmail) {
      setEmail(invitationEmail);
    }
  }, [invitationEmail]);

  // Check signup mode and redirect to waitlist if controlled and no invitation
  useEffect(() => {
    const checkAccess = async () => {
      // If we have an invitation token, allow registration
      if (invitationToken) return;

      try {
        const response = await waitlistAPI.getSignupMode();
        if (response.data.control_signups) {
          // Redirect to waitlist if signups are controlled and no token
          navigate('/waitlist');
        }
      } catch (err) {
        // If API fails, allow registration (fail open)
      }
    };
    checkAccess();
  }, [invitationToken, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate email matches invitation email
    if (isInvitation && email !== invitationEmail) {
      setError(`You must use the email address from your invitation (${invitationEmail}). You can change it after creating your account in Settings.`);
      return;
    }

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
      setError('You must acknowledge that AretaCare is an AI assistant, not a medical professional');
      return;
    }

    if (!acknowledgeHIPAA) {
      setError('You must acknowledge the HIPAA limitations and data source restrictions');
      return;
    }

    if (!acknowledgeEmailCommunications) {
      setError('You must acknowledge that you will receive email communications');
      return;
    }

    if (!agreeToTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy');
      return;
    }

    setLoading(true);

    try {
      const response = await authAPI.register(
        name,
        email,
        password,
        acknowledgeNotMedicalAdvice,
        acknowledgeHIPAA,
        acknowledgeEmailCommunications,
        agreeToTerms,
        invitationToken
      );

      // Registration successful - show verification message
      setRegistrationSuccess(true);
      setRegisteredEmail(response.data.email);
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
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

      {/* Invitation Notice - Show if registering via invitation */}
      {isInvitation && (
        <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 mb-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 dark:border-blue-600 p-4 rounded-r-lg">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-xs font-semibold text-blue-800 dark:text-blue-400 mb-1.5">You've Been Invited</h3>
                <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                  Someone has invited you to collaborate on their AretaCare session. Complete your registration below to accept the invitation and gain access to the shared session.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

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

      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-800 py-6 px-4 shadow-md sm:rounded-xl sm:px-10 border border-gray-200 dark:border-gray-700 transition-colors duration-200">
          {registrationSuccess ? (
            /* Success State - Email verification required */
            <div className="text-center py-4">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-6">
                <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Check your email
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                We've sent a verification link to:
              </p>
              <p className="font-medium text-gray-900 dark:text-white mb-6">
                {registeredEmail}
              </p>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  Click the link in the email to verify your account and complete registration. The link expires in 1 hour.
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Didn't receive the email? Check your spam folder.
                </p>
                <Link
                  to="/login"
                  className="inline-block text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                >
                  Go to Login
                </Link>
              </div>
            </div>
          ) : (
            /* Registration Form */
            <>
              <h2 className="text-center text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                Create your account
              </h2>
              <p className="mt-2 mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Join AretaCare to get started
              </p>

              {error && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email address {isInvitation && <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(from invitation)</span>}
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="your@email.com"
                    disabled={loading || isInvitation}
                    readOnly={isInvitation}
                    className={`input ${isInvitation ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : ''}`}
                  />
                  {isInvitation && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      This email is required to accept your invitation. You can change it after registration in Settings.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Must be 8-72 characters long</p>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Please acknowledge the following:
                  </p>

                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="acknowledgeNotMedicalAdvice"
                      checked={acknowledgeNotMedicalAdvice}
                      onChange={(e) => setAcknowledgeNotMedicalAdvice(e.target.checked)}
                      disabled={loading}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                      required
                    />
                    <label htmlFor="acknowledgeNotMedicalAdvice" className="ml-3 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      I understand that AretaCare provides informational and organizational support only, does not provide medical advice, and is not a substitute for professional medical care. I will consult my care team for any medical decisions.
                    </label>
                  </div>

                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="acknowledgeHIPAA"
                      checked={acknowledgeHIPAA}
                      onChange={(e) => setAcknowledgeHIPAA(e.target.checked)}
                      disabled={loading}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                      required
                    />
                    <label htmlFor="acknowledgeHIPAA" className="ml-3 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      I understand this service is not HIPAA-covered and is intended for personal use. I will not rely on AretaCare as my primary source of medical information.
                    </label>
                  </div>

                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="acknowledgeEmailCommunications"
                      checked={acknowledgeEmailCommunications}
                      onChange={(e) => setAcknowledgeEmailCommunications(e.target.checked)}
                      disabled={loading}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                      required
                    />
                    <label htmlFor="acknowledgeEmailCommunications" className="ml-3 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      I understand I will receive email communications from AretaCare, including notifications about password changes, account updates, and session sharing activities.
                    </label>
                  </div>

                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="agreeToTerms"
                      checked={agreeToTerms}
                      onChange={(e) => setAgreeToTerms(e.target.checked)}
                      disabled={loading}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                      required
                    />
                    <label htmlFor="agreeToTerms" className="ml-3 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      By creating an account, I agree to the{' '}
                      <Link to="/terms" className="text-primary-600 dark:text-primary-400 hover:underline" target="_blank">
                        Terms of Service
                      </Link>
                      {' '}and{' '}
                      <Link to="/privacy" className="text-primary-600 dark:text-primary-400 hover:underline" target="_blank">
                        Privacy Policy
                      </Link>.
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
                    <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Already have an account?</span>
                  </div>
                </div>

                <div className="mt-6 text-center">
                  <Link
                    to="/login"
                    className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                  >
                    Sign in to your account
                  </Link>
                </div>
              </div>
            </>
          )}
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

export default Register;
