import { useState } from 'react';
import { sessionAPI } from '../services/api';

export default function CollaborationModal({ session, onClose, onSuccess }) {
  const [step, setStep] = useState('view'); // 'view', 'enterEmail', 'confirm'
  const [email, setEmail] = useState('');
  const [userToAdd, setUserToAdd] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const collaborators = session.collaborators || [];
  const isOwner = session.is_owner;

  const handleCheckUser = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await sessionAPI.checkUser(session.id, email);
      const data = response.data;

      if (!data.exists) {
        setError(data.message);
        setLoading(false);
        return;
      }

      setUserToAdd(data);
      setStep('confirm');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to check user');
    } finally {
      setLoading(false);
    }
  };

  const handleShareSession = async () => {
    setError(null);
    setLoading(true);

    try {
      await sessionAPI.share(session.id, email);
      setSuccess('Session shared successfully!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to share session');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAccess = async (userId, userName) => {
    if (!window.confirm(`Remove ${userName} from this session?`)) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await sessionAPI.revokeAccess(session.id, userId);
      setSuccess('Access revoked successfully!');
      // Call onSuccess to refresh session data, then close modal
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to revoke access');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveSession = async () => {
    const confirmMessage =
      'Are you sure you want to leave this session?\n\n' +
      'You will lose access to all data in this session:\n' +
      '• Conversations\n' +
      '• Journal entries\n' +
      '• Documents\n' +
      '• Audio recordings\n' +
      '• Daily plans\n\n' +
      'To regain access, the session owner must invite you again.';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await sessionAPI.leave(session.id);
      setSuccess('Left session successfully!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to leave session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {step === 'view' && 'Manage Collaborators'}
              {step === 'enterEmail' && 'Share Session'}
              {step === 'confirm' && 'Confirm Sharing'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-4">
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 text-sm text-green-600 bg-green-50 px-3 py-2 rounded">
              {success}
            </div>
          )}

          {step === 'view' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Session: {session.name}
                </h3>
                <p className="text-sm text-gray-600">
                  {isOwner ? 'You are the owner of this session.' : 'You are a collaborator on this session.'}
                </p>
              </div>

              {collaborators.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Collaborators ({collaborators.length}/4)
                  </h3>
                  <div className="space-y-2">
                    {collaborators.map((collab) => (
                      <div
                        key={collab.user_id}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded"
                      >
                        <div>
                          <div className="text-sm font-medium text-gray-900">{collab.name}</div>
                          <div className="text-xs text-gray-500">{collab.email}</div>
                          <div className="text-xs text-gray-400">
                            Added {new Date(collab.added_at).toLocaleDateString()}
                          </div>
                        </div>
                        {isOwner && (
                          <button
                            onClick={() => handleRevokeAccess(collab.user_id, collab.name)}
                            disabled={loading}
                            className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {collaborators.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-4">
                  No collaborators yet.
                </div>
              )}

              <div className="flex space-x-2 pt-4 border-t border-gray-200">
                {isOwner && collaborators.length < 4 && (
                  <button
                    onClick={() => setStep('enterEmail')}
                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
                  >
                    Add Collaborator
                  </button>
                )}
                {!isOwner && (
                  <button
                    onClick={handleLeaveSession}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    {loading ? 'Leaving...' : 'Leave Session'}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {step === 'enterEmail' && (
            <form onSubmit={handleCheckUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input w-full"
                  placeholder="colleague@example.com"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  The person must have an existing AretaCare account.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> They must have 2 or fewer active sessions to accept this invitation.
                </p>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setStep('view');
                    setEmail('');
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                >
                  {loading ? 'Checking...' : 'Continue'}
                </button>
              </div>
            </form>
          )}

          {step === 'confirm' && userToAdd && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Share with: {userToAdd.name}
                </h3>
                <p className="text-sm text-gray-600">
                  Email: {email}
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-3">
                <p className="text-sm text-yellow-800 mb-2">
                  <strong>⚠️ Important:</strong> Please read carefully before confirming.
                </p>
                <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
                  <li>All data for "{session.name}" will be viewable and editable by {userToAdd.name}</li>
                  <li>This includes conversations, journal entries, documents, and audio recordings</li>
                  <li>They will be able to add, edit, and delete content in this session</li>
                  <li>Your other sessions will remain private</li>
                  <li>Only the session owner (you) can delete the session</li>
                  <li>You can revoke their access at any time</li>
                </ul>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2">
                <p className="text-xs text-gray-700">
                  Only share this session if you know and trust {userToAdd.name} with sensitive medical information.
                </p>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setStep('enterEmail');
                    setUserToAdd(null);
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Back
                </button>
                <button
                  onClick={handleShareSession}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                >
                  {loading ? 'Sharing...' : 'Confirm & Share'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
