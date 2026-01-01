import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { authAPI } from '../../services/api';
import { startAuthentication } from '@simplewebauthn/browser';

function MFAChallenge({ mfaToken, mfaMethods, onSuccess, onCancel }) {
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // Auto-select method if only one available
  useEffect(() => {
    if (mfaMethods.length === 1) {
      setSelectedMethod(mfaMethods[0]);
    }
  }, [mfaMethods]);

  // Focus input when method is selected
  useEffect(() => {
    if (selectedMethod && selectedMethod !== 'passkey' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedMethod]);

  const handlePasskeyAuth = async () => {
    setLoading(true);
    setError('');

    try {
      // Get passkey authentication options from server
      const optionsResponse = await authAPI.getMFAPasskeyOptions(mfaToken);
      const options = optionsResponse.data.options;

      // Start WebAuthn authentication
      const credential = await startAuthentication(options);

      // Verify with server
      const response = await authAPI.verifyMFALogin({
        mfa_token: mfaToken,
        method: 'passkey',
        credential: credential,
        trust_device: trustDevice
      });

      onSuccess(response.data);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey authentication was cancelled or timed out.');
      } else if (err.name === 'NotSupportedError') {
        setError('Passkeys are not supported on this device.');
      } else {
        const detail = err.response?.data?.detail;
        if (typeof detail === 'string') {
          setError(detail);
        } else {
          setError('Passkey authentication failed.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await authAPI.verifyMFALogin({
        mfa_token: mfaToken,
        method: selectedMethod,
        code: code,
        trust_device: trustDevice
      });

      onSuccess(response.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        setError(detail);
      } else if (Array.isArray(detail)) {
        // Pydantic validation errors
        setError(detail.map(e => e.msg).join(', '));
      } else if (typeof detail === 'object') {
        setError(detail.message || detail.msg || 'Verification failed. Please try again.');
      } else {
        setError('Verification failed. Please try again.');
      }
      setCode('');
    } finally {
      setLoading(false);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden ring-1 ring-black/10 dark:ring-white/10">
        {/* Header */}
        <div className="bg-primary-600 dark:bg-primary-700 px-6 py-4">
          <h2 className="text-xl font-semibold text-white">Two-Factor Authentication</h2>
          <p className="text-primary-100 text-sm mt-1">
            Verify your identity to continue
          </p>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Trust Device Checkbox - shown on method selection */}
          {!selectedMethod && (
            <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(e) => setTrustDevice(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Trust this device for 30 days
                </span>
              </label>
            </div>
          )}

          {/* Method Selection */}
          {!selectedMethod && mfaMethods.length > 1 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Choose a verification method:
              </p>
              {mfaMethods.map((method) => (
                <button
                  key={method}
                  onClick={() => {
                    if (method === 'passkey') {
                      // Directly trigger passkey auth - no extra step needed
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
              {/* Trust Device - show when only passkey available */}
              {mfaMethods.length === 1 && (
                <div className="mb-2 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={trustDevice}
                      onChange={(e) => setTrustDevice(e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Trust this device for 30 days
                    </span>
                  </label>
                </div>
              )}
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full mb-4">
                  {loading ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-400"></div>
                  ) : (
                    <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                    </svg>
                  )}
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  {loading ? 'Waiting for passkey...' : 'Use your passkey to verify your identity.'}
                </p>
              </div>
              <button
                onClick={handlePasskeyAuth}
                disabled={loading}
                className="w-full btn-primary py-3"
              >
                {loading ? 'Verifying...' : 'Use Passkey'}
              </button>
            </div>
          )}

          {/* TOTP / Backup Code Input */}
          {(selectedMethod === 'totp' || selectedMethod === 'backup_code') && (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              {/* Trust Device - show when only one method available */}
              {mfaMethods.length === 1 && (
                <div className="mb-2 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={trustDevice}
                      onChange={(e) => setTrustDevice(e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Trust this device for 30 days
                    </span>
                  </label>
                </div>
              )}
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
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading || code.length < (selectedMethod === 'totp' ? 6 : 8)}
                className="w-full btn-primary py-3"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            </form>
          )}

          {/* Footer Actions */}
          <div className="mt-6 flex items-center justify-between">
            {selectedMethod && mfaMethods.length > 1 && (
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

MFAChallenge.propTypes = {
  mfaToken: PropTypes.string.isRequired,
  mfaMethods: PropTypes.arrayOf(PropTypes.string).isRequired,
  onSuccess: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default MFAChallenge;
