import React from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import Footer from '../components/Footer';
import { useTheme } from '../contexts/ThemeContext';
import { ORGANIZATION_JSON_LD, WEBSITE_JSON_LD } from '../constants/seo';
import logo from '../logos/large_logo.png';

const VALUE_PROPS = [
  {
    title: 'Work together as a care team',
    body: 'Invite up to nine family members or trusted caregivers into a care session. Everyone sees the same notes, files, and updates, and source tags show who added what so nothing falls through the cracks.',
  },
  {
    title: 'One organized home for everything',
    body: 'Notes, documents, audio recordings, and updates organized by care session so you can stop digging through folders, photos, and inboxes.',
  },
  {
    title: 'Coaching for the conversations that matter',
    body: 'Describe an upcoming appointment and get a tailored list of questions to ask, points to raise, and ways to phrase the hard parts.',
  },
  {
    title: 'AI support around the clock',
    body: 'Ask AretaCare anything, any time. Get help understanding a confusing term at midnight, walking through a discharge summary on a Sunday, or making sense of what your doctor told you last week.',
  },
];

const TRUST_CARDS = [
  {
    title: 'Encrypted end to end',
    body: 'Your data is encrypted in transit with HTTPS and at rest with AES-256. Documents, images, and audio sit in private AWS storage, reached only through short-lived signed URLs that expire in 15 minutes.',
  },
  {
    title: 'Never sold, never shared',
    body: 'We do not sell or share your information with hospitals, insurers, advertisers, or data brokers. All data sent to OpenAI for AI features is excluded from their model training. Delete anything at any time and it is gone from our active systems.',
  },
  {
    title: 'Strong account security',
    body: 'Passwords are hashed with bcrypt. Add a passkey, authenticator app, or backup codes for multi-factor sign in. Sessions time out after inactivity, and repeated failed attempts trigger a temporary lockout.',
  },
  {
    title: 'Open and auditable',
    body: "AretaCare's source code is published on GitHub. Your IT team, a security researcher, or you can review exactly how the platform stores and handles information.",
  },
];

const FAQ_HIGHLIGHTS = [
  {
    q: 'Is AretaCare free?',
    a: "The web app is completely free. The iOS app requires a subscription after a 7-day free trial to help cover the additional cost of building a native mobile experience.",
  },
  {
    q: 'Does AretaCare give medical advice?',
    a: "No. AretaCare helps you understand information and stay organized, but it does not diagnose conditions, recommend treatments, or serve as medical advice.",
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. Your data is encrypted in transit and at rest, with enterprise-grade edge security, hashed passwords, and optional multi-factor authentication.',
  },
  {
    q: 'Are AI models trained on my data?',
    a: 'No. We do not train our own models, and all data sent to OpenAI is excluded from their model training. When you delete your data, it is gone.',
  },
];

function Landing() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 flex flex-col">
      <SEO
        title="AI Healthcare Coach & Organizer for Patients & Families"
        description="AretaCare is an AI healthcare coach and organizer that helps patients and caregivers make sense of medical information, prepare for doctor visits, and keep care organized across family members."
        path="/"
        jsonLd={[ORGANIZATION_JSON_LD, WEBSITE_JSON_LD]}
      />

      <header className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-2">
        <nav className="flex items-center justify-between gap-3" aria-label="Primary">
          <Link to="/" className="flex items-center gap-3 sm:gap-4">
            <img src={logo} alt="AretaCare" width={64} height={64} className="w-12 h-12 sm:w-16 sm:h-16 object-contain" />
            <div>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight">AretaCare<span className="font-normal">™</span></p>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 tracking-wide">Calm | Clarity | Confidence</p>
            </div>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5 text-sm">
            <Link to="/about" className="hidden sm:inline text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">About</Link>
            <Link to="/register" className="hidden sm:inline text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Create account</Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold shadow-sm transition-colors"
            >
              Sign in
            </Link>
            <button
              onClick={toggleTheme}
              className="p-2 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </nav>
      </header>

      <div className="flex-1">
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-12 sm:pb-16">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white tracking-tight text-balance">
              Your healthcare coach and organizer
            </h1>
            <p className="mt-5 text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto text-balance">
              AretaCare coaches you through complex medical information, helps you prepare for doctor visits, and keeps everything organized in one place.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/login"
                className="inline-flex items-center justify-center px-7 py-3.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold text-base shadow-md transition-colors"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center justify-center px-7 py-3.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 font-semibold text-base hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Create free account
              </Link>
            </div>
            <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              Free on the web · Available on{' '}
              <a
                href="https://apps.apple.com/us/app/aretacare/id6759615710"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-700 dark:hover:text-gray-200"
              >
                iPhone
              </a>
            </p>
          </div>
        </section>

        <section aria-label="Important" className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
          <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-600 p-5 rounded-r-lg">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1.5">Important</h2>
                <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                  AretaCare is an AI assistant and does not provide medical advice, diagnosis, or treatment. Consult qualified healthcare professionals for medical decisions. This is a consumer tool, not a HIPAA-covered service or medical record system.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="how-it-helps" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 id="how-it-helps" className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-10">
            How AretaCare helps
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {VALUE_PROPS.map((vp) => (
              <article key={vp.title} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{vp.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{vp.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="free-tools" className="bg-white dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
            <h2 id="free-tools" className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-3">
              Free tools you can use right now
            </h2>
            <p className="text-center text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-10">
              No account required. Built for the moments where you have five minutes before walking into an appointment.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <Link
                to="/tools/jargon"
                className="block bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
              >
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Medical Jargon Translator</h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Plain-English explanations of any medical term, abbreviation, lab value, or diagnosis.
                </p>
                <span className="mt-4 inline-block text-primary-600 dark:text-primary-400 font-medium">Try it →</span>
              </Link>
              <Link
                to="/tools/coach"
                className="block bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
              >
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Conversation Coach</h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Tailored questions and talking points for your next doctor visit, hospital meeting, or hard family conversation.
                </p>
                <span className="mt-4 inline-block text-primary-600 dark:text-primary-400 font-medium">Try it →</span>
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="trust" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h2 id="trust" className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-3">
            Built to be trusted with sensitive information
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-10">
            Health information is some of the most personal data you have. Here is exactly what we do to keep it safe.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            {TRUST_CARDS.map((card) => (
              <article key={card.title} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{card.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq" className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
            <h2 id="faq" className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-10">
              Frequently asked questions
            </h2>
            <dl className="space-y-6">
              {FAQ_HIGHLIGHTS.map(({ q, a }) => (
                <div key={q} className="border-b border-gray-200 dark:border-gray-700 pb-6 last:border-none last:pb-0">
                  <dt className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{q}</dt>
                  <dd className="text-gray-600 dark:text-gray-300 leading-relaxed">{a}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-10 text-center">
              <Link to="/about" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
                Read more on the About page →
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="cta" className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
          <h2 id="cta" className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Ready to get organized?
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-xl mx-auto">
            Sign in to your account, or create one in a minute to start coaching and organizing your care.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold text-base shadow-md transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 font-semibold text-base hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Create free account
            </Link>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}

export default Landing;
