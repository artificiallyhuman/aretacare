import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSessionContext } from '../contexts/SessionContext';
import { useTheme } from '../contexts/ThemeContext';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import api from '../services/api';

function Contact() {
  const { user } = useSessionContext();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // Get return URL from location state or default to home
  const returnUrl = location.state?.from || '/';

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    feedbackTypes: [],
    message: ''
  });

  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auto-populate user data when user loads
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.name || prev.name,
        email: user.email || prev.email
      }));
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(''); // Clear error when user types
  };

  const handleCheckboxChange = (e) => {
    const { value, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      feedbackTypes: checked
        ? [...prev.feedbackTypes, value]
        : prev.feedbackTypes.filter(type => type !== value)
    }));
    setError(''); // Clear error when user changes selection
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate form
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    if (formData.feedbackTypes.length === 0) {
      setError('Please select at least one feedback type');
      setLoading(false);
      return;
    }

    if (!captchaToken) {
      setError('Please complete the captcha verification');
      setLoading(false);
      return;
    }

    try {
      // Map pathname to readable page name
      const getPageName = (pathname) => {
        const pageMap = {
          '/': 'Conversation (Home)',
          '/journal': 'Journal',
          '/daily-plan': 'Daily Plan',
          '/audio-recordings': 'Audio Recordings',
          '/tools/documents': 'Documents',
          '/tools/jargon': 'Jargon Translator',
          '/tools/coach': 'Conversation Coach',
          '/collaboration': 'Collaboration',
          '/settings': 'Settings',
          '/about': 'About',
        };

        // Check for admin pages
        if (pathname.startsWith('/admin')) {
          return `Admin: ${pathname.replace('/admin/', '').replace('/admin', 'Dashboard')}`;
        }

        return pageMap[pathname] || pathname;
      };

      const sourcePage = location.state?.from || '/contact';
      const pageUrl = `${getPageName(sourcePage)} (${sourcePage})`;

      // Gather metadata for diagnostics
      const metadata = {
        user_agent: navigator.userAgent,
        page_url: pageUrl
      };

      await api.post('/feedback/submit', {
        name: formData.name,
        email: formData.email,
        feedback_types: formData.feedbackTypes,
        message: formData.message,
        captcha_token: captchaToken,
        ...metadata
      });

      setSuccess(true);

      // Redirect back after 3 seconds
      setTimeout(() => {
        navigate(returnUrl);
      }, 3000);

    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCaptchaVerify = (token) => {
    setCaptchaToken(token);
    setError(''); // Clear error when captcha is verified
  };

  const handleCaptchaExpire = () => {
    setCaptchaToken('');
  };

  const handleCaptchaError = (err) => {
    console.error('hCaptcha error:', err);
    setError('Captcha verification failed. Please try again.');
    setCaptchaToken('');
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Thank You</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Your feedback has been received. We'll review it carefully and you'll receive a confirmation email shortly.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Redirecting you back...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-8 sm:py-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(returnUrl)}
            className="inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Share Your Feedback
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Thank you for helping us improve AretaCare. Let us know about any bugs you notice, ideas for improvement, or features you'd like us to consider.
          </p>
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 sm:p-8">
          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 cursor-not-allowed"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 cursor-not-allowed"
              />
            </div>

            {/* Feedback Types */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                What type of feedback are you sharing? * <span className="text-xs text-gray-500 dark:text-gray-400">(Select all that apply)</span>
              </label>
              <div className="space-y-3">
                <label className="flex items-start cursor-pointer group">
                  <input
                    type="checkbox"
                    value="bug"
                    checked={formData.feedbackTypes.includes('bug')}
                    onChange={handleCheckboxChange}
                    className="mt-1 h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:ring-2"
                  />
                  <span className="ml-3 text-sm">
                    <span className="font-medium text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Bug Report</span>
                    <span className="block text-gray-500 dark:text-gray-400">Something isn't working correctly</span>
                  </span>
                </label>

                <label className="flex items-start cursor-pointer group">
                  <input
                    type="checkbox"
                    value="improvement"
                    checked={formData.feedbackTypes.includes('improvement')}
                    onChange={handleCheckboxChange}
                    className="mt-1 h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:ring-2"
                  />
                  <span className="ml-3 text-sm">
                    <span className="font-medium text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Suggested Improvement</span>
                    <span className="block text-gray-500 dark:text-gray-400">How to make AretaCare better</span>
                  </span>
                </label>

                <label className="flex items-start cursor-pointer group">
                  <input
                    type="checkbox"
                    value="feature"
                    checked={formData.feedbackTypes.includes('feature')}
                    onChange={handleCheckboxChange}
                    className="mt-1 h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:ring-2"
                  />
                  <span className="ml-3 text-sm">
                    <span className="font-medium text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Feature Request</span>
                    <span className="block text-gray-500 dark:text-gray-400">Something new you'd like to see</span>
                  </span>
                </label>

                <label className="flex items-start cursor-pointer group">
                  <input
                    type="checkbox"
                    value="other"
                    checked={formData.feedbackTypes.includes('other')}
                    onChange={handleCheckboxChange}
                    className="mt-1 h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:ring-2"
                  />
                  <span className="ml-3 text-sm">
                    <span className="font-medium text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Other</span>
                    <span className="block text-gray-500 dark:text-gray-400">General feedback or questions</span>
                  </span>
                </label>
              </div>
            </div>

            {/* Message */}
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Your Message *
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                minLength={10}
                maxLength={5000}
                rows={6}
                placeholder="Please provide as much detail as possible..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {formData.message.length} / 5000 characters
              </p>
            </div>

            {/* hCaptcha */}
            <div className="flex justify-center">
              <HCaptcha
                sitekey={import.meta.env.VITE_HCAPTCHA_SITE_KEY || '10000000-ffff-ffff-ffff-000000000001'} // Test key for development
                onVerify={handleCaptchaVerify}
                onExpire={handleCaptchaExpire}
                onError={handleCaptchaError}
                theme={isDark ? 'dark' : 'light'}
              />
            </div>

            {/* Submit Button */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={loading || !captchaToken}
                className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {loading ? 'Submitting...' : 'Submit Feedback'}
              </button>
              <button
                type="button"
                onClick={() => navigate(returnUrl)}
                className="flex-1 sm:flex-none bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-3 px-6 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        {/* Privacy Notice */}
        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 dark:border-blue-600 p-4 rounded-r-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">Privacy Notice</h3>
              <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
                We collect minimal diagnostic information (browser type, page URL) to help us understand and fix issues.
                This information is used solely for improving AretaCare and is handled in accordance with our privacy policy.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Contact;
