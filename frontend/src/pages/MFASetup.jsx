import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { mfaAPI } from '../services/api';
import TOTPSetup from '../components/mfa/TOTPSetup';
import PasskeySetup from '../components/mfa/PasskeySetup';
import BackupCodesDisplay from '../components/mfa/BackupCodesDisplay';
import SensitiveActionModal from '../components/mfa/SensitiveActionModal';

/**
 * Pull a displayable string out of a FastAPI error.
 *
 * Most endpoints return a plain-string `detail`, but the MFA step-up guard returns
 * `{ code, message }`. Passing that object straight into React state would crash the
 * render ("Objects are not valid as a React child"), so unwrap it here.
 */
const errorMessage = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  return fallback;
};

function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', danger = false }) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose}></div>
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{message}</p>
          <div className="mt-4 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                danger
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function MFASetup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mfaStatus, setMfaStatus] = useState(null);
  const [step, setStep] = useState('loading'); // loading, choose, totp, passkey, backup, complete, manage
  const [backupCodes, setBackupCodes] = useState([]);
  const [setupMethod, setSetupMethod] = useState(null); // 'totp' or 'passkey'
  const [generatingCodes, setGeneratingCodes] = useState(false);
  const [enablingMFA, setEnablingMFA] = useState(false);
  const [mfaActionModal, setMfaActionModal] = useState(null); // 'mfa_regenerate_backup_codes'

  useEffect(() => {
    loadMFAStatus();
  }, []);

  const loadMFAStatus = async () => {
    try {
      const response = await mfaAPI.getStatus();
      setMfaStatus(response.data);

      if (response.data.mfa_enabled) {
        setStep('manage');
      } else if (response.data.has_totp || response.data.passkey_count > 0) {
        // Has some methods set up but MFA not enabled yet
        setStep('manage');
      } else {
        setStep('choose');
      }
    } catch (err) {
      setError('Failed to load MFA status');
    } finally {
      setLoading(false);
    }
  };

  const handleMethodComplete = async (e, actionToken = null) => {
    // After setting up a method, generate backup codes.
    //
    // During first-time setup MFA isn't enabled yet, so the backend skips step-up.
    // But this same path runs when an already-protected user adds a second method
    // from the manage screen, and there regenerating codes needs verification.
    if (mfaStatus?.mfa_enabled && !actionToken) {
      setMfaActionModal('mfa_regenerate_backup_codes');
      return;
    }

    setGeneratingCodes(true);
    setError('');
    try {
      const config = actionToken ? { headers: { 'X-MFA-Action-Token': actionToken } } : {};

      const response = await mfaAPI.generateBackupCodes(config);
      setBackupCodes(response.data.codes);
      setStep('backup');
    } catch (err) {
      setError(errorMessage(err, 'Failed to generate backup codes'));
    } finally {
      setGeneratingCodes(false);
    }
  };

  const handleMfaActionSuccess = (actionToken) => {
    setMfaActionModal(null);
    handleMethodComplete(null, actionToken);
  };

  const handleBackupContinue = async () => {
    // Enable MFA with the preferred method
    setEnablingMFA(true);
    setError('');
    try {
      await mfaAPI.enableMFA(setupMethod);
      setStep('complete');
    } catch (err) {
      setError(errorMessage(err, 'Failed to enable MFA'));
    } finally {
      setEnablingMFA(false);
    }
  };

  const handleDisableMFA = async (password) => {
    try {
      await mfaAPI.disableMFA(password);
      await loadMFAStatus();
    } catch (err) {
      throw new Error(errorMessage(err, 'Failed to disable MFA'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Settings
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Two-Factor Authentication
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Add an extra layer of security to your account
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
            <button
              onClick={() => setError('')}
              className="float-right text-red-500 hover:text-red-700"
            >
              &times;
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 relative">
          {/* Choose Method */}
          {step === 'choose' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full mb-4">
                  <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Choose Your Method
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Select how you want to verify your identity
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setSetupMethod('passkey');
                    setStep('passkey');
                  }}
                  className="w-full flex items-start gap-4 p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="flex-shrink-0 w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">Passkey</span>
                      <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Use Face ID, Touch ID, or Windows Hello. Most secure and convenient.
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <button
                  onClick={() => {
                    setSetupMethod('totp');
                    setStep('totp');
                  }}
                  className="w-full flex items-start gap-4 p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-gray-900 dark:text-white">Authenticator App</span>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Use Google Authenticator, Authy, or another TOTP app.
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* TOTP Setup */}
          {step === 'totp' && (
            <>
              {generatingCodes && (
                <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 flex flex-col items-center justify-center rounded-xl z-10">
                  <svg className="animate-spin h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Generating backup codes...</p>
                </div>
              )}
              <TOTPSetup
                onComplete={handleMethodComplete}
                onCancel={() => setStep('choose')}
              />
            </>
          )}

          {/* Passkey Setup */}
          {step === 'passkey' && (
            <>
              {generatingCodes && (
                <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 flex flex-col items-center justify-center rounded-xl z-10">
                  <svg className="animate-spin h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Generating backup codes...</p>
                </div>
              )}
              <PasskeySetup
                onComplete={handleMethodComplete}
                onCancel={() => setStep('choose')}
              />
            </>
          )}

          {/* Backup Codes */}
          {step === 'backup' && (
            <BackupCodesDisplay
              codes={backupCodes}
              onContinue={handleBackupContinue}
              loading={enablingMFA}
            />
          )}

          {/* Complete */}
          {step === 'complete' && (
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Two-Factor Authentication Enabled
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Your account is now protected with an additional layer of security.
                </p>
              </div>
              <button
                onClick={() => navigate('/settings')}
                className="btn-primary"
              >
                Return to Settings
              </button>
            </div>
          )}

          {/* Manage Existing MFA */}
          {step === 'manage' && mfaStatus && (
            <MFAManage
              status={mfaStatus}
              onRefresh={loadMFAStatus}
              onDisable={handleDisableMFA}
              onSetupMore={() => setStep('choose')}
            />
          )}
        </div>
      </div>

      {/* MFA step-up for regenerating backup codes when adding a method to an
          account that already has MFA enabled */}
      {mfaActionModal && (
        <SensitiveActionModal
          actionType={mfaActionModal}
          onSuccess={handleMfaActionSuccess}
          onCancel={() => setMfaActionModal(null)}
        />
      )}
    </div>
  );
}

