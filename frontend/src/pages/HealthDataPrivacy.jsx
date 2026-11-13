import React from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';

// Consumer Health Data Privacy Policy: the separate policy Washington's My Health My Data
// Act requires (RCW 19.373.020), also covering Nevada SB 370 and Connecticut's consumer
// health data rules. Linked from the site footer (homepage + app), sign-up, sign-in, the AI
// consent screen, and iOS Settings. Keep it in step with PrivacyPolicy.jsx §6, §8 and §13.

const h2 = 'text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800';
const h3 = 'text-lg font-semibold text-gray-900 dark:text-white mb-3';
const p = 'text-gray-700 dark:text-gray-300 leading-relaxed text-base';
const ul = 'list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4';
const a = 'text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium underline';

const PROCESSORS = [
  {
    name: 'OpenAI',
    role: 'AI features: chat replies, transcription, journal entries, Daily Digests, Health Profile suggestions, and Talk voice conversations (iOS).',
    contact: 'https://openai.com/policies/privacy-policy/',
  },
  {
    name: 'Amazon Web Services (AWS)',
    role: 'Stores the documents, images, and audio recordings you upload (encrypted at rest).',
    contact: 'https://aws.amazon.com/privacy/',
  },
  {
    name: 'Render',
    role: 'Hosts AretaCare’s servers and database.',
    contact: 'https://render.com/privacy',
  },
  {
    name: 'Cloudflare',
    role: 'Network security. All traffic to AretaCare passes through Cloudflare, which protects the service from attacks.',
    contact: 'https://www.cloudflare.com/privacypolicy/',
  },
];

