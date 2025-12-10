import { useState, useEffect } from 'react';
import { sessionAPI } from '../services/api';

export default function CollaborationModal({ session, onClose, onSuccess }) {
  const [step, setStep] = useState('view'); // 'view', 'enterEmail', 'confirm', 'confirmInvitation', 'confirmTransfer', 'warningMaxSessions', 'confirmRemove', 'confirmLeave', 'confirmCancelInvitation'
  const [email, setEmail] = useState('');
  const [userToAdd, setUserToAdd] = useState(null);
  const [userToTransfer, setUserToTransfer] = useState(null); // { userId, userName }
  const [userToWarn, setUserToWarn] = useState(null); // { userName } for max sessions warning
  const [userToRemove, setUserToRemove] = useState(null); // { userId, userName } for remove confirmation
  const [invitationToCancel, setInvitationToCancel] = useState(null); // { invitationId, email } for cancel confirmation
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const collaborators = session.collaborators || [];
  const isOwner = session.is_owner;

  // Fetch pending invitations when modal opens (only if owner)
  useEffect(() => {
    if (isOwner && step === 'view') {
      fetchPendingInvitations();
    }
  }, [isOwner, step]);

  const fetchPendingInvitations = async () => {
    try {
      const response = await sessionAPI.getPendingInvitations(session.id);
      setPendingInvitations(response.data || []);
    } catch (err) {
      console.error('Failed to fetch pending invitations:', err);
    }
  };

  const handleCheckUser = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await sessionAPI.checkUser(session.id, email);
      const data = response.data;

      if (!data.exists) {
        // User doesn't exist, ask if they want to send an invitation
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

  const handleRevokeAccess = (userId, userName) => {
    setUserToRemove({ userId, userName });
    setStep('confirmRemove');
  };

  const confirmRevokeAccess = async () => {
    if (!userToRemove) return;

    setError(null);
    setLoading(true);

    try {
      await sessionAPI.revokeAccess(session.id, userToRemove.userId);
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

  const handleLeaveSession = () => {
    setStep('confirmLeave');
  };

  const confirmLeaveSession = async () => {
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

  const handleTransferOwnership = (userId, userName, ownedSessionCount) => {
    if (ownedSessionCount >= 3) {
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
      await sessionAPI.transferOwnership(session.id, userToTransfer.userId);
      setSuccess(`Ownership transferred to ${userToTransfer.userName}!`);
      setTimeout(() => {
        onSuccess();
        onClose();
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
      await sessionAPI.sendInvitation(session.id, email);
      setSuccess('Invitation sent successfully!');
      setTimeout(() => {
        setStep('view');
        setEmail('');
        fetchPendingInvitations(); // Refresh the list
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

  const confirmCancelInvitation = async () => {
    if (!invitationToCancel) return;

    setError(null);
    setLoading(true);

    try {
      await sessionAPI.cancelInvitation(session.id, invitationToCancel.invitationId);
      setSuccess('Invitation cancelled successfully!');
      fetchPendingInvitations(); // Refresh the list
      setTimeout(() => {
        setStep('view');
        setInvitationToCancel(null);
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to cancel invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {step === 'view' && 'Manage Collaborators'}
              {step === 'enterEmail' && 'Share Session'}
              {step === 'confirm' && 'Confirm Sharing'}
              {step === 'confirmInvitation' && 'Send Invitation'}
              {step === 'confirmTransfer' && 'Transfer Ownership'}
              {step === 'warningMaxSessions' && 'Cannot Transfer'}
              {step === 'confirmRemove' && 'Remove Collaborator'}
              {step === 'confirmLeave' && 'Leave Session'}
              {step === 'confirmCancelInvitation' && 'Cancel Invitation'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-4">
          {error && (
            <div className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/50 px-3 py-2 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/50 px-3 py-2 rounded">
              {success}
            </div>
          )}

          {step === 'view' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Session: {session.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {isOwner ? 'You are the owner of this session.' : 'You are a collaborator on this session.'}
                </p>
              </div>

              {collaborators.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Collaborators ({collaborators.length}/9)
                  </h3>
                  <div className="space-y-2">
                    {collaborators.map((collab) => (
                      <div
                        key={collab.user_id}
                        className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{collab.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{collab.email}</div>
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            Added {new Date(collab.added_at).toLocaleDateString()}
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

              {collaborators.length === 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No collaborators yet.
                </div>
              )}

              {isOwner && pendingInvitations.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Pending Invitations ({pendingInvitations.length})
                  </h3>
                  <div className="space-y-2">
                    {pendingInvitations.map((invitation) => {
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
                              Sent {new Date(invitation.created_at).toLocaleDateString()}
                            </div>
                            <div className={`text-xs font-medium mt-1 ${isExpiringSoon ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'}`}>
                              {daysRemaining === 0 ? 'Expires today' : `Expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`}
                            </div>
                          </div>
                          <button
                            onClick={() => handleCancelInvitation(invitation.id, invitation.email)}
                            disabled={loading}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-white hover:bg-red-600 dark:hover:bg-red-500 border border-red-600 dark:border-red-400 rounded disabled:opacity-50 transition-colors whitespace-nowrap flex-shrink-0"
                          >
                            Cancel
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                {isOwner && collaborators.length < 9 && (
                  <button
                    onClick={() => setStep('enterEmail')}
                    className="flex-1 px-4 py-2 bg-primary-600 dark:bg-primary-700 text-white rounded hover:bg-primary-700 dark:hover:bg-primary-600"
                  >
                    Add Collaborator
                  </button>
                )}
                {!isOwner && (
                  <button
                    onClick={handleLeaveSession}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50"
                  >
                    {loading ? 'Leaving...' : 'Leave Session'}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Close
                </button>
              </div>
            </div>
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

              <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 rounded px-3 py-2">
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  <strong>Note:</strong> There's no limit to how many collaborations someone can join. The 3-session limit only applies to owned sessions.
                </p>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setStep('view');
                    setEmail('');
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-primary-600 dark:bg-primary-700 text-white rounded hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50"
                >
                  {loading ? 'Checking...' : 'Continue'}
                </button>
              </div>
            </form>
          )}

          {step === 'confirm' && userToAdd && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Share with: {userToAdd.name}
                </h3>
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
                  <li>Your other sessions will remain private</li>
                  <li>Only the session owner (you) can delete the session</li>
                  <li>You can revoke their access at any time</li>
                </ul>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-3 py-2">
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  Only share this session if you know and trust {userToAdd.name} with sensitive medical information.
                </p>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setStep('enterEmail');
                    setUserToAdd(null);
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Back
                </button>
                <button
                  onClick={handleShareSession}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-primary-600 dark:bg-primary-700 text-white rounded hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50"
                >
                  {loading ? 'Sharing...' : 'Confirm & Share'}
                </button>
              </div>
            </div>
          )}

          {step === 'confirmTransfer' && userToTransfer && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Transfer ownership to {userToTransfer.userName}?
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Session: {session.name}
                  </p>
                </div>
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

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setStep('view');
                    setUserToTransfer(null);
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmTransferOwnership}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 disabled:opacity-50 font-medium"
                >
                  {loading ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </div>
          )}

          {step === 'warningMaxSessions' && userToWarn && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Cannot Transfer Ownership
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {userToWarn.userName} has reached the session limit
                  </p>
                </div>
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3">
                <p className="text-sm text-orange-900 dark:text-orange-200 mb-2 font-medium">
                  {userToWarn.userName} already has 3 owned sessions.
                </p>
                <p className="text-sm text-orange-800 dark:text-orange-300">
                  Each user can only own up to 3 sessions at a time. To transfer ownership to {userToWarn.userName}, they must first delete one of their existing owned sessions.
                </p>
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setStep('view');
                    setUserToWarn(null);
                    setError(null);
                  }}
                  className="px-4 py-2 bg-primary-600 dark:bg-primary-700 text-white rounded hover:bg-primary-700 dark:hover:bg-primary-600 font-medium"
                >
                  OK
                </button>
              </div>
            </div>
          )}

          {step === 'confirmRemove' && userToRemove && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Remove {userToRemove.userName}?
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    They will immediately lose access to this session
                  </p>
                </div>
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

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setStep('view');
                    setUserToRemove(null);
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRevokeAccess}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 font-medium"
                >
                  {loading ? 'Removing...' : 'Remove Collaborator'}
                </button>
              </div>
            </div>
          )}

          {step === 'confirmLeave' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Leave {session.name}?
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    You will lose access to all data in this session
                  </p>
                </div>
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

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setStep('view');
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLeaveSession}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 disabled:opacity-50 font-medium"
                >
                  {loading ? 'Leaving...' : 'Leave Session'}
                </button>
              </div>
            </div>
          )}

          {step === 'confirmInvitation' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    No AretaCare Account Found
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {email} doesn't have an AretaCare account yet
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded px-4 py-3">
                <p className="text-sm text-blue-900 dark:text-blue-200 mb-2 font-medium">
                  Send an invitation?
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  We can send an email invitation to {email}. They'll receive a link to create a free AretaCare account, and once they register, they'll automatically have access to this session.
                </p>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/50 border border-yellow-200 dark:border-yellow-800 rounded px-3 py-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-300 mb-2">
                  <strong>⚠️ Important:</strong> After they create an account, they will have full access to:
                </p>
                <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
                  <li>All data for "{session.name}"</li>
                  <li>Conversations, journal entries, documents, and audio recordings</li>
                  <li>They will be able to add, edit, and delete content in this session</li>
                  <li>You can revoke their access at any time after they join</li>
                </ul>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setStep('enterEmail');
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Back
                </button>
                <button
                  onClick={handleSendInvitation}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-primary-600 dark:bg-primary-700 text-white rounded hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </div>
          )}

          {step === 'confirmCancelInvitation' && invitationToCancel && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Cancel invitation to {invitationToCancel.email}?
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    They will no longer be able to use the invitation link
                  </p>
                </div>
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3">
                <p className="text-sm text-orange-900 dark:text-orange-200">
                  This will delete the invitation email link. If they try to use it, they won't be able to access this session.
                </p>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setStep('view');
                    setInvitationToCancel(null);
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Back
                </button>
                <button
                  onClick={confirmCancelInvitation}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 disabled:opacity-50 font-medium"
                >
                  {loading ? 'Cancelling...' : 'Cancel Invitation'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