// Separate component for managing existing MFA settings
function MFAManage({ status, onRefresh, onDisable, onSetupMore }) {
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableError, setDisableError] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodes, setBackupCodes] = useState([]);
  const [passkeys, setPasskeys] = useState([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState([]);
  const [loadingTrustedDevices, setLoadingTrustedDevices] = useState(false);
  const [expandedCard, setExpandedCard] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { type, id?, name? }
  const [actionError, setActionError] = useState('');
  // MFA step-up for actions that weaken the account (removing a factor, minting
  // fresh backup codes). Mirrors the flow in Settings.jsx.
  const [mfaActionModal, setMfaActionModal] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // { type, id? }

  useEffect(() => {
    if (status.passkey_count > 0) {
      loadPasskeys();
    }
    loadTrustedDevices();
  }, [status.passkey_count]);

  const toggleCard = (card) => {
    setExpandedCard(expandedCard === card ? null : card);
  };

  const loadPasskeys = async () => {
    setLoadingPasskeys(true);
    try {
      const response = await mfaAPI.listPasskeys();
      setPasskeys(response.data.passkeys);
    } catch (err) {
      console.error('Failed to load passkeys:', err);
    } finally {
      setLoadingPasskeys(false);
    }
  };

  const loadTrustedDevices = async () => {
    setLoadingTrustedDevices(true);
    try {
      const response = await mfaAPI.listTrustedDevices();
      setTrustedDevices(response.data.devices);
    } catch (err) {
      console.error('Failed to load trusted devices:', err);
    } finally {
      setLoadingTrustedDevices(false);
    }
  };

  const handleRevokeTrustedDevice = async () => {
    const id = confirmModal?.id;
    setConfirmModal(null);
    setActionError('');
    try {
      await mfaAPI.revokeTrustedDevice(id);
      await loadTrustedDevices();
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to revoke device'));
    }
  };

  const handleRevokeAllTrustedDevices = async () => {
    setConfirmModal(null);
    setActionError('');
    try {
      await mfaAPI.revokeAllTrustedDevices();
      await loadTrustedDevices();
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to revoke devices'));
    }
  };

  const handleDeletePasskey = async (e, actionToken = null, passkeyId = null) => {
    // The confirm modal is cleared before the MFA step-up opens, so the id has to
    // travel through pendingAction rather than being re-read from confirmModal
    const id = passkeyId ?? confirmModal?.id;
    setConfirmModal(null);
    setActionError('');

    // If MFA is enabled and we don't have an action token, show the MFA modal
    if (status.mfa_enabled && !actionToken) {
      setPendingAction({ type: 'deletePasskey', id });
      setMfaActionModal('mfa_remove_passkey');
      return;
    }

    try {
      const config = actionToken ? { headers: { 'X-MFA-Action-Token': actionToken } } : {};

      await mfaAPI.deletePasskey(id, config);
      await loadPasskeys();
      onRefresh();
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to delete passkey'));
    }
  };

  const handleDeleteTOTP = async (e, actionToken = null) => {
    setConfirmModal(null);
    setActionError('');

    // If MFA is enabled and we don't have an action token, show the MFA modal
    if (status.mfa_enabled && !actionToken) {
      setPendingAction({ type: 'deleteTOTP' });
      setMfaActionModal('mfa_remove_totp');
      return;
    }

    try {
      const config = actionToken ? { headers: { 'X-MFA-Action-Token': actionToken } } : {};

      await mfaAPI.deleteTOTP(config);
      onRefresh();
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to delete TOTP'));
    }
  };

  const handleGenerateBackupCodes = async (e, actionToken = null) => {
    setActionError('');

    // If MFA is enabled and we don't have an action token, show the MFA modal
    if (status.mfa_enabled && !actionToken) {
      setPendingAction({ type: 'generateBackupCodes' });
      setMfaActionModal('mfa_regenerate_backup_codes');
      return;
    }

    try {
      const config = actionToken ? { headers: { 'X-MFA-Action-Token': actionToken } } : {};

      const response = await mfaAPI.generateBackupCodes(config);
      setBackupCodes(response.data.codes);
      setShowBackupCodes(true);
      onRefresh();
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to generate backup codes'));
    }
  };

  // Handler for MFA verification success
  const handleMfaActionSuccess = (actionToken) => {
    setMfaActionModal(null);

    // Execute the pending action with the token
    if (pendingAction?.type === 'deletePasskey') {
      handleDeletePasskey(null, actionToken, pendingAction.id);
    } else if (pendingAction?.type === 'deleteTOTP') {
      handleDeleteTOTP(null, actionToken);
    } else if (pendingAction?.type === 'generateBackupCodes') {
      handleGenerateBackupCodes(null, actionToken);
    }

    setPendingAction(null);
  };

  const handleMfaActionCancel = () => {
    setMfaActionModal(null);
    setPendingAction(null);
  };

  const handleDisable = async (e) => {
    e.preventDefault();
    setDisableLoading(true);
    setDisableError('');
    try {
      await onDisable(disablePassword);
      setShowDisableModal(false);
      setDisablePassword('');
    } catch (err) {
      setDisableError(err.message);
    } finally {
      setDisableLoading(false);
    }
  };

  // Helper component for summary cards
  const SummaryCard = ({ id, icon, title, status: cardStatus, statusColor, children }) => {
    const isExpanded = expandedCard === id;
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleCard(id)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400">
              {icon}
            </div>
            <div>
              <div className="font-medium text-gray-900 dark:text-white">{title}</div>
              <div className={`text-sm ${statusColor}`}>{cardStatus}</div>
            </div>
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Security Methods
        </h2>
        {status.mfa_enabled ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
            Protected
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
            Setup Required
          </span>
        )}
      </div>

      {/* Passkeys Card */}
      <SummaryCard
        id="passkeys"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
          </svg>
        }
        title="Passkeys"
        status={status.passkey_count > 0 ? `${status.passkey_count}/10 registered` : 'Not configured'}
        statusColor={status.passkey_count > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}
      >
        <div className="pt-3 space-y-2">
          {loadingPasskeys ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : passkeys.length > 0 ? (
            passkeys.map((passkey) => (
              <div key={passkey.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{passkey.device_name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Added {new Date(passkey.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={() => setConfirmModal({ type: 'deletePasskey', id: passkey.id, name: passkey.device_name })} className="text-red-600 dark:text-red-400 text-sm">
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No passkeys registered.</p>
          )}
          {status.passkey_count >= 10 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">Maximum passkeys reached</p>
          ) : (
            <button onClick={onSetupMore} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
              + Add passkey
            </button>
          )}
        </div>
      </SummaryCard>

      {/* Authenticator App Card */}
      <SummaryCard
        id="totp"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        }
        title="Authenticator App"
        status={status.has_totp ? 'Configured' : 'Not configured'}
        statusColor={status.has_totp ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}
      >
        <div className="pt-3">
          {status.has_totp ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">TOTP is active</span>
              <button onClick={() => setConfirmModal({ type: 'deleteTOTP' })} className="text-red-600 dark:text-red-400 text-sm">
                Remove
              </button>
            </div>
          ) : (
            <button onClick={onSetupMore} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
              + Set up authenticator
            </button>
          )}
        </div>
      </SummaryCard>

      {/* Backup Codes Card */}
      <SummaryCard
        id="backup"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        }
        title="Backup Codes"
        status={`${status.backup_codes_remaining} remaining`}
        statusColor={status.backup_codes_remaining > 3 ? 'text-green-600 dark:text-green-400' : status.backup_codes_remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}
      >
        <div className="pt-3 flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {status.backup_codes_remaining > 0 ? 'Use these if you lose access to other methods' : 'No backup codes available'}
          </span>
          <button onClick={handleGenerateBackupCodes} className="text-primary-600 dark:text-primary-400 text-sm">
            Regenerate
          </button>
        </div>
      </SummaryCard>

      {/* Trusted Devices Card */}
      <SummaryCard
        id="devices"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
        title="Trusted Devices"
        status={trustedDevices.length > 0 ? `${trustedDevices.length} device${trustedDevices.length !== 1 ? 's' : ''}` : 'None'}
        statusColor="text-gray-500 dark:text-gray-400"
      >
        <div className="pt-3 space-y-2">
          {loadingTrustedDevices ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : trustedDevices.length > 0 ? (
            <>
              {trustedDevices.map((device) => (
                <div key={device.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {device.device_name || 'Unknown Device'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Until {new Date(device.trusted_until).toLocaleDateString()}
                    </div>
                  </div>
                  <button onClick={() => setConfirmModal({ type: 'revokeDevice', id: device.id, name: device.device_name })} className="text-red-600 dark:text-red-400 text-sm ml-2">
                    Revoke
                  </button>
                </div>
              ))}
              {trustedDevices.length > 1 && (
                <button onClick={() => setConfirmModal({ type: 'revokeAllDevices' })} className="text-sm text-red-600 dark:text-red-400 hover:underline">
                  Revoke all devices
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No trusted devices. Trust a device during login to skip 2FA for 30 days.
            </p>
          )}
        </div>
      </SummaryCard>

      {/* Disable MFA */}
      {status.mfa_enabled && (
        <div className="pt-2">
          <button
            onClick={() => setShowDisableModal(true)}
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm w-full text-center"
          >
            Disable Two-Factor Authentication
          </button>
        </div>
      )}

      {/* Disable Modal */}
      {showDisableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Disable Two-Factor Authentication
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              This will remove all security methods from your account. Enter your password to confirm.
            </p>

            {disableError && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                {disableError}
              </div>
            )}

            <form onSubmit={handleDisable}>
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Enter your password"
                className="input mb-4"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDisableModal(false);
                    setDisablePassword('');
                    setDisableError('');
                  }}
                  className="btn-secondary flex-1"
                  disabled={disableLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disableLoading || !disablePassword}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {disableLoading ? 'Disabling...' : 'Disable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Action Error Display */}
      {actionError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>
        </div>
      )}

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={confirmModal?.type === 'revokeDevice'}
        onClose={() => setConfirmModal(null)}
        onConfirm={handleRevokeTrustedDevice}
        title="Revoke Trusted Device"
        message={`Are you sure you want to revoke trust for "${confirmModal?.name || 'this device'}"? You will need to verify again on your next login from this device.`}
        confirmText="Revoke"
        danger
      />

      <ConfirmModal
        isOpen={confirmModal?.type === 'revokeAllDevices'}
        onClose={() => setConfirmModal(null)}
        onConfirm={handleRevokeAllTrustedDevices}
        title="Revoke All Trusted Devices"
        message="Are you sure you want to revoke trust for all devices? You will need to verify again on your next login from any device."
        confirmText="Revoke All"
        danger
      />

      <ConfirmModal
        isOpen={confirmModal?.type === 'deletePasskey'}
        onClose={() => setConfirmModal(null)}
        onConfirm={handleDeletePasskey}
        title="Remove Passkey"
        message={`Are you sure you want to remove the passkey "${confirmModal?.name || 'this passkey'}"?`}
        confirmText="Remove"
        danger
      />

      <ConfirmModal
        isOpen={confirmModal?.type === 'deleteTOTP'}
        onClose={() => setConfirmModal(null)}
        onConfirm={handleDeleteTOTP}
        title="Remove Authenticator App"
        message="Are you sure you want to remove your authenticator app? You will no longer be able to use it for verification."
        confirmText="Remove"
        danger
      />

      {/* MFA Sensitive Action Modal */}
      {mfaActionModal && (
        <SensitiveActionModal
          actionType={mfaActionModal}
          onSuccess={handleMfaActionSuccess}
          onCancel={handleMfaActionCancel}
        />
      )}

      {/* Backup Codes Modal */}
      {showBackupCodes && backupCodes.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
            <BackupCodesDisplay
              codes={backupCodes}
              onContinue={() => setShowBackupCodes(false)}
              showRegenerate={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

MFAManage.propTypes = {
  status: PropTypes.object.isRequired,
  onRefresh: PropTypes.func.isRequired,
  onDisable: PropTypes.func.isRequired,
  onSetupMore: PropTypes.func.isRequired,
};

export default MFASetup;
