import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SessionProvider, useSessionContext } from './contexts/SessionContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AdminProvider, useAdmin } from './contexts/AdminContext';
import { NetworkProvider } from './contexts/NetworkContext';
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import Footer from './components/Footer';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import FeedbackTab from './components/FeedbackTab';
import IdleTimeout from './components/IdleTimeout';

// Eagerly load critical pages (login flow and main conversation)
import Login from './pages/Login';
import Register from './pages/Register';
import Conversation from './pages/Conversation';

// Lazy load less frequently accessed pages for code splitting (40-60% faster initial load)
const About = lazy(() => import('./pages/About'));
const JournalView = lazy(() => import('./pages/JournalView'));
const DailyPlan = lazy(() => import('./pages/DailyPlan'));
const AudioRecordings = lazy(() => import('./pages/AudioRecordings'));
const Collaboration = lazy(() => import('./pages/Collaboration'));
const Settings = lazy(() => import('./pages/Settings'));
const JargonTranslator = lazy(() => import('./pages/tools/JargonTranslator'));
const ConversationCoach = lazy(() => import('./pages/tools/ConversationCoach'));
const Documents = lazy(() => import('./pages/tools/Documents'));
const PasswordReset = lazy(() => import('./pages/PasswordReset'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const VerifyEmailChange = lazy(() => import('./pages/VerifyEmailChange'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const Contact = lazy(() => import('./pages/Contact'));
const Profile = lazy(() => import('./pages/Profile'));

// Admin pages
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminReport = lazy(() => import('./pages/admin/AdminReport'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminAccounts = lazy(() => import('./pages/admin/AdminAccounts'));
const AdminS3Cleanup = lazy(() => import('./pages/admin/AdminS3Cleanup'));
const AdminAuditLog = lazy(() => import('./pages/admin/AdminAuditLog'));
const AdminErrorLogs = lazy(() => import('./pages/admin/AdminErrorLogs'));
const AdminSecurityLogs = lazy(() => import('./pages/admin/AdminSecurityLogs'));
const AdminApiLogs = lazy(() => import('./pages/admin/AdminApiLogs'));
const AdminHealth = lazy(() => import('./pages/admin/AdminHealth'));

// Loading fallback component for lazy-loaded routes
const PageLoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
      <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
    </div>
  </div>
);

// Protected Route Component
function ProtectedRoute({ children }) {
  const { user, loading } = useSessionContext();

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
  const { user, loading } = useSessionContext();

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

// Admin Route Component (requires admin access)
function AdminRoute({ children }) {
  const { user, loading: userLoading } = useSessionContext();
  const { isAdmin, loading: adminLoading } = useAdmin();

  if (userLoading || adminLoading) {
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

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppContent() {
  const { user, logout } = useSessionContext();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  // Hide footer on Conversation page for full-screen chat experience, and when user is not logged in
  const showFooter = user && location.pathname !== '/';

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-200 overflow-hidden">
      <NetworkStatusBanner />
      {user && <Header onLogout={handleLogout} user={user} />}
      {user && <FeedbackTab />}
      <IdleTimeout />
      <main className="flex-1 overflow-auto">
      <Suspense fallback={<PageLoadingFallback />}>
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
            path="/password-reset"
            element={
              <PublicRoute>
                <PasswordReset />
              </PublicRoute>
            }
          />
          <Route
            path="/verify-email"
            element={<VerifyEmail />}
          />
          <Route
            path="/verify-email-change"
            element={<VerifyEmailChange />}
          />
          <Route
            path="/terms"
            element={<TermsOfService />}
          />
          <Route
            path="/privacy"
            element={<PrivacyPolicy />}
          />
          <Route
            path="/about"
            element={<About />}
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
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/collaboration"
            element={
              <ProtectedRoute>
                <Collaboration />
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

          {/* Contact/Feedback Route (not in menu) */}
          <Route
            path="/contact"
            element={
              <ProtectedRoute>
                <Contact />
              </ProtectedRoute>
            }
          />

          {/* Profile Route (not in menu - accessible at /profile) */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <AdminRoute>
                <AdminReport />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <AdminUsers />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/accounts"
            element={
              <AdminRoute>
                <AdminAccounts />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/s3-cleanup"
            element={
              <AdminRoute>
                <AdminS3Cleanup />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/audit-log"
            element={
              <AdminRoute>
                <AdminAuditLog />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/error-logs"
            element={
              <AdminRoute>
                <AdminErrorLogs />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/security-logs"
            element={
              <AdminRoute>
                <AdminSecurityLogs />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/api-logs"
            element={
              <AdminRoute>
                <AdminApiLogs />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/health"
            element={
              <AdminRoute>
                <AdminHealth />
              </AdminRoute>
            }
          />
        </Routes>
      </Suspense>
      </main>

      {showFooter && <Footer />}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <Router>
          <NetworkProvider>
            <SessionProvider>
              <AdminProvider>
                <AppContent />
              </AdminProvider>
            </SessionProvider>
          </NetworkProvider>
        </Router>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
