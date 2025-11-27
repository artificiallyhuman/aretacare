import React from 'react';
import { Link } from 'react-router-dom';

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center text-primary-600 hover:text-primary-700 mb-6 font-medium transition-colors group">
            <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 sm:p-8">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-2">Terms of Service</h1>
            <p className="text-sm text-gray-500">Last Updated: November 27, 2025</p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 sm:p-10 space-y-10">
          {/* Section 1 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">1. Acceptance of Terms</h2>
            <p className="text-gray-700 leading-relaxed text-base">
              By accessing and using AretaCare, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use this application.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">2. Open Source Project</h2>
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed text-base">
                AretaCare is an open source project released under the MIT License. The source code is available at{' '}
                <a href="https://github.com/artificiallyhuman/aretacare" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 font-medium underline">
                  https://github.com/artificiallyhuman/aretacare
                </a>
              </p>
              <p className="text-gray-700 leading-relaxed text-base">
                This project is not managed by a company or commercial entity. All inquiries, bug reports, and contributions should be directed to the GitHub repository.
              </p>
            </div>
          </section>

          {/* Section 3 - Medical Disclaimer */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">3. Medical Disclaimer</h2>
            <div className="space-y-4">
              <div className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-lg">
                <p className="text-amber-900 font-semibold mb-3 flex items-start">
                  <svg className="w-6 h-6 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>IMPORTANT: AretaCare is an AI-powered information assistant and is NOT a substitute for professional medical advice, diagnosis, or treatment.</span>
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-gray-700 font-medium mb-3">This application:</p>
                <ul className="space-y-2 text-gray-700">
                  <li className="flex items-start">
                    <span className="text-red-500 mr-2 mt-1">✗</span>
                    <span>Does NOT provide medical diagnoses</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-red-500 mr-2 mt-1">✗</span>
                    <span>Does NOT recommend or adjust medications</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-red-500 mr-2 mt-1">✗</span>
                    <span>Does NOT predict medical outcomes</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-red-500 mr-2 mt-1">✗</span>
                    <span>Should NOT be used for medical emergencies</span>
                  </li>
                </ul>
              </div>
              <p className="text-gray-700 leading-relaxed text-base font-semibold">
                Always consult qualified healthcare professionals for any medical decisions. In case of emergency, call 911 or your local emergency services immediately.
              </p>
            </div>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">4. No Warranties</h2>
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed text-base">
                AretaCare is provided "AS IS" and "AS AVAILABLE" without any warranties of any kind, either express or implied, including but not limited to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                <li>Warranties of merchantability or fitness for a particular purpose</li>
                <li>Warranties regarding accuracy, reliability, or completeness of information</li>
                <li>Warranties regarding availability, security, or error-free operation</li>
              </ul>
              <p className="text-gray-700 leading-relaxed text-base">
                The developers, contributors, and maintainers of AretaCare make no representations or warranties regarding the accuracy of AI-generated content.
              </p>
            </div>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">5. Beta Software</h2>
            <div className="space-y-4">
              <div className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-lg">
                <p className="text-amber-900 font-medium mb-2">AretaCare is currently in beta and may be unstable. Users may experience:</p>
                <ul className="list-disc list-inside space-y-1 text-amber-800 pl-2">
                  <li>Data loss from time to time</li>
                  <li>Service interruptions or downtime</li>
                  <li>Bugs, errors, or unexpected behavior</li>
                  <li>Changes to features or functionality without notice</li>
                </ul>
              </div>
              <p className="text-gray-700 leading-relaxed text-base font-semibold">
                Do not rely on this system for critical medical information storage. Always maintain separate records of important medical information.
              </p>
            </div>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">6. User Responsibilities</h2>
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed text-base">You are responsible for:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                <li>Maintaining the confidentiality of your account credentials</li>
                <li>All activities that occur under your account</li>
                <li>Ensuring the accuracy of information you provide</li>
                <li>Making your own independent medical decisions with qualified healthcare providers</li>
                <li>Backing up any important information stored in the application</li>
              </ul>
            </div>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">7. Limitation of Liability</h2>
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed text-base">
                To the maximum extent permitted by law, the developers, contributors, and maintainers of AretaCare shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                <li>Your use or inability to use the application</li>
                <li>Any unauthorized access to or use of your data</li>
                <li>Any bugs, viruses, or other harmful code</li>
                <li>Any errors or omissions in any content</li>
                <li>Medical decisions made based on information from this application</li>
              </ul>
            </div>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">8. Third-Party Services</h2>
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed text-base">AretaCare uses third-party services including:</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-2">OpenAI</h3>
                  <p className="text-sm text-gray-600">For AI-powered features and transcription</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-2">AWS S3</h3>
                  <p className="text-sm text-gray-600">For document storage</p>
                </div>
              </div>
              <p className="text-gray-700 leading-relaxed text-base">
                Your use of these services through AretaCare is subject to their respective terms of service and privacy policies.
              </p>
            </div>
          </section>

          {/* Remaining sections with simpler formatting */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">9. Modifications to Terms</h2>
            <p className="text-gray-700 leading-relaxed text-base">
              We reserve the right to modify these Terms of Service at any time. Changes will be effective immediately upon posting. Your continued use of AretaCare after changes constitutes acceptance of the modified terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">10. Termination</h2>
            <p className="text-gray-700 leading-relaxed text-base">
              We reserve the right to terminate or suspend your access to AretaCare at any time, without notice, for any reason, including violation of these terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">11. Governing Law</h2>
            <p className="text-gray-700 leading-relaxed text-base">
              These Terms of Service shall be governed by and construed in accordance with the laws of the jurisdiction in which you reside, without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">12. Contact and Questions</h2>
            <p className="text-gray-700 leading-relaxed text-base">
              For questions, issues, or contributions, please visit the GitHub repository at{' '}
              <a href="https://github.com/artificiallyhuman/aretacare" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 font-medium underline">
                https://github.com/artificiallyhuman/aretacare
              </a>
            </p>
          </section>

          {/* Copyright */}
          <section className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <p className="text-center text-gray-600 text-sm">
              Copyright © 2025 AretaCare. Released under the MIT License.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
