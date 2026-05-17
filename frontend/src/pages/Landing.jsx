import React from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import Footer from '../components/Footer';
import { useTheme } from '../contexts/ThemeContext';
import logo from '../logos/large_logo.png';

const ICON_STROKE = 1.75;

const TeamIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={ICON_STROKE} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const FolderIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={ICON_STROKE} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  </svg>
);

const ChatIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={ICON_STROKE} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const ClockIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={ICON_STROKE} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LockIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={ICON_STROKE} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const ShieldIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={ICON_STROKE} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const KeyIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={ICON_STROKE} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
  </svg>
);

const CodeIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={ICON_STROKE} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
);

const TranslateIcon = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={ICON_STROKE} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const CoachIcon = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={ICON_STROKE} d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-8 8 8.94 8.94 0 01-4.2-1L3 20l1-5.2A8 8 0 1121 12z" />
  </svg>
);

const VALUE_PROPS = [
  {
    icon: TeamIcon,
    title: 'Work together in a care session',
    body: 'Invite up to nine family members or trusted caregivers into a care session. Everyone sees the same notes, files, and updates, and source tags show who added what so nothing falls through the cracks.',
  },
  {
    icon: FolderIcon,
    title: 'One organized home for everything',
    body: 'Notes, documents, audio recordings, and updates organized by care session so you can stop digging through folders, photos, and inboxes.',
  },
  {
    icon: ChatIcon,
    title: 'Coaching for the conversations that matter',
    body: 'Describe an upcoming appointment and get a tailored list of questions to ask, points to raise, and ways to phrase the hard parts.',
  },
  {
    icon: ClockIcon,
    title: 'Support around the clock',
    body: 'Ask AretaCare anything, any time. Get help understanding a confusing term at midnight, walking through a discharge summary on a Sunday, or making sense of what your doctor told you last week.',
  },
];

const TRUST_CARDS = [
  {
    icon: LockIcon,
    title: 'Encrypted end to end',
    body: 'Your data is encrypted in transit with HTTPS and at rest with AES-256. Documents, images, and audio sit in private AWS storage, reached only through short-lived signed URLs that expire in 15 minutes.',
  },
  {
    icon: ShieldIcon,
    title: 'Never sold, never shared',
    body: 'We do not sell or share your information with hospitals, insurers, advertisers, or data brokers. All data sent to OpenAI for AI features is excluded from their model training. Delete anything at any time and it is gone from our active systems.',
  },
  {
    icon: KeyIcon,
    title: 'Strong account security',
    body: 'Passwords are hashed with bcrypt. Add a passkey, authenticator app, or backup codes for multi-factor sign in. Sessions time out after inactivity, and repeated failed attempts trigger a temporary lockout.',
  },
  {
    icon: CodeIcon,
    title: 'Open and auditable',
    body: "AretaCare's source code is published on GitHub. Anyone can review exactly how the platform stores and handles information, and contribute suggestions to make it better.",
  },
];

const FAQ_HIGHLIGHTS = [
  {
    q: 'Is AretaCare free?',
    a: "The web app is completely free. The iOS app requires a subscription after a seven-day free trial to help cover the additional cost of building a native mobile experience.",
  },
  {
    q: 'Does AretaCare give medical advice?',
    a: "No. AretaCare helps you understand information and stay organized, but it does not provide medical advice, diagnosis, or treatment.",
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

const primaryBtn = "inline-flex items-center justify-center px-7 py-3.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold text-base shadow-lg shadow-primary-600/20 dark:shadow-primary-500/10 transition-all duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";

const secondaryBtn = "inline-flex items-center justify-center px-7 py-3.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 font-semibold text-base hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";

const sectionH2 = "text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white text-center";

function Landing() {
  const { toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 flex flex-col">
      <SEO />

      <div className="bg-gradient-to-b from-primary-50/40 to-transparent dark:from-primary-900/15 dark:to-transparent">
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
            <button
              onClick={toggleTheme}
              className="p-2 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
              aria-label="Toggle theme"
            >
              {/* Render both icons; CSS visibility flips based on <html>.dark
                  so the DOM is hydration-stable regardless of theme. */}
              <svg className="w-5 h-5 hidden dark:block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <svg className="w-5 h-5 block dark:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            </button>
          </div>
        </nav>
      </header>

        <section>
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 pb-16 sm:pb-20">
            <div className="text-center">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white tracking-tight text-balance">
                Your healthcare coach and organizer
              </h1>
              <p className="mt-5 text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto text-balance">
                AretaCare coaches you through complex medical information, helps you prepare for doctor visits, and keeps everything organized in one place.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/register" className={primaryBtn}>
                  Create free account
                </Link>
                <Link to="/login" className={secondaryBtn}>
                  Sign in
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
          </div>
        </section>
      </div>

      <div className="flex-1">
        <section aria-label="Important" className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-6">
          <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-600 p-5 rounded-r-lg shadow-sm">
            <div className="flex items-start">
              <svg className="w-6 h-6 text-amber-600 dark:text-amber-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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

        <section aria-labelledby="how-it-helps" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <h2 id="how-it-helps" className={`${sectionH2} mb-10`}>
            How AretaCare helps
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {VALUE_PROPS.map((vp) => (
              <article
                key={vp.title}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-gray-300 dark:hover:border-gray-600"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 flex items-center justify-center mb-4">
                  {vp.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{vp.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{vp.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="free-tools" className="bg-white dark:bg-gray-800">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
            <h2 id="free-tools" className={`${sectionH2} mb-3`}>
              Free tools you can use right now
            </h2>
            <p className="text-center text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-10">
              No account required. Built for the moments where you have five minutes before walking into an appointment.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <Link
                to="/tools/jargon"
                className="group block bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary-300 dark:hover:border-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
              >
                <div className="w-11 h-11 rounded-lg bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 flex items-center justify-center mb-4">
                  {TranslateIcon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Medical Jargon Translator</h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Plain-English explanations of any medical term, abbreviation, lab value, or diagnosis.
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 font-medium">
                  Try it
                  <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
                </span>
              </Link>
              <Link
                to="/tools/coach"
                className="group block bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary-300 dark:hover:border-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
              >
                <div className="w-11 h-11 rounded-lg bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 flex items-center justify-center mb-4">
                  {CoachIcon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Conversation Coach</h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Tailored questions and talking points for your next doctor visit, hospital meeting, or hard family conversation.
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 font-medium">
                  Try it
                  <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
                </span>
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="trust" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <h2 id="trust" className={`${sectionH2} mb-3`}>
            Built to be trusted with sensitive information
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-10">
            Health information is some of the most personal data you have. Here is exactly what we do to keep it safe.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            {TRUST_CARDS.map((card) => (
              <article
                key={card.title}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-gray-300 dark:hover:border-gray-600"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mb-4">
                  {card.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{card.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq" className="bg-white dark:bg-gray-800">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
            <h2 id="faq" className={`${sectionH2} mb-10`}>
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

        <section
          aria-labelledby="cta"
          className="bg-gradient-to-b from-gray-50 to-primary-50/50 dark:from-gray-900 dark:to-primary-900/20"
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24 text-center">
            <h2 id="cta" className={`${sectionH2} mb-4`}>
              Ready to get organized?
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-xl mx-auto">
              Create a free account in a minute to start coaching and organizing your care — or sign in to your existing one.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/register" className={primaryBtn}>
                Create free account
              </Link>
              <Link to="/login" className={secondaryBtn}>
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}

export default Landing;
