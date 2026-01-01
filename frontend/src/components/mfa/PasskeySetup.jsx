import { useState } from 'react';
import PropTypes from 'prop-types';
import { mfaAPI } from '../../services/api';
import { startRegistration } from '@simplewebauthn/browser';

function PasskeySetup({ onComplete, onCancel }) {
  const [step, setStep] = useState('intro'); // intro, naming, registering
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!deviceName.trim()) {
      setError('Please enter a name for this passkey');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Get registration options from server
      const optionsResponse = await mfaAPI.getPasskeyRegOptions();
      const options = optionsResponse.data.options;

      // Start WebAuthn registration
      const credential = await startRegistration(options);

      // Verify with server
      await mfaAPI.verifyPasskeyReg({
        credential,
        device_name: deviceName.trim()
      });

      onComplete();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey registration was cancelled or timed out.');
      } else if (err.name === 'NotSupportedError') {
        setError('Passkeys are not supported on this device or browser.');
      } else if (err.name === 'InvalidStateError') {
        setError('This passkey is already registered.');
      } else {
        setError(err.response?.data?.detail || err.message || 'Failed to register passkey. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const detectDeviceName = () => {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Android/.test(ua)) return 'Android Device';
    if (/Linux/.test(ua)) return 'Linux PC';
    return 'My Device';
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {step === 'intro' && (
        <>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full mb-4">
              <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Set Up Passkey
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Passkeys are a secure, phishing-resistant way to verify your identity using your device&apos;s biometrics or security key.
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Uses Face ID, Touch ID, or Windows Hello
              </span>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Cannot be phished or stolen
              </span>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Works across synced devices (iCloud, Google)
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              setDeviceName(detectDeviceName());
              setStep('naming');
            }}
            className="btn-primary w-full"
          >
            Continue
          </button>
        </>
      )}

      {step === 'naming' && (
        <>
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Name Your Passkey
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Give this passkey a name so you can identify it later
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Passkey Name
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g., MacBook Pro, iPhone"
              className="input"
              maxLength={100}
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('intro')}
              className="btn-secondary flex-1"
            >
              Back
            </button>
            <button
              onClick={handleRegister}
              disabled={loading || !deviceName.trim()}
              className="btn-primary flex-1"
            >
              {loading ? 'Registering...' : 'Register Passkey'}
            </button>
          </div>
        </>
      )}

      <button
        onClick={onCancel}
        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 w-full text-center"
      >
        Cancel Setup
      </button>
    </div>
  );
}

PasskeySetup.propTypes = {
  onComplete: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default PasskeySetup;
