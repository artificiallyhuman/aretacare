import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { authAPI, waitlistAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import SEO from '../components/SEO';
import logo from '../logos/large_logo.png';

function Register() {
  const { isDark, toggleTheme } = useTheme();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acknowledgeNotMedicalAdvice, setAcknowledgeNotMedicalAdvice] = useState(false);
  const [acknowledgeHIPAA, setAcknowledgeHIPAA] = useState(false);
  const [acknowledgeAIProcessing, setAcknowledgeAIProcessing] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [acknowledgeAgeAndUse, setAcknowledgeAgeAndUse] = useState(false);
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
      setError('You must acknowledge that AretaCare does not provide medical advice');
      return;
    }

    if (!acknowledgeHIPAA) {
      setError('You must acknowledge that AretaCare is a consumer tool, not a HIPAA-covered service');
      return;
    }

    if (!acknowledgeAIProcessing) {
      setError('You must consent to data collection and processing to use AretaCare');
      return;
    }

    if (!agreeToTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy');
      return;
    }

    if (!acknowledgeAgeAndUse) {
      setError('You must confirm you are at least 18 years old and reside in the United States');
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
        acknowledgeAIProcessing,
        agreeToTerms,
        acknowledgeAgeAndUse,
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
      <SEO
        title="Create your account"
        description="Create a free AretaCare account to organize medical information, collaborate with family, and prepare for care team conversations."
        path="/register"
      />
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
                  Someone has invited you to collaborate on their AretaCare care session. Complete your registration below to accept the invitation and gain access to the shared care session.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo — links back to the homepage */}
        <div className="flex justify-center">
          <Link to="/" aria-label="AretaCare home" className="flex items-center space-x-4 group">
            <img
              src={logo}
              alt="AretaCare Logo"
              width={64}
              height={64}
              decoding="async"
              className="w-16 h-16 object-contain"
            />
            <div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">AretaCare<span className="font-normal">™</span></p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Calm | Clarity | Confidence</p>
            </div>
          </Link>
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
              <h1 className="text-center text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                Create your account
              </h1>
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
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="8-72 characters"
                      disabled={loading}
                      minLength={8}
                      maxLength={72}
                      className="input pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      tabIndex={-1}
                    >
                      {showPassword ? (
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
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Must be 8-72 characters long</p>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      placeholder="Re-enter your password"
                      disabled={loading}
                      minLength={8}
                      maxLength={72}
                      className="input pr-10"
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
                      I understand that AretaCare is not a medical professional and does not provide medical advice, diagnosis, or treatment. I will consult qualified healthcare professionals for medical decisions and emergencies.
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
                      I understand that AretaCare is a consumer tool, not a HIPAA-covered service, and is not a medical record system. I will not rely on it as my sole repository for critical health information.
                    </label>
                  </div>

                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="acknowledgeAIProcessing"
                      checked={acknowledgeAIProcessing}
                      onChange={(e) => setAcknowledgeAIProcessing(e.target.checked)}
                      disabled={loading}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                      required
                    />
                    <label htmlFor="acknowledgeAIProcessing" className="ml-3 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      I consent to the collection, storage, and processing of my information as described in the{' '}
                      <Link to="/privacy" className="text-primary-600 dark:text-primary-400 hover:underline" target="_blank">
                        Privacy Policy
                      </Link>
                      , including processing by OpenAI's AI systems to help organize, summarize, and interpret content.
                    </label>
                  </div>

                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="acknowledgeAgeAndUse"
                      checked={acknowledgeAgeAndUse}
                      onChange={(e) => setAcknowledgeAgeAndUse(e.target.checked)}
                      disabled={loading}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                      required
                    />
                    <label htmlFor="acknowledgeAgeAndUse" className="ml-3 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      I am at least 18 years old, reside in the United States, and will use AretaCare only for lawful, personal purposes within the United States.
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
                      I agree to the{' '}
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
