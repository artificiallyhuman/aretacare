import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useSession } from './hooks/useSession';
import Header from './components/Header';
import Home from './pages/Home';
import MedicalSummary from './pages/MedicalSummary';
import JargonTranslator from './pages/JargonTranslator';
import ConversationCoach from './pages/ConversationCoach';
import Chat from './pages/Chat';

function App() {
  const { clearSession } = useSession();

  const handleClearSession = async () => {
    if (window.confirm('Are you sure you want to clear your session? This will remove all conversation history.')) {
      await clearSession();
      window.location.reload();
    }
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Header onClearSession={handleClearSession} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/summary" element={<MedicalSummary />} />
          <Route path="/jargon" element={<JargonTranslator />} />
          <Route path="/coach" element={<ConversationCoach />} />
          <Route path="/chat" element={<Chat />} />
        </Routes>

        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <p className="text-center text-gray-600 text-sm">
              AretaCare is an educational assistant. Always consult with your healthcare team for medical decisions.
            </p>
            <p className="text-center text-gray-500 text-xs mt-2">
              © 2025 AretaCare. Your privacy is protected - sessions are temporary and not stored beyond your active use.
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
