import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

function FeedbackTab() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();

  // Don't show on the contact page or admin console
  if (location.pathname === '/contact' || location.pathname.startsWith('/admin')) {
    return null;
  }

  const handleClick = () => {
    // Pass the current location so Contact page can redirect back
    navigate('/contact', { state: { from: location.pathname } });
  };

  return (
    <button
      onClick={handleClick}
      className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 bg-primary-600 hover:bg-primary-700 text-white font-medium py-4 px-2 rounded-l-lg shadow-lg transition-all duration-200 hover:shadow-xl z-40"
      style={{ writingMode: 'vertical-rl' }}
      aria-label="Send Feedback"
      title="Send Feedback"
    >
      <span className="text-sm font-medium whitespace-nowrap flex items-center gap-2">
        <svg className="w-4 h-4 inline-block" style={{ transform: 'rotate(90deg)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
        <span>Feedback</span>
      </span>
    </button>
  );
}

export default FeedbackTab;
