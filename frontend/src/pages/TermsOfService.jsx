import React from 'react';
import { Link } from 'react-router-dom';

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mb-6 font-medium transition-colors group">
            <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-2">Terms of Service</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Last Updated: December 23, 2025</p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 sm:p-10 space-y-10">
          {/* Section 1 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">1. Acceptance of Terms</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
              By accessing and using AretaCare™, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use this application.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">2. Open Source Project</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                AretaCare is an open source project released under the MIT License with Commons Clause restrictions. The source code is available on{' '}
                <a href="https://github.com/artificiallyhuman/aretacare" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 font-medium underline">
                  GitHub
                </a>.
              </p>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                AretaCare is operated by AretaCare LLC, a limited liability company registered in Illinois. For inquiries, bug reports, and contributions, please visit the GitHub repository.
              </p>
            </div>
          </section>

          {/* Section 3 - Medical Disclaimer */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">3. Medical Disclaimer</h2>
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/30 border-l-4 border-amber-500 dark:border-amber-600 p-5 rounded-r-lg">
                <p className="text-amber-900 dark:text-amber-200 font-semibold mb-3 flex items-start">
                  <svg className="w-6 h-6 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>IMPORTANT: AretaCare is an AI-powered information assistant and is NOT a substitute for professional medical advice, diagnosis, or treatment.</span>
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-5">
                <p className="text-gray-700 dark:text-gray-300 font-medium mb-3">This application:</p>
                <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                  <li className="flex items-center">
                    <span className="text-red-500 mr-2">✗</span>
                    <span>Does NOT provide medical diagnoses</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-red-500 mr-2">✗</span>
                    <span>Does NOT recommend or adjust medications</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-red-500 mr-2">✗</span>
                    <span>Does NOT predict medical outcomes</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-red-500 mr-2">✗</span>
                    <span>Should NOT be used for medical emergencies</span>
                  </li>
                </ul>
              </div>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base font-semibold">
                Always consult qualified healthcare professionals for any medical decisions. In case of emergency, call 911 or your local emergency services immediately.
              </p>
            </div>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">4. No Warranties</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                AretaCare is provided "AS IS" and "AS AVAILABLE" without any warranties of any kind, either express or implied, including but not limited to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 dark:text-gray-300 pl-4">
                <li>Warranties of merchantability or fitness for a particular purpose</li>
                <li>Warranties regarding accuracy, reliability, or completeness of information</li>
                <li>Warranties regarding availability, security, or error-free operation</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                The developers, contributors, and maintainers of AretaCare make no representations or warranties regarding the accuracy of AI-generated content.
              </p>
            </div>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">5. Direct-to-Consumer Use and HIPAA Status</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                AretaCare is a direct-to-consumer tool designed for personal use by patients and caregivers. It is not a HIPAA-covered service, does not integrate with healthcare provider systems, and is not intended to serve as a medical record system.
              </p>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                Healthcare providers should not use AretaCare as part of their clinical record or workflow. We recommend keeping your own copies of important medical information.
              </p>
            </div>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">6. User Responsibilities</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">You are responsible for:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 dark:text-gray-300 pl-4">
                <li>Maintaining the confidentiality of your account credentials</li>
                <li>All activities that occur under your account</li>
                <li>Ensuring the accuracy of information you provide</li>
                <li>Making your own independent medical decisions with qualified healthcare providers</li>
                <li>Backing up any important information stored in the application</li>
              </ul>
            </div>
          </section>

          {/* Section 7 - Email Communications */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">7. Email Communications</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                By creating an account, you consent to receive automated email notifications from AretaCare. These emails are essential for account security and session management.
              </p>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-5">
                <p className="text-gray-700 dark:text-gray-300 font-medium mb-3">You will receive emails for:</p>
                <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                  <li className="flex items-start">
                    <span className="text-primary-600 mr-2 mt-1">•</span>
                    <span><strong>Password changes:</strong> Security notification when your password is changed</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-primary-600 mr-2 mt-1">•</span>
                    <span><strong>Email changes:</strong> Notification to your old email when your account email is updated</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-primary-600 mr-2 mt-1">•</span>
                    <span><strong>Session collaboration:</strong> Notifications when collaborators are added or removed from sessions</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-primary-600 mr-2 mt-1">•</span>
                    <span><strong>Password reset:</strong> Password reset links when requested</span>
                  </li>
                </ul>
              </div>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                Security-related email notifications (password changes, email changes) cannot be disabled as they help protect your account.
              </p>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                Emails do not contain sensitive medical information from your sessions. They contain only basic account information necessary for security notifications.
              </p>
            </div>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">8. Limitation of Liability</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                To the maximum extent permitted by applicable law, AretaCare and its developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the application. This limitation does not affect any rights that cannot be waived under applicable law.
              </p>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                Nothing in these terms excludes or limits liability for fraud, gross negligence, or any other liability that cannot be excluded by law.
              </p>
            </div>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">9. Third-Party Services</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">AretaCare uses third-party services including:</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">OpenAI</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">For AI-powered features and transcription</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">AWS S3</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">For document storage</p>
                </div>
              </div>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                Your use of these services through AretaCare is subject to their respective terms of service and privacy policies.
              </p>
            </div>
          </section>

          {/* Section 10 - Data Use */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">10. Data Use and Privacy</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                AretaCare never sells your personal data or shares it with hospitals, insurers, advertisers, or data brokers.
              </p>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                To fund the platform, we may generate aggregate, population-level insights derived from patterns across many users. These insights:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                <li>Contain no individual records or personally identifiable information</li>
                <li>Cannot be traced back to any specific person</li>
                <li>Are derived from patterns across large groups of users</li>
                <li>May be used to improve the platform or offered to third parties</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                You retain full control over your data and can delete it at any time from Settings. When you delete your data, it is permanently removed from our systems. Cloud providers may maintain their own backup retention policies; consult their terms of service for details.
              </p>
            </div>
          </section>

          {/* Section 11 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">11. Modifications to Terms</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
              We reserve the right to modify these Terms of Service at any time. Changes will be effective immediately upon posting. Your continued use of AretaCare after changes constitutes acceptance of the modified terms.
            </p>
          </section>

          {/* Section 12 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">12. Termination</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
              We reserve the right to terminate or suspend your access to AretaCare at any time, without notice, for any reason, including violation of these terms.
            </p>
          </section>

          {/* Section 13 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">13. Governing Law</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
              These Terms of Service shall be governed by and construed in accordance with the laws of the jurisdiction in which you reside, without regard to its conflict of law provisions.
            </p>
          </section>

          {/* Section 14 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">14. Contact</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
              For questions or support, please contact us at{' '}
              <a href="mailto:support@aretacare.com" className="text-primary-600 hover:text-primary-700 font-medium underline">
                support@aretacare.com
              </a>.
            </p>
          </section>

          {/* Copyright */}
          <section className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
            <p className="text-center text-gray-600 dark:text-gray-300 text-sm">
              Copyright © 2025 AretaCare LLC. Released under the MIT License with Commons Clause.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
