import React from 'react';
import { Link } from 'react-router-dom';

const PrivacyPolicy = () => {
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
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
            <p className="text-sm text-gray-500">Last Updated: November 29, 2025</p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 sm:p-10 space-y-10">
          {/* Section 1 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">1. Introduction</h2>
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed text-base">
                AretaCare is an open source project designed to help families understand medical information. This Privacy Policy explains how we collect, use, and protect your information.
              </p>
              <p className="text-gray-700 leading-relaxed text-base">
                This is an open source project, not a commercial service. The source code is available at{' '}
                <a href="https://github.com/artificiallyhuman/aretacare" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 font-medium underline">
                  https://github.com/artificiallyhuman/aretacare
                </a>
              </p>
            </div>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">2. Information We Collect</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Account Information</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                  <li>Name</li>
                  <li>Email address</li>
                  <li>Password (stored as a secure hash)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Medical and Health Information</h3>
                <p className="text-gray-700 leading-relaxed text-base mb-3">You may choose to provide:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                  <li>Conversation messages about medical topics</li>
                  <li>Journal entries about health events</li>
                  <li>Uploaded medical documents (PDFs, images)</li>
                  <li>Audio recordings (transcribed via OpenAI)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Technical Information</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                  <li>Session data and authentication tokens</li>
                  <li>Usage logs and error reports</li>
                  <li>Browser type and device information</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">3. How We Use Your Information</h2>
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed text-base">We use your information to:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                <li>Provide AI-powered medical information assistance</li>
                <li>Generate journal entries and daily plans</li>
                <li>Store and organize your medical documents</li>
                <li>Maintain your account and session</li>
                <li>Send you important email notifications about your account</li>
                <li>Improve the application and fix bugs</li>
              </ul>
            </div>
          </section>

          {/* Section 4 - Email Communications */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">4. Email Communications</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Automated Email Notifications</h3>
                <p className="text-gray-700 leading-relaxed text-base mb-3">
                  AretaCare will send you automated email notifications to protect your account security and keep you informed of important activities. These emails are sent to the email address associated with your account.
                </p>
                <p className="text-gray-700 leading-relaxed text-base mb-3">You will receive emails when:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                  <li><strong>Password Changes:</strong> Notification when your password is changed (either through account settings or password reset)</li>
                  <li><strong>Email Changes:</strong> Notification sent to your old email address when your account email is updated</li>
                  <li><strong>Collaborator Added (Owner):</strong> Notification when you add someone as a collaborator to one of your sessions</li>
                  <li><strong>Added as Collaborator:</strong> Notification when someone adds you as a collaborator to their session</li>
                  <li><strong>Removed as Collaborator:</strong> Notification when you are removed from a shared session</li>
                  <li><strong>Password Reset:</strong> Password reset link when requested</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Email Service Provider</h3>
                <p className="text-gray-700 leading-relaxed text-base mb-3">
                  Emails are sent via SMTP using Gmail. Your email address is shared with Gmail for the purpose of delivering these notifications. Email delivery is subject to Gmail's terms of service and privacy policy.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Required Communications</h3>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-5 rounded-r-lg">
                  <p className="text-blue-900">
                    <strong>Important:</strong> Email notifications related to account security (password changes, email changes) cannot be disabled as they are essential for protecting your account. By creating an account, you consent to receive these communications.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Email Content and Security</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                  <li>Emails contain minimal personal information (your name and email address)</li>
                  <li>Emails do not contain sensitive medical information from your sessions</li>
                  <li>Security-related emails include instructions for contacting support if the change was unauthorized</li>
                  <li>All emails are sent from AretaCare's designated sending address</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 5 - Session Sharing */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">5. Session Sharing</h2>
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed text-base">
                AretaCare allows you to share sessions with other registered users (up to 5 people per session, including yourself). When you share a session:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                <li>Collaborators have full access to all session data including conversations, journal entries, documents, audio recordings, and daily plans</li>
                <li>Collaborators can add, edit, and delete content within the shared session</li>
                <li>Only the session owner can share with additional users or revoke access</li>
                <li>Collaborators can leave a shared session at any time</li>
              </ul>
              <div className="bg-blue-50 border-l-4 border-blue-500 p-5 rounded-r-lg">
                <p className="text-blue-900">
                  <strong>Important:</strong> Only share sessions with people you trust. Once shared, collaborators can view all existing content in that session.
                </p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">6. Third-Party Services</h2>
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed text-base">
                AretaCare uses the following third-party services that may access your data:
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-3">OpenAI (ChatGPT)</h3>
                  <ul className="text-sm text-gray-600 space-y-1.5">
                    <li>• Processes your messages to provide AI assistance</li>
                    <li>• Transcribes audio recordings</li>
                    <li>• Generates journal entries and daily plans</li>
                    <li>• Subject to OpenAI's privacy policy and terms of service</li>
                  </ul>
                </div>
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-3">AWS S3</h3>
                  <ul className="text-sm text-gray-600 space-y-1.5">
                    <li>• Stores uploaded documents and images</li>
                    <li>• Stores PDF thumbnails and audio recordings</li>
                    <li>• Subject to AWS's privacy policy and terms of service</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">7. Data Storage and Security</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Where Your Data is Stored</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                  <li><strong>Database:</strong> PostgreSQL database (conversation, journal, user data)</li>
                  <li><strong>File Storage:</strong> AWS S3 (documents, images, audio files)</li>
                  <li><strong>Browser:</strong> Authentication tokens and session IDs in localStorage</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Security Measures</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                  <li>Passwords are hashed using bcrypt</li>
                  <li>Authentication via JWT tokens</li>
                  <li>HTTPS encryption for data in transit</li>
                  <li>Access controls on database and storage</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Security Limitations</h3>
                <div className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-lg">
                  <p className="text-amber-900 font-semibold mb-3 flex items-start">
                    <svg className="w-6 h-6 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>IMPORTANT: While we implement security measures, we cannot guarantee absolute security. As a beta open source project:</span>
                  </p>
                  <ul className="space-y-2 text-amber-800 pl-8">
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2 mt-1">•</span>
                      <span>Data breaches may occur</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2 mt-1">•</span>
                      <span>Data may be lost due to technical failures</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2 mt-1">•</span>
                      <span>Security vulnerabilities may exist in the code</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2 mt-1">•</span>
                      <span>You should not store highly sensitive information without additional safeguards</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">8. Data Retention and Deletion</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Session Data</h3>
                <p className="text-gray-700 leading-relaxed text-base mb-3">When you clear your session:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                  <li>All conversations are permanently deleted</li>
                  <li>All journal entries are permanently deleted</li>
                  <li>All uploaded documents are permanently deleted from S3</li>
                  <li>All daily plans are permanently deleted</li>
                  <li>Your user account remains active</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Account Deletion</h3>
                <p className="text-gray-700 leading-relaxed text-base mb-3">
                  You can delete your account at any time from the Settings page. This will permanently delete:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                  <li>Your account and profile information</li>
                  <li>All sessions you own and their associated data</li>
                  <li>All documents, audio recordings, and files in storage</li>
                  <li>Your access to any sessions shared with you (the shared sessions remain for other collaborators)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Data Backup</h3>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-5 rounded-r-lg">
                  <p className="text-blue-900 font-semibold mb-3">
                    We do not maintain automatic backups of user data. If you need to preserve your information, you should:
                  </p>
                  <ul className="space-y-2 text-blue-800 pl-4">
                    <li className="flex items-start">
                      <span className="text-blue-600 mr-2 mt-1">•</span>
                      <span>Download your documents regularly</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-600 mr-2 mt-1">•</span>
                      <span>Export or copy your journal entries</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-600 mr-2 mt-1">•</span>
                      <span>Save your daily plans manually</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">9. Your Rights and Choices</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Access and Control</h3>
                <p className="text-gray-700 leading-relaxed text-base mb-3">You can:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                  <li>View all your data within the application</li>
                  <li>Edit or delete journal entries</li>
                  <li>Delete uploaded documents and audio recordings</li>
                  <li>Delete individual sessions at any time</li>
                  <li>Delete your entire account from the Settings page</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Data Portability</h3>
                <p className="text-gray-700 leading-relaxed text-base mb-3">You can export your data by:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                  <li>Copying conversation text from the interface</li>
                  <li>Downloading your uploaded documents</li>
                  <li>Copying journal entries and daily plans</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">10. Children's Privacy</h2>
            <p className="text-gray-700 leading-relaxed text-base">
              AretaCare is not intended for users under the age of 18. We do not knowingly collect information from children. If you believe a child has provided us with personal information, please contact us via GitHub.
            </p>
          </section>

          {/* Section 11 - Beta Software Warning */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">11. Beta Software and Data Loss</h2>
            <div className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-lg">
              <p className="text-amber-900 font-semibold">
                AretaCare is beta software. You may experience data loss from time to time. We are not responsible for any lost data. Do not rely on this system as your only source of medical records.
              </p>
            </div>
          </section>

          {/* Section 12 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">12. Changes to Privacy Policy</h2>
            <p className="text-gray-700 leading-relaxed text-base">
              We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last Updated" date. Your continued use of AretaCare constitutes acceptance of any changes.
            </p>
          </section>

          {/* Section 13 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">13. Open Source and Community</h2>
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed text-base">As an open source project:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                <li>Anyone can review the source code to understand how data is handled</li>
                <li>Security researchers can identify and report vulnerabilities</li>
                <li>The community can contribute improvements to privacy and security</li>
                <li>There is no commercial entity selling or monetizing your data</li>
              </ul>
            </div>
          </section>

          {/* Section 14 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">14. International Users</h2>
            <p className="text-gray-700 leading-relaxed text-base">
              AretaCare may be accessed from anywhere in the world. By using this application, you consent to the transfer of your information to the United States (where our servers may be located) and other countries where our service providers operate.
            </p>
          </section>

          {/* Section 15 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">15. California Privacy Rights</h2>
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed text-base">
                California residents have specific rights under the California Consumer Privacy Act (CCPA), including the right to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                <li>Know what personal information is collected</li>
                <li>Request deletion of personal information</li>
                <li>Opt-out of sale of personal information (we do not sell your data)</li>
              </ul>
            </div>
          </section>

          {/* Section 16 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-primary-200">16. Contact and Questions</h2>
            <p className="text-gray-700 leading-relaxed text-base">
              For privacy questions, concerns, or data requests, please open an issue on our GitHub repository:{' '}
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

export default PrivacyPolicy;
