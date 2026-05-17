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
import CollaborationAwarenessPopup from './components/CollaborationAwarenessPopup';
import AIDataSharingConsentModal from './components/AIDataSharingConsentModal';

// Eagerly load all prerendered public routes (matches PRERENDER_ROUTES in
// vite.config.js). React.lazy + prerendered HTML causes a hydration mismatch
// because the chunk hasn't resolved when hydration begins, so React falls back
// to a full client re-render — destroying the prerender's first-paint benefit.
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Waitlist from './pages/Waitlist';
import About from './pages/About';
import Contact from './pages/Contact';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
import JargonTranslator from './pages/tools/JargonTranslator';
import ConversationCoach from './pages/tools/ConversationCoach';

// Eagerly load main conversation (always shown to signed-in users at /)
import Conversation from './pages/Conversation';

// Lazy load auth-gated and admin pages — these never render via prerender and
// only load after the user has authenticated, so the chunk-load cost is fine.
const JournalView = lazy(() => import('./pages/JournalView'));
const DailyPlan = lazy(() => import('./pages/DailyPlan'));
const AudioRecordings = lazy(() => import('./pages/AudioRecordings'));
const Collaboration = lazy(() => import('./pages/Collaboration'));
const Settings = lazy(() => import('./pages/Settings'));
const Documents = lazy(() => import('./pages/tools/Documents'));
const PasswordReset = lazy(() => import('./pages/PasswordReset'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const VerifyEmailChange = lazy(() => import('./pages/VerifyEmailChange'));
const Profile = lazy(() => import('./pages/Profile'));
const MFASetup = lazy(() => import('./pages/MFASetup'));

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
const AdminInvitations = lazy(() => import('./pages/admin/AdminInvitations'));

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

// Public Route Component (redirects to home if already logged in).
// While the auth check is in flight we render the public content optimistically
// so crawlers and prerendering see real markup instead of a spinner. If auth
// resolves to a logged-in user, the Navigate below kicks in.
function PublicRoute({ children }) {
  const { user, loading } = useSessionContext();

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

// Auth Switch Route - renders different content for authenticated vs unauthenticated users.
// Used for `/` so logged-in users see the chat app and visitors see the marketing landing page.
// During the auth-check window we render the unauthenticated page so the prerendered
// snapshot and first paint contain the marketing markup.
function AuthSwitchRoute({ authenticated, unauthenticated }) {
  const { user, loading } = useSessionContext();

  if (!loading && user) {
    return authenticated;
  }

  return unauthenticated;
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
  const { user, setUser, logout } = useSessionContext();
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
      {user && <CollaborationAwarenessPopup />}
      <AIDataSharingConsentModal user={user} setUser={setUser} />
      <IdleTimeout />
      <main className="flex-1 overflow-auto">
      <ErrorBoundary>
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
          <Route
            path="/waitlist"
            element={
              <PublicRoute>
                <Waitlist />
              </PublicRoute>
            }
          />

          {/* Root: public landing page when unauthenticated, conversation when signed in */}
          <Route
            path="/"
            element={
              <AuthSwitchRoute
                authenticated={<Conversation />}
                unauthenticated={<Landing />}
              />
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
            path="/daily-digest"
            element={
              <ProtectedRoute>
                <DailyPlan />
              </ProtectedRoute>
            }
          />
          {/* Redirect old URL to new URL for backward compatibility */}
          <Route
            path="/daily-plan"
            element={<Navigate to="/daily-digest" replace />}
          />
          <Route
            path="/audio-recordings"
            element={
              <ProtectedRoute>
                <AudioRecordings />
              </ProtectedRoute>
            }
          />
          {/* Tools Routes (accessible without login for App Store compliance) */}
          <Route
            path="/tools/jargon"
            element={<JargonTranslator />}
          />
          <Route
            path="/tools/coach"
            element={<ConversationCoach />}
          />
          <Route
            path="/tools/documents"
            element={
              <ProtectedRoute>
                <Documents />
              </ProtectedRoute>
            }
          />

          {/* Contact/Feedback Route (public for App Store support URL) */}
          <Route
            path="/contact"
            element={<Contact />}
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

          {/* MFA Setup Route (not in menu - accessible at /mfa-setup) */}
          <Route
            path="/mfa-setup"
            element={
              <ProtectedRoute>
                <MFASetup />
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
          <Route
            path="/admin/invitations"
            element={
              <AdminRoute>
                <AdminInvitations />
              </AdminRoute>
            }
          />
        </Routes>
      </Suspense>
      </ErrorBoundary>
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
