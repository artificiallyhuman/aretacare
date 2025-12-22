import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionAPI } from '../services/api';
import { useSessionContext } from '../contexts/SessionContext';
import { formatLocalDate } from '../utils/dateUtils';

export default function Collaboration() {
  const navigate = useNavigate();
  const { user, sessions, refreshSessions, activeSessionId } = useSessionContext();
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);

  // Collaboration management states
  const [step, setStep] = useState('view'); // 'view', 'enterEmail', 'confirm', 'confirmInvitation', 'confirmTransfer', 'warningMaxSessions', 'confirmRemove', 'confirmLeave', 'confirmCancelInvitation'
  const [email, setEmail] = useState('');
  const [userToAdd, setUserToAdd] = useState(null);
  const [userToTransfer, setUserToTransfer] = useState(null);
  const [userToWarn, setUserToWarn] = useState(null);
  const [userToRemove, setUserToRemove] = useState(null);
  const [invitationToCancel, setInvitationToCancel] = useState(null);
  const [pendingInvitations, setPendingInvitations] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const ownedSessions = sessions.filter(s => s.is_owner);
  const sharedSessions = sessions.filter(s => !s.is_owner);

  // Fetch pending invitations for all owned sessions
  useEffect(() => {
    const fetchAllInvitations = async () => {
      const invitationsMap = {};
      for (const session of ownedSessions) {
        try {
          const response = await sessionAPI.getPendingInvitations(session.id);
          invitationsMap[session.id] = response.data || [];
        } catch (err) {
          console.error(`Failed to fetch invitations for session ${session.id}:`, err);
        }
      }
      setPendingInvitations(invitationsMap);
    };

    if (ownedSessions.length > 0) {
      fetchAllInvitations();
    }
  }, [sessions]);

  const fetchPendingInvitations = async (sessionId) => {
    try {
      const response = await sessionAPI.getPendingInvitations(sessionId);
      setPendingInvitations(prev => ({
        ...prev,
        [sessionId]: response.data || []
      }));
    } catch (err) {
      console.error('Failed to fetch pending invitations:', err);
    }
  };

  const handleToggleSession = (sessionId) => {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      setSelectedSession(null);
      setStep('view');
      setError(null);
      setSuccess(null);
    } else {
      setExpandedSessionId(sessionId);
      setSelectedSession(sessions.find(s => s.id === sessionId));
      setStep('view');
      setError(null);
      setSuccess(null);
    }
  };

  const handleCheckUser = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await sessionAPI.checkUser(selectedSession.id, email);
      const data = response.data;

      if (!data.exists) {
        // Check if this is an error message (e.g., trying to add yourself)
        if (data.message && data.message.includes('cannot add yourself')) {
          setError(data.message);
          setLoading(false);
          return;
        }

        setStep('confirmInvitation');
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
      await sessionAPI.share(selectedSession.id, email);
      setSuccess('Session shared successfully.');
      await refreshSessions();
      setTimeout(() => {
        setStep('view');
        setEmail('');
        setUserToAdd(null);
        setSuccess(null);
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to share session');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAccess = (userId, userName) => {
    setUserToRemove({ userId, userName });
    setStep('confirmRemove');
  };

  const confirmRevokeAccess = async () => {
    if (!userToRemove) return;

    setError(null);
    setLoading(true);

    try {
      await sessionAPI.revokeAccess(selectedSession.id, userToRemove.userId);
      setSuccess('Access revoked successfully.');
      await refreshSessions();
      setTimeout(() => {
        setStep('view');
        setUserToRemove(null);
        setSuccess(null);
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to revoke access');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveSession = () => {
    setStep('confirmLeave');
  };

  const confirmLeaveSession = async () => {
    setError(null);
    setLoading(true);

    try {
      await sessionAPI.leave(selectedSession.id);
      setSuccess('Left session successfully.');
      await refreshSessions();
      setTimeout(() => {
        setExpandedSessionId(null);
        setSelectedSession(null);
        setStep('view');
        setSuccess(null);
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to leave session');
    } finally {
      setLoading(false);
    }
  };

  const handleTransferOwnership = (userId, userName, ownedSessionCount) => {
    if (ownedSessionCount >= 5) {
      setUserToWarn({ userName });
      setStep('warningMaxSessions');
      return;
    }
    setUserToTransfer({ userId, userName });
    setStep('confirmTransfer');
  };

  const confirmTransferOwnership = async () => {
    if (!userToTransfer) return;

    setError(null);
    setLoading(true);

    try {
      await sessionAPI.transferOwnership(selectedSession.id, userToTransfer.userId);
      setSuccess(`Ownership transferred to ${userToTransfer.userName}!`);
      await refreshSessions();
      setTimeout(() => {
        setExpandedSessionId(null);
        setSelectedSession(null);
        setStep('view');
        setUserToTransfer(null);
        setSuccess(null);
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to transfer ownership');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvitation = async () => {
    setError(null);
    setLoading(true);

    try {
      await sessionAPI.sendInvitation(selectedSession.id, email);
      setSuccess('Invitation sent successfully.');
      fetchPendingInvitations(selectedSession.id);
      setTimeout(() => {
        setStep('view');
        setEmail('');
        setSuccess(null);
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelInvitation = (invitationId, invitationEmail) => {
    setInvitationToCancel({ invitationId, email: invitationEmail });
    setStep('confirmCancelInvitation');
  };

  const handleResendInvitation = async (invitationEmail) => {
    setError(null);
    setLoading(true);

    try {
      await sessionAPI.sendInvitation(selectedSession.id, invitationEmail);
      setSuccess('Invitation resent successfully.');
      fetchPendingInvitations(selectedSession.id);
      setTimeout(() => {
        setSuccess(null);
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to resend invitation');
    } finally {
      setLoading(false);
    }
  };

  const confirmCancelInvitation = async () => {
    if (!invitationToCancel) return;

    setError(null);
    setLoading(true);

    try {
      await sessionAPI.cancelInvitation(selectedSession.id, invitationToCancel.invitationId);
      setSuccess('Invitation cancelled successfully.');
      fetchPendingInvitations(selectedSession.id);
      setTimeout(() => {
        setStep('view');
        setInvitationToCancel(null);
        setSuccess(null);
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to cancel invitation');
    } finally {
      setLoading(false);
    }
  };

  const renderCollaborationView = (session) => {
    const collaborators = session.collaborators || [];
    const isOwner = session.is_owner;
    const invitations = pendingInvitations[session.id] || [];

    return (
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 space-y-4">
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/50 px-3 py-2 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/50 px-3 py-2 rounded">
            {success}
          </div>
        )}

        {step === 'view' && (
          <>
            {/* Collaborators List */}
            {collaborators.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Collaborators ({collaborators.length}/9)
                </h4>
                <div className="space-y-2">
                  {collaborators.map((collab) => (
                    <div
                      key={collab.user_id}
                      className="flex items-start justify-between p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{collab.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{collab.email}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">
                          Added {formatLocalDate(collab.added_at)}
                        </div>
                      </div>
                      {isOwner && (
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleTransferOwnership(collab.user_id, collab.name, collab.owned_session_count)}
                            disabled={loading}
                            className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-white hover:bg-blue-600 dark:hover:bg-blue-500 border border-blue-600 dark:border-blue-400 rounded disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            Make Owner
                          </button>
                          <button
                            onClick={() => handleRevokeAccess(collab.user_id, collab.name)}
                            disabled={loading}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-white hover:bg-red-600 dark:hover:bg-red-500 border border-red-600 dark:border-red-400 rounded disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No Collaborators Message */}
            {collaborators.length === 0 && isOwner && (
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                No collaborators yet. Add someone to share this session.
              </div>
            )}

            {/* Pending Invitations */}
            {isOwner && invitations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Pending Invitations ({invitations.length})
                </h4>
                <div className="space-y-2">
                  {invitations.map((invitation) => {
                    const daysRemaining = invitation.days_remaining;
                    const isExpiringSoon = daysRemaining <= 7;

                    return (
                      <div
                        key={invitation.id}
                        className="flex items-start justify-between p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{invitation.email}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Invited by {invitation.invited_by_name}
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            Sent {formatLocalDate(invitation.created_at)}
                          </div>
                          <div className={`text-xs font-medium mt-1 ${isExpiringSoon ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'}`}>
                            {daysRemaining === 0 ? 'Expires today' : `Expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleResendInvitation(invitation.email)}
                            disabled={loading}
                            className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-white hover:bg-blue-600 dark:hover:bg-blue-500 border border-blue-600 dark:border-blue-400 rounded disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            Resend
                          </button>
                          <button
                            onClick={() => handleCancelInvitation(invitation.id, invitation.email)}
                            disabled={loading}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-white hover:bg-red-600 dark:hover:bg-red-500 border border-red-600 dark:border-red-400 rounded disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              {isOwner && collaborators.length < 9 && (
                <button
                  onClick={() => setStep('enterEmail')}
                  className="flex-1 px-4 py-2 bg-primary-600 dark:bg-primary-700 text-white rounded hover:bg-primary-700 dark:hover:bg-primary-600 text-sm font-medium"
                >
                  Add Collaborator
                </button>
              )}
              {!isOwner && (
                <button
                  onClick={handleLeaveSession}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 text-sm font-medium"
                >
                  {loading ? 'Leaving...' : 'Leave Session'}
                </button>
              )}
            </div>
          </>
        )}

        {step === 'enterEmail' && (
          <form onSubmit={handleCheckUser} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                If they don't have an account, you'll be able to send them an invitation.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep('view');
                  setEmail('');
                  setError(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-primary-600 dark:bg-primary-700 text-white rounded hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50 text-sm font-medium"
              >
                {loading ? 'Checking...' : 'Continue'}
              </button>
            </div>
          </form>
        )}

        {step === 'confirm' && userToAdd && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Share with: {userToAdd.name}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Email: {email}
              </p>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/50 border border-yellow-200 dark:border-yellow-800 rounded px-3 py-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-300 mb-2">
                <strong>⚠️ Important:</strong> Please read carefully before confirming.
              </p>
              <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
                <li>All data for "{session.name}" will be viewable and editable by {userToAdd.name}</li>
                <li>This includes conversations, journal entries, documents, and audio recordings</li>
                <li>They will be able to add, edit, and delete content in this session</li>
                <li>You can revoke their access at any time</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep('enterEmail');
                  setUserToAdd(null);
                  setError(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-sm"
              >
                Back
              </button>
              <button
                onClick={handleShareSession}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-primary-600 dark:bg-primary-700 text-white rounded hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50 text-sm font-medium"
              >
                {loading ? 'Sharing...' : 'Confirm & Share'}
              </button>
            </div>
          </div>
        )}

        {step === 'confirmInvitation' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                No AretaCare Account Found
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {email} doesn't have an AretaCare account yet
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded px-4 py-3">
              <p className="text-sm text-blue-900 dark:text-blue-200 mb-2 font-medium">
                Send an invitation?
              </p>
              <p className="text-sm text-blue-800 dark:text-blue-300">
                We can send an email invitation to {email}. They'll receive a link to create a free AretaCare account, and once they register, they'll automatically have access to this session.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep('enterEmail');
                  setError(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-sm"
              >
                Back
              </button>
              <button
                onClick={handleSendInvitation}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-primary-600 dark:bg-primary-700 text-white rounded hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50 text-sm font-medium"
              >
                {loading ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        )}

        {step === 'confirmTransfer' && userToTransfer && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                Transfer ownership to {userToTransfer.userName}?
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Session: {session.name}
              </p>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3">
              <p className="text-sm text-orange-900 dark:text-orange-200 mb-2 font-medium">
                This action will:
              </p>
              <ul className="text-sm text-orange-800 dark:text-orange-300 space-y-1.5 list-disc list-inside">
                <li>Make {userToTransfer.userName} the new session owner</li>
                <li>Give them full control (manage collaborators, rename, delete)</li>
                <li>Convert you to a collaborator (you can still access all data)</li>
                <li>You will no longer be able to manage the session</li>
              </ul>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-4 py-3">
              <p className="text-sm text-red-900 dark:text-red-200 font-bold">
                This cannot be undone unless they transfer it back to you.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep('view');
                  setUserToTransfer(null);
                  setError(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmTransferOwnership}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 disabled:opacity-50 text-sm font-medium"
              >
                {loading ? 'Transferring...' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        )}

        {step === 'warningMaxSessions' && userToWarn && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                Cannot Transfer Ownership
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {userToWarn.userName} has reached the session limit
              </p>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3">
              <p className="text-sm text-orange-900 dark:text-orange-200 mb-2 font-medium">
                {userToWarn.userName} already has 5 owned sessions.
              </p>
              <p className="text-sm text-orange-800 dark:text-orange-300">
                Each user can only own up to 5 sessions at a time. To transfer ownership to {userToWarn.userName}, they must first delete one of their existing owned sessions.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setStep('view');
                  setUserToWarn(null);
                  setError(null);
                }}
                className="px-4 py-2 bg-primary-600 dark:bg-primary-700 text-white rounded hover:bg-primary-700 dark:hover:bg-primary-600 text-sm font-medium"
              >
                OK
              </button>
            </div>
          </div>
        )}

        {step === 'confirmRemove' && userToRemove && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                Remove {userToRemove.userName}?
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                They will immediately lose access to this session
              </p>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-4 py-3">
              <p className="text-sm text-red-900 dark:text-red-200 mb-2 font-medium">
                {userToRemove.userName} will lose access to:
              </p>
              <ul className="text-sm text-red-800 dark:text-red-300 space-y-1.5 list-disc list-inside">
                <li>All conversations and messages</li>
                <li>Journal entries</li>
                <li>Uploaded documents</li>
                <li>Audio recordings</li>
                <li>Daily plans</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep('view');
                  setUserToRemove(null);
                  setError(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmRevokeAccess}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 text-sm font-medium"
              >
                {loading ? 'Removing...' : 'Remove Collaborator'}
              </button>
            </div>
          </div>
        )}

        {step === 'confirmLeave' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                Leave {session.name}?
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You will lose access to all data in this session
              </p>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3">
              <p className="text-sm text-orange-900 dark:text-orange-200 mb-2 font-medium">
                You will lose access to:
              </p>
              <ul className="text-sm text-orange-800 dark:text-orange-300 space-y-1.5 list-disc list-inside">
                <li>All conversations and messages</li>
                <li>Journal entries</li>
                <li>Uploaded documents</li>
                <li>Audio recordings</li>
                <li>Daily plans</li>
              </ul>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded px-4 py-3">
              <p className="text-sm text-blue-900 dark:text-blue-200">
                To regain access, the session owner must invite you again.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep('view');
                  setError(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmLeaveSession}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 disabled:opacity-50 text-sm font-medium"
              >
                {loading ? 'Leaving...' : 'Leave Session'}
              </button>
            </div>
          </div>
        )}

        {step === 'confirmCancelInvitation' && invitationToCancel && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                Cancel invitation to {invitationToCancel.email}?
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                They will no longer be able to use the invitation link
              </p>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3">
              <p className="text-sm text-orange-900 dark:text-orange-200">
                This will delete the invitation email link. If they try to use it, they won't be able to access this session.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep('view');
                  setInvitationToCancel(null);
                  setError(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmCancelInvitation}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 disabled:opacity-50 text-sm font-medium"
              >
                {loading ? 'Cancelling...' : 'Cancel Invitation'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8 lg:py-12 transition-colors duration-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Collaboration</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Manage collaborators for your sessions
          </p>
        </div>

        <div className="space-y-6">
          {/* Owned Sessions Section */}
          {ownedSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Your Sessions ({ownedSessions.length})
              </h2>
              <div className="space-y-3">
                {ownedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
                  >
                    <button
                      onClick={() => handleToggleSession(session.id)}
                      className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex-1 text-left">
                        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center space-x-2 flex-wrap">
                          <span>{session.name}</span>
                          {session.collaborators && session.collaborators.length > 0 && (
                            <span className="text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                              {session.collaborators.length} {session.collaborators.length === 1 ? 'Collaborator' : 'Collaborators'}
                            </span>
                          )}
                          {pendingInvitations[session.id] && pendingInvitations[session.id].length > 0 && (
                            <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">
                              {pendingInvitations[session.id].length} Pending
                            </span>
                          )}
                          {session.id === activeSessionId && (
                            <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded font-semibold">
                              Active
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Created {formatLocalDate(session.created_at)}
                        </p>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          expandedSessionId === session.id ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {expandedSessionId === session.id && renderCollaborationView(session)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shared Sessions Section */}
          {sharedSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Shared With You ({sharedSessions.length})
              </h2>
              <div className="space-y-3">
                {sharedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-blue-50 dark:bg-blue-900/10 rounded-lg shadow-sm border border-blue-200 dark:border-blue-800/50"
                  >
                    <button
                      onClick={() => handleToggleSession(session.id)}
                      className="w-full px-4 py-4 flex items-center justify-between hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <div className="flex-1 text-left">
                        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center space-x-2 flex-wrap">
                          <span>{session.name}</span>
                          {session.id === activeSessionId && (
                            <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded font-semibold">
                              Active
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Created {formatLocalDate(session.created_at)}
                        </p>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          expandedSessionId === session.id ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {expandedSessionId === session.id && (
                      <div className="px-4 py-3 bg-blue-100 dark:bg-blue-900/20 space-y-4">
                        {error && (
                          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/50 px-3 py-2 rounded">
                            {error}
                          </div>
                        )}
                        {success && (
                          <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/50 px-3 py-2 rounded">
                            {success}
                          </div>
                        )}

                        {step === 'view' ? (
                          <>
                            {/* Collaborators List (including owner, excluding current user) */}
                            <div>
                              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Collaborators ({(session.collaborators?.filter(c => c.user_id !== user?.id).length || 0) + 1})
                              </h4>
                              <div className="space-y-2">
                                {/* Show owner first */}
                                {session.owner_name && (
                                  <div className="flex items-start justify-between p-3 bg-white dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-700/50">
                                    <div className="flex-1 min-w-0 pr-4">
                                      <div className="text-sm font-medium text-gray-900 dark:text-white">{session.owner_name}</div>
                                      {session.owner_email && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{session.owner_email}</div>
                                      )}
                                    </div>
                                    <span className="text-xs bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded flex-shrink-0">
                                      Owner
                                    </span>
                                  </div>
                                )}

                                {/* Show other collaborators (excluding current user) */}
                                {session.collaborators && session.collaborators
                                  .filter(collab => collab.user_id !== user?.id)
                                  .map((collab) => (
                                    <div
                                      key={collab.user_id}
                                      className="flex items-start justify-between p-3 bg-white dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-700/50"
                                    >
                                      <div className="flex-1 min-w-0 pr-4">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{collab.name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{collab.email}</div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>

                            <button
                              onClick={handleLeaveSession}
                              disabled={loading}
                              className="w-full px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 text-sm font-medium"
                            >
                              {loading ? 'Leaving...' : 'Leave Session'}
                            </button>
                          </>
                        ) : step === 'confirmLeave' ? (
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                Leave {session.name}?
                              </h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                You will lose access to all data in this session
                              </p>
                            </div>

                            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3">
                              <p className="text-sm text-orange-900 dark:text-orange-200 mb-2 font-medium">
                                You will lose access to:
                              </p>
                              <ul className="text-sm text-orange-800 dark:text-orange-300 space-y-1.5 list-disc list-inside">
                                <li>All conversations and messages</li>
                                <li>Journal entries</li>
                                <li>Uploaded documents</li>
                                <li>Audio recordings</li>
                                <li>Daily plans</li>
                              </ul>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded px-4 py-3">
                              <p className="text-sm text-blue-900 dark:text-blue-200">
                                To regain access, the session owner must invite you again.
                              </p>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setStep('view');
                                  setError(null);
                                }}
                                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-sm"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={confirmLeaveSession}
                                disabled={loading}
                                className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 disabled:opacity-50 text-sm font-medium"
                              >
                                {loading ? 'Leaving...' : 'Leave Session'}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Sessions Message */}
          {ownedSessions.length === 0 && sharedSessions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                You don't have any sessions yet. Create a session from the main menu.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
