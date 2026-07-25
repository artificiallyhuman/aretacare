import logo from '../logos/large_logo.png';

/**
 * Full-screen branded splash shown on `/` while the initial auth check runs
 * for returning users (mirrors the iOS app's logo + tagline auth routing).
 * Rendered by AuthSwitchRoute instead of the marketing Landing page when a
 * returning-user hint is present.
 */
function AuthSplash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <img
          src={logo}
          alt="AretaCare"
          width={64}
          height={64}
          className="w-16 h-16 object-contain mx-auto"
        />
        <p className="mt-4 text-2xl font-bold text-gray-900 dark:text-white leading-tight">
          AretaCare<span className="font-normal">™</span>
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 tracking-wide">
          Calm | Clarity | Confidence
        </p>
        <div className="mt-6 animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
      </div>
    </div>
  );
}

export default AuthSplash;
