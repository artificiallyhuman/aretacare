import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './hooks/useSession';
import Header from './components/Header';
import Home from './pages/Home';
import MedicalSummary from './pages/MedicalSummary';
import JargonTranslator from './pages/JargonTranslator';
import ConversationCoach from './pages/ConversationCoach';
import Chat from './pages/Chat';
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
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/summary"
            element={
              <ProtectedRoute>
                <MedicalSummary />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jargon"
            element={
              <ProtectedRoute>
                <JargonTranslator />
              </ProtectedRoute>
            }
          />
          <Route
            path="/coach"
            element={
              <ProtectedRoute>
                <ConversationCoach />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
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
