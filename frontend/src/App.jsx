import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './hooks/useSession';
import Header from './components/Header';
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
    if (window.confirm('Are you sure you want to clear your session? This will remove all conversation history.')) {
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

        {user && (
          <footer className="bg-white border-t border-gray-200 mt-8 sm:mt-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
              <p className="text-center text-gray-600 text-xs sm:text-sm px-2">
                AretaCare is an AI assistant. Always consult with your healthcare team for medical decisions.
              </p>
              <p className="text-center text-gray-500 text-xs mt-2 px-2">
                © 2025 AretaCare. Your privacy is protected - sessions are temporary and not stored beyond your active use.
              </p>
            </div>
          </footer>
        )}
      </div>
    </Router>
  );
}

export default App;