const HealthDataPrivacy = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <SEO />
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mb-6 font-medium transition-colors group">
            <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to home
          </Link>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-2">Consumer Health Data Privacy Policy</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Last Updated: November 13, 2026</p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 sm:p-10 space-y-10">
          <section>
            <h2 className={h2}>1. About This Policy</h2>
            <div className="space-y-4">
              <p className={p}>
                This policy explains how AretaCare LLC collects, uses, shares, and deletes consumer health data, and the rights you have over it. It is written to meet Washington&rsquo;s My Health My Data Act and the similar laws in Nevada and Connecticut. Residents of those states have these rights by law; we give the same rights to every AretaCare user.
              </p>
              <p className={p}>
                It adds to our{' '}
                <Link to="/privacy" className={a}>Privacy Policy</Link>, which covers everything else, including account information, email, and security.
              </p>
            </div>
          </section>

          <section>
            <h2 className={h2}>2. Consumer Health Data We Collect</h2>
            <div className="space-y-4">
              <p className={p}>
                Consumer health data is information that identifies you, or the person you care for, and relates to past, present, or future physical or mental health. In AretaCare that is most of what you add:
              </p>
              <ul className={ul}>
                <li>Messages you send in chat, and AretaCare&rsquo;s replies</li>
                <li>Care Journal entries and Daily Digests</li>
                <li>The Health Profile: conditions, medications, allergies, care providers, caregivers, and care preferences</li>
                <li>Documents and photos you upload (such as medical records, test results, bills, and forms) and the text extracted from them</li>
                <li>Audio recordings and their transcripts, including recordings and transcripts of Talk voice conversations in the iOS app</li>
                <li>What AretaCare&rsquo;s AI derives from the above, such as journal entries, summaries, and suggested Health Profile changes</li>
              </ul>
              <p className={p}>
                We don&rsquo;t collect your precise location, and AretaCare doesn&rsquo;t connect to health devices or wearables.
              </p>
            </div>
          </section>

          <section>
            <h2 className={h2}>3. Why We Collect It and How We Use It</h2>
            <div className="space-y-4">
              <p className={p}>We use consumer health data only to provide the service you ask for:</p>
              <ul className={ul}>
                <li>To organize, summarize, and explain the information you give us, in chat and in Talk</li>
                <li>To transcribe audio and read documents you upload</li>
                <li>To write Care Journal entries and Daily Digests and to suggest Health Profile updates for your review</li>
                <li>To show a care session&rsquo;s content to the people you invite to it</li>
                <li>To keep the service secure and working, and to meet legal obligations</li>
              </ul>
              <p className={p}>
                We don&rsquo;t use it for advertising, we don&rsquo;t sell it, we don&rsquo;t turn it into de-identified or aggregate data for anyone else, and we don&rsquo;t use it to make decisions about you that have legal or similarly significant effects.
              </p>
            </div>
          </section>

          <section>
            <h2 className={h2}>4. Where It Comes From</h2>
            <ul className={ul}>
              <li>You: what you type, say, record, or upload</li>
              <li>People you invite to a care session, who can add to it</li>
              <li>Records you upload that came from others, such as your care team</li>
              <li>AretaCare&rsquo;s AI, which derives summaries and suggestions from the above</li>
            </ul>
          </section>

          <section>
            <h2 className={h2}>5. Who We Share It With</h2>
            <div className="space-y-6">
              <div>
                <h3 className={h3}>People you choose</h3>
                <p className={p}>
                  Everyone you add to a care session (up to 10 people) can see everything in it. You decide who that is, and the owner can remove people at any time.
                </p>
              </div>

              <div>
                <h3 className={h3}>Service providers that process it for us</h3>
                <p className={`${p} mb-3`}>
                  These companies process consumer health data only to run AretaCare, under their terms with us. Each one&rsquo;s privacy page explains how to contact it.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {PROCESSORS.map((processor) => (
                    <div key={processor.name} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-5 border border-gray-200 dark:border-gray-600">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-2">{processor.name}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{processor.role}</p>
                      <a href={processor.contact} target="_blank" rel="noopener noreferrer" className={`text-sm ${a}`}>
                        Privacy and contact
                      </a>
                    </div>
                  ))}
                </div>
                <p className={`${p} mt-3`}>
                  OpenAI does not use AretaCare data to train its models. Its API policy allows it to keep requests for up to 30 days to monitor for abuse, after which they are deleted. The lookups Talk makes during a voice conversation are kept by OpenAI for up to 30 days.
                </p>
              </div>

              <div>
                <h3 className={h3}>Providers that receive no health data</h3>
                <p className={p}>
                  Sentry (error reports, with health information removed), RevenueCat (iOS subscriptions), our email provider, and Apple (App Store payments and push notifications). Emails and push notifications can include a care session&rsquo;s name, but never its contents.
                </p>
              </div>

              <div>
                <h3 className={h3}>When the law requires it</h3>
                <p className={p}>
                  We disclose consumer health data to comply with a valid legal process, such as a court order, and only as much as it requires.
                </p>
              </div>

              <p className={p}>We don&rsquo;t share consumer health data with any affiliated company, and we never sell it.</p>
            </div>
          </section>

          <section>
            <h2 className={h2}>6. Your Rights</h2>
            <div className="space-y-6">
              <ul className={ul}>
                <li><strong>Know and access.</strong> Ask whether we collect or share your consumer health data, get a copy of it, and get the list of everyone it is shared with and how to contact them (section 5). Most of it you can view, copy, or download in the app at any time.</li>
                <li><strong>Delete.</strong> Delete individual items, a whole care session, or your account in the app, or ask us to. Deletion removes the data from our database and file storage immediately. Copies OpenAI keeps for abuse monitoring expire within 30 days, and backup copies are removed on our providers&rsquo; backup schedules (see our Privacy Policy, section 8).</li>
                <li><strong>Withdraw consent.</strong> Delete your data or account, stop using Talk, or email us. Withdrawing consent stops future collection; it can&rsquo;t undo use that has already happened.</li>
                <li><strong>Appeal.</strong> If we decline a request, reply to our decision with the word &ldquo;Appeal&rdquo;. We&rsquo;ll answer in writing within 45 days. If we deny your appeal, you can complain to your state attorney general; Washington residents can use the{' '}
                  <a href="https://www.atg.wa.gov/file-complaint" target="_blank" rel="noopener noreferrer" className={a}>Washington Attorney General&rsquo;s complaint form</a>.
                </li>
                <li><strong>No penalty.</strong> Using these rights never changes your price or service.</li>
              </ul>

              <div>
                <h3 className={h3}>How to make a request</h3>
                <p className={p}>
                  Email{' '}
                  <a href="mailto:privacy@aretacare.com" className={a}>privacy@aretacare.com</a>{' '}
                  from the email address on your account (or tell us which account it is about, and we&rsquo;ll confirm it&rsquo;s you before acting). An authorized agent can ask on your behalf with proof of authority. We respond within 45 days, and if we need up to 45 more days we&rsquo;ll tell you why within the first 45. Requests are free, up to twice a year.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className={h2}>7. What We Don&rsquo;t Do</h2>
            <ul className={ul}>
              <li>Sell consumer health data</li>
              <li>Sell, license, or share it in de-identified or aggregate form, such as statistics, research data sets, or &ldquo;insights&rdquo;</li>
              <li>Use it for advertising or share it with advertisers, data brokers, insurers, or employers</li>
              <li>Set up geofences around health care facilities or track your location</li>
              <li>Collect consumer health data for a purpose not listed here without asking you first</li>
            </ul>
          </section>

          <section>
            <h2 className={h2}>8. Contact</h2>
            <p className={p}>
              Questions or requests:{' '}
              <a href="mailto:privacy@aretacare.com" className={a}>privacy@aretacare.com</a>
            </p>
          </section>

          {/* Copyright */}
          <section className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
            <p className="text-center text-gray-600 dark:text-gray-300 text-sm">
              Copyright © 2025-2026 AretaCare LLC. Released under the MIT License with Commons Clause.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default HealthDataPrivacy;
