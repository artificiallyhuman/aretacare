import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './hooks/useSession';
import Header from './components/Header';
import Footer from './components/Footer';
import Conversation from './pages/Conversation';
import About from './pages/About';
import JournalView from './pages/JournalView';
import DailyPlan from './pages/DailyPlan';
import AudioRecordings from './pages/AudioRecordings';
import JargonTranslator from './pages/tools/JargonTranslator';
import ConversationCoach from './pages/tools/ConversationCoach';
import Documents from './pages/tools/Documents';
import Login from './pages/Login';
import Register from './pages/Register';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';

// Protected Route Component
function ProtectedRoute({ children }) {
  const { user, loading } = useSession();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Public Route Component (redirects to home if already logged in)
function PublicRoute({ children }) {
  const { user, loading } = useSession();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  const { user, clearSession, logout } = useSession();

  const handleClearSession = async () => {
    const confirmMessage =
      '⚠️ WARNING: PERMANENT DATA DELETION ⚠️\n\n' +
      'This will PERMANENTLY DELETE ALL of your data including:\n' +
      '• All conversations and messages\n' +
      '• All journal entries\n' +
      '• All uploaded documents\n' +
      '• All daily plans\n' +
      '• All audio recordings\n\n' +
      'THIS ACTION CANNOT BE UNDONE.\n' +
      'Your data is NOT recoverable after deletion.\n\n' +
      'Are you absolutely sure you want to proceed?';

    if (window.confirm(confirmMessage)) {
      await clearSession();
      window.location.reload();
    }
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        {user && <Header onClearSession={handleClearSession} onLogout={handleLogout} user={user} />}
        <Routes>
          {/* Public Routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />
          <Route
            path="/terms"
            element={<TermsOfService />}
          />
          <Route
            path="/privacy"
            element={<PrivacyPolicy />}
          />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Conversation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/about"
            element={
              <ProtectedRoute>
                <About />
              </ProtectedRoute>
            }
          />
          <Route
            path="/journal"
            element={
              <ProtectedRoute>
                <JournalView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/daily-plan"
            element={
              <ProtectedRoute>
                <DailyPlan />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audio-recordings"
            element={
              <ProtectedRoute>
                <AudioRecordings />
              </ProtectedRoute>
            }
          />
          {/* Tools Routes */}
          <Route
            path="/tools/jargon"
            element={
              <ProtectedRoute>
                <JargonTranslator />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tools/coach"
            element={
              <ProtectedRoute>
                <ConversationCoach />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tools/documents"
            element={
              <ProtectedRoute>
                <Documents />
              </ProtectedRoute>
            }
          />
        </Routes>

        <Footer />
      </div>
    </Router>
  );
}

export default App;
