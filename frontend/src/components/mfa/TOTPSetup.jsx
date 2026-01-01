import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { QRCodeSVG } from 'qrcode.react';
import { mfaAPI } from '../../services/api';

function TOTPSetup({ onComplete, onCancel }) {
  const [step, setStep] = useState('loading'); // loading, qr, verify
  const [secret, setSecret] = useState('');
  const [provisioningUri, setProvisioningUri] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const initSetup = async () => {
      try {
        const response = await mfaAPI.setupTOTP();
        setSecret(response.data.secret);
        setProvisioningUri(response.data.provisioning_uri);
        setStep('qr');
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to initialize TOTP setup');
        setStep('error');
      }
    };
    initSetup();
  }, []);

  useEffect(() => {
    if (step === 'verify' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [step]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await mfaAPI.verifyTOTPSetup(code);
      onComplete();
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid code. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
        <button onClick={onCancel} className="btn-secondary w-full">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {step === 'qr' && (
        <>
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Set Up Authenticator App
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </p>
          </div>

          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <QRCodeSVG
                value={provisioningUri}
                size={192}
                level="M"
                includeMargin={false}
              />
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Manual Entry Key
              </span>
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
              >
                {showSecret ? 'Hide' : 'Show'}
              </button>
            </div>
            {showSecret ? (
              <code className="block text-sm font-mono bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-600 break-all">
                {secret}
              </code>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                Click "Show" to reveal the secret key
              </div>
            )}
          </div>

          <button
            onClick={() => setStep('verify')}
            className="btn-primary w-full"
          >
            Continue
          </button>
        </>
      )}

      {step === 'verify' && (
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Verify Setup
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="input text-center text-2xl tracking-widest font-mono"
            maxLength={6}
            autoComplete="one-time-code"
            disabled={loading}
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('qr')}
              className="btn-secondary flex-1"
              disabled={loading}
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="btn-primary flex-1"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </form>
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

TOTPSetup.propTypes = {
  onComplete: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default TOTPSetup;
