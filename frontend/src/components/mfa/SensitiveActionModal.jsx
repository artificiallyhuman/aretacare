import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { mfaAPI, authAPI } from '../../services/api';
import { startAuthentication } from '@simplewebauthn/browser';

function SensitiveActionModal({ actionType, onSuccess, onCancel }) {
  const [mfaStatus, setMfaStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef(null);

  // Load MFA status
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await mfaAPI.getStatus();
        setMfaStatus(response.data);

        // Auto-select if only one method available
        const methods = [];
        if (response.data.has_passkeys) methods.push('passkey');
        if (response.data.has_totp) methods.push('totp');
        if (response.data.backup_codes_remaining > 0) methods.push('backup_code');

        if (methods.length === 1) {
          const method = methods[0];
          setSelectedMethod(method);
          // Auto-trigger passkey if it's the only method
          if (method === 'passkey') {
            // Use setTimeout to ensure state is updated first
            setTimeout(() => handlePasskeyAuth(), 0);
          }
        }
      } catch (err) {
        setError('Failed to load MFA status');
      } finally {
        setLoading(false);
      }
    };
    loadStatus();
  }, []);

  // Focus input when method selected
  useEffect(() => {
    if (selectedMethod && selectedMethod !== 'passkey' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedMethod]);

  const getActionLabel = () => {
    switch (actionType) {
      case 'password_change':
        return 'change your password';
      case 'email_change':
        return 'change your email';
      case 'account_delete':
        return 'delete your account';
      default:
        return 'complete this action';
    }
  };

  const getAvailableMethods = () => {
    if (!mfaStatus) return [];
    const methods = [];
    if (mfaStatus.has_passkeys) methods.push('passkey');
    if (mfaStatus.has_totp) methods.push('totp');
    if (mfaStatus.backup_codes_remaining > 0) methods.push('backup_code');
    return methods;
  };

  const handlePasskeyAuth = async () => {
    setVerifying(true);
    setError('');

    try {
      // Get passkey authentication options
      const optionsResponse = await mfaAPI.getPasskeyAuthOptions();
      const options = optionsResponse.data.options;

      // Start WebAuthn authentication
      const credential = await startAuthentication(options);

      // Verify and get action token
      const response = await mfaAPI.verifyForAction({
        method: 'passkey',
        action_type: actionType,
        credential: credential
      });

      onSuccess(response.data.action_token);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey authentication was cancelled or timed out.');
      } else if (err.name === 'NotSupportedError') {
        setError('Passkeys are not supported on this device.');
      } else {
        setError(err.response?.data?.detail || 'Verification failed. Please try again.');
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setVerifying(true);
    setError('');

    try {
      const response = await mfaAPI.verifyForAction({
        method: selectedMethod,
        action_type: actionType,
        code: code
      });

      onSuccess(response.data.action_token);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'object' && detail?.message) {
        setError(detail.message);
      } else {
        setError(detail || 'Verification failed. Please try again.');
      }
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const getMethodLabel = (method) => {
    switch (method) {
      case 'passkey':
        return 'Passkey';
      case 'totp':
        return 'Authenticator App';
      case 'backup_code':
        return 'Backup Code';
      default:
        return method;
    }
  };

  const getMethodIcon = (method) => {
    switch (method) {
      case 'passkey':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
          </svg>
        );
      case 'totp':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        );
      case 'backup_code':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  const availableMethods = getAvailableMethods();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-amber-500 dark:bg-amber-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Verify Your Identity</h2>
              <p className="text-amber-100 text-sm">
                Security verification required
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            To {getActionLabel()}, please verify your identity using one of your security methods.
          </p>

          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Method Selection */}
          {!selectedMethod && availableMethods.length > 1 && (
            <div className="space-y-3">
              {availableMethods.map((method) => (
                <button
                  key={method}
                  onClick={() => {
                    if (method === 'passkey') {
                      setSelectedMethod(method);
                      handlePasskeyAuth();
                    } else {
                      setSelectedMethod(method);
                    }
                  }}
                  className="w-full flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="text-primary-600 dark:text-primary-400">
                    {getMethodIcon(method)}
                  </div>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {getMethodLabel(method)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Passkey Authentication */}
          {selectedMethod === 'passkey' && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full mb-4">
                  {verifying ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-400"></div>
                  ) : (
                    <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                    </svg>
                  )}
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  {verifying ? 'Waiting for passkey...' : 'Use your passkey to verify your identity.'}
                </p>
              </div>
              <button
                onClick={handlePasskeyAuth}
                disabled={verifying}
                className="w-full btn-primary py-3"
              >
                {verifying ? 'Verifying...' : 'Use Passkey'}
              </button>
            </div>
          )}

          {/* TOTP / Backup Code Input */}
          {(selectedMethod === 'totp' || selectedMethod === 'backup_code') && (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {selectedMethod === 'totp'
                    ? 'Enter the 6-digit code from your authenticator app'
                    : 'Enter one of your backup codes'}
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={selectedMethod === 'totp' ? '000000' : 'XXXXXXXX'}
                  className="input text-center text-2xl tracking-widest font-mono"
                  maxLength={selectedMethod === 'totp' ? 6 : 8}
                  autoComplete="one-time-code"
                  disabled={verifying}
                />
              </div>
              <button
                type="submit"
                disabled={verifying || code.length < (selectedMethod === 'totp' ? 6 : 8)}
                className="w-full btn-primary py-3"
              >
                {verifying ? 'Verifying...' : 'Verify'}
              </button>
            </form>
          )}

          {/* Footer Actions */}
          <div className="mt-6 flex items-center justify-between">
            {selectedMethod && availableMethods.length > 1 && (
              <button
                onClick={() => {
                  setSelectedMethod(null);
                  setCode('');
                  setError('');
                }}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Use a different method
              </button>
            )}
            <button
              onClick={onCancel}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 ml-auto"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

SensitiveActionModal.propTypes = {
  actionType: PropTypes.oneOf(['password_change', 'email_change', 'account_delete']).isRequired,
  onSuccess: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default SensitiveActionModal;
