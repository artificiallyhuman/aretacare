import React from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <SEO
        title="Privacy Policy"
        description="AretaCare Privacy Policy. Learn how AretaCare collects, uses, and protects your information across the web and iOS apps."
        path="/privacy"
      />
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
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-2">Privacy Policy</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Last Updated: February 22, 2026</p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 sm:p-10 space-y-10">
          {/* Section 1 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">1. Introduction</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
              AretaCare™ is an AI assistant that helps patients and caregivers organize and understand medical information. It is a consumer tool and does not provide medical advice, diagnosis, or treatment. AretaCare is available as a web application and a native iOS app. This Privacy Policy explains how we collect, use, and protect your information across all platforms. AretaCare is operated by AretaCare LLC.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">2. Information We Collect</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Account Information</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li>Name</li>
                  <li>Email address</li>
                  <li>Password (stored as a secure hash)</li>
                  <li>Multi-factor authentication credentials (if enabled): passkey public keys, TOTP secrets (encrypted), and backup codes (hashed)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">User-Provided Content</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">You may choose to provide:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li>Chat messages</li>
                  <li>Documents (PDFs, images, text files)</li>
                  <li>Audio recordings</li>
                  <li>Edits to AI-generated content</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Health Information Categories</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-4">
                  AretaCare may collect and process the following categories of health-related information that you choose to provide:
                </p>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Document Categories</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300 pl-4 text-sm">
                      <li><strong>Lab Results:</strong> Blood tests (CBC, metabolic panel, A1C, cholesterol), COVID/flu/strep tests, urinalysis, cultures, biopsies, pathology reports, genetic/DNA tests, allergy panels, hormone levels, tumor markers</li>
                      <li><strong>Imaging Reports:</strong> X-rays, CT scans, MRIs, ultrasounds, mammograms, PET scans, bone density scans (DEXA), echocardiograms</li>
                      <li><strong>Clinic Notes:</strong> Office visit summaries, progress notes, consultation notes, telehealth notes, specialist evaluations, history and physical</li>
                      <li><strong>Medication Records:</strong> Prescription records, medication lists, pharmacy printouts, medication reconciliation, prior authorizations</li>
                      <li><strong>Discharge Summaries:</strong> Hospital discharge summaries, after-visit summaries, hospital stay reports, post-operative instructions</li>
                      <li><strong>Treatment Plans:</strong> Care plans, therapy schedules, chemotherapy protocols, radiation therapy plans, rehabilitation plans</li>
                      <li><strong>Test Results:</strong> EKG/ECG, stress tests, pulmonary function tests, sleep studies, hearing tests, vision tests, nerve conduction studies, EEG, cardiac monitoring, colonoscopy/endoscopy reports</li>
                      <li><strong>Referrals:</strong> Referral letters, specialist referrals, second opinion requests, transfer summaries</li>
                      <li><strong>Insurance and Billing:</strong> Insurance forms, billing statements, EOBs, itemized bills, prior authorizations, claims</li>
                      <li><strong>Consent Forms:</strong> Informed consent, procedure consent, HIPAA forms, advance directives, DNR orders, power of attorney</li>
                      <li><strong>Care Instructions:</strong> Home care instructions, wound care guides, physical therapy exercises, dietary guidelines</li>
                      <li><strong>Other Documents:</strong> Any other health-related documents you choose to upload</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Audio Recording Categories</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300 pl-4 text-sm">
                      <li>Symptom updates</li>
                      <li>Appointment recaps</li>
                      <li>Medication notes</li>
                      <li>Questions for providers</li>
                      <li>Daily reflections</li>
                      <li>Progress updates</li>
                      <li>Side effects</li>
                      <li>Care instructions</li>
                      <li>Emergency notes</li>
                      <li>Family updates</li>
                      <li>Treatment observations</li>
                      <li>Other recordings</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Medication Categories</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300 pl-4 text-sm">
                      <li>Pain management</li>
                      <li>Cardiovascular</li>
                      <li>Diabetes</li>
                      <li>Mental health</li>
                      <li>Antibiotics</li>
                      <li>Respiratory</li>
                      <li>Gastrointestinal</li>
                      <li>Neurological</li>
                      <li>Endocrine</li>
                      <li>Oncology</li>
                      <li>Immunosuppressant</li>
                      <li>Vitamins/supplements</li>
                      <li>Multiple categories</li>
                      <li>Other medications</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Health Profile Data</h4>
                    <p className="text-gray-700 dark:text-gray-300 text-sm mb-2">The AI-generated Health Profile may include:</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300 pl-4 text-sm">
                      <li>Patient information (name, date of birth, contact information)</li>
                      <li>Caregiver details (names, relationships, roles)</li>
                      <li>Provider information (names, specialties, organizations)</li>
                      <li>Medical conditions (diagnoses, status, dates)</li>
                      <li>Medication details (names, doses, frequencies, prescribers, side effects)</li>
                      <li>Allergies (substances, reactions, severity)</li>
                      <li>Medical events (hospitalizations, surgeries, ER visits, major diagnoses)</li>
                      <li>Care preferences and guidelines</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Technical Information</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li>Session data and authentication tokens</li>
                  <li>Usage logs and error reports</li>
                  <li>Browser type and device information</li>
                  <li>Push notification device tokens (iOS app)</li>
                  <li>Device integrity status (iOS app — used to detect compromised devices)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">iOS App — Device Permissions</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">
                  The iOS app may request the following device permissions, each of which you can grant or deny:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li><strong>Microphone:</strong> Used to record voice memos for your health journal. Audio is recorded locally and uploaded to our servers for transcription.</li>
                  <li><strong>Camera:</strong> Used to capture photos of medical documents for upload. Photos are not stored locally after upload.</li>
                  <li><strong>Photo Library:</strong> Used to select existing photos of medical documents for upload.</li>
                  <li><strong>Face ID / Touch ID:</strong> Used for optional biometric app lock. Biometric data never leaves your device.</li>
                  <li><strong>Notifications:</strong> Used to deliver push notifications. You can disable notifications at any time in iOS Settings.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">iOS App — On-Device Data</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">
                  When you use the AretaCare iOS app, the following data is stored locally on your device:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li><strong>Keychain:</strong> Authentication tokens (access and refresh tokens) are stored in the iOS Keychain with device-only accessibility — they cannot be restored to other devices via backup</li>
                  <li><strong>Biometric authentication:</strong> If you enable biometric lock (Face ID or Touch ID), the app uses iOS system biometric APIs to verify your identity. AretaCare does not access, store, or transmit your biometric data — all biometric processing is handled entirely by iOS on your device</li>
                  <li><strong>Image cache:</strong> Viewed images (documents, thumbnails) are cached in device memory for performance and cleared on logout or when the device needs to reclaim memory</li>
                  <li><strong>Response cache:</strong> Recent API responses are cached temporarily in device memory to improve performance. All caches are cleared on logout</li>
                  <li><strong>Preferences:</strong> Non-sensitive settings (active session, selected tab, biometric lock preference) are stored in app-local storage and cleared on logout</li>
                  <li><strong>Temporary files:</strong> Audio recordings and document previews may create temporary files that are automatically deleted after use</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">3. How We Use Your Information</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">We use your information to:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                <li>Help you organize and understand your information</li>
                <li>Generate journal entries, daily digests, and health profiles</li>
                <li>Store your documents and audio recordings</li>
                <li>Maintain your account and session</li>
                <li>Improve the application and fix bugs</li>
              </ul>
            </div>
          </section>

          {/* Section 4 - Email Communications */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">4. Email Communications</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Automated Email Notifications</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">
                  AretaCare will send you automated email notifications to protect your account security and keep you informed of important activities. These emails are sent to the email address associated with your account.
                </p>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">You will receive emails when:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li><strong>Email Verification:</strong> Verification link to confirm your email address during registration</li>
                  <li><strong>Password Changes:</strong> Notification when your password is changed (either through account settings or password reset)</li>
                  <li><strong>Email Changes:</strong> Notification sent to your old email address when your account email is updated</li>
                  <li><strong>Collaborator Added (Owner):</strong> Notification when you add someone as a collaborator to one of your care sessions</li>
                  <li><strong>Added as Collaborator:</strong> Notification when someone adds you as a collaborator to their care session</li>
                  <li><strong>Collaboration Invitation:</strong> Invitation email when someone invites you to collaborate (if you don't yet have an account)</li>
                  <li><strong>Removed as Collaborator:</strong> Notification when you are removed from a shared care session</li>
                  <li><strong>Waitlist Invitation:</strong> Invitation to create an account when approved from the waitlist</li>
                  <li><strong>Password Reset:</strong> Password reset link when requested</li>
                  <li><strong>MFA Changes:</strong> Notification when multi-factor authentication methods are enabled or disabled</li>
                  <li><strong>Backup Code Usage:</strong> Alert when a backup code is used to sign in</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Email Service Provider</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">
                  Emails are sent via a third-party email service provider (currently Gmail). Your email address is shared with this provider for the purpose of delivering notifications. Email delivery is subject to the provider's terms of service and privacy policy.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Push Notifications (iOS App)</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">
                  If you use the iOS app, you may choose to enable push notifications. Push notifications are delivered via Apple Push Notification service (APNs). Your device token is stored on our server and deleted when you log out or disable notifications. Push notifications do not contain sensitive medical information.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Required Communications</h3>
                <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-600 p-4 rounded-r-lg">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1">Important</h3>
                      <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                        Email notifications related to account security (password changes, email changes, MFA changes) cannot be disabled as they are essential for protecting your account. By creating an account, you consent to receive these communications.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Email Content and Security</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li>Emails contain minimal personal information (your name and email address)</li>
                  <li>Emails do not contain sensitive medical information from your care sessions</li>
                  <li>Security-related emails include instructions for contacting support if the change was unauthorized</li>
                  <li>All emails are sent from AretaCare's designated sending address</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 5 - Care Session Sharing */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">5. Care Session Sharing</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                AretaCare allows you to share care sessions with other registered users (up to 10 people per care session, including yourself). When you share a care session:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                <li>Collaborators have full access to all care session data including conversations, journal entries, documents, audio recordings, and daily digests</li>
                <li>Collaborators can add, edit, and delete content within the shared care session</li>
                <li>Only the care session owner can share with additional users or revoke access</li>
                <li>Collaborators can leave a shared care session at any time</li>
              </ul>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Consent Requirement</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">
                  Before adding a collaborator, care session owners must confirm they have the right to share the care session's information. This consent acknowledgment states:
                </p>
                <div className="bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 dark:border-blue-600 p-4 rounded-r-lg mb-3">
                  <p className="text-sm text-blue-800 dark:text-blue-300 italic leading-relaxed">
                    "I confirm I have the right to share the information in this care session with the collaborator I'm adding. If I'm the patient, this is my consent. If I'm a caregiver, I have the patient's permission to share it."
                  </p>
                </div>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                  This ensures that patient information is only shared with proper authorization, whether the care session owner is the patient themselves or a caregiver acting on their behalf.
                </p>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-600 p-4 rounded-r-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1">Important</h3>
                    <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                      Only share care sessions with people you trust. Once shared, collaborators can view all existing content in that care session. Care session owners are responsible for obtaining proper consent before sharing patient information.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">6. Third-Party Services</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                AretaCare uses the following third-party services that may access your data:
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-5 border border-gray-200 dark:border-gray-600">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">OpenAI</h3>
                  <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5">
                    <li>• Processes your messages to provide AI assistance</li>
                    <li>• Transcribes audio recordings</li>
                    <li>• Generates journal entries and daily digests</li>
                  </ul>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-5 border border-gray-200 dark:border-gray-600">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">AWS S3</h3>
                  <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5">
                    <li>• Stores uploaded documents and images</li>
                    <li>• Stores PDF thumbnails and audio recordings</li>
                  </ul>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-5 border border-gray-200 dark:border-gray-600">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Email Provider</h3>
                  <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5">
                    <li>• Delivers email notifications</li>
                    <li>• Currently Gmail (see Section 4)</li>
                  </ul>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-5 border border-gray-200 dark:border-gray-600">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Apple (iOS App)</h3>
                  <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5">
                    <li>• Delivers push notifications via Apple Push Notification service (APNs)</li>
                    <li>• Processes biometric authentication (Face ID/Touch ID) on-device</li>
                    <li>• Provides Keychain for secure token storage</li>
                  </ul>
                </div>
              </div>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                Your use of these services through AretaCare is subject to their respective privacy policies and terms of service.
              </p>
            </div>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">7. Data Storage and Security</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Where Your Data is Stored</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li><strong>Database:</strong> PostgreSQL database (account, conversations, journal, health profiles, daily digests, document and audio metadata)</li>
                  <li><strong>File Storage:</strong> AWS S3 (documents, images, audio files)</li>
                  <li><strong>Browser:</strong> Access tokens in memory (not persisted); refresh tokens and trusted device tokens in secure HttpOnly cookies; only non-sensitive preferences (theme, active session ID) in localStorage</li>
                  <li><strong>iOS Device:</strong> Authentication tokens in iOS Keychain (device-only, not included in backups); images and API responses cached in memory (cleared on logout); non-sensitive preferences in app-local storage (cleared on logout)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Security Measures</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li>Passwords are hashed using bcrypt</li>
                  <li>Authentication via JWT tokens</li>
                  <li>Multi-factor authentication options: passkeys (WebAuthn), authenticator apps (TOTP), and backup codes</li>
                  <li>MFA credentials stored securely: passkey public keys in database, TOTP secrets encrypted, backup codes hashed</li>
                  <li>Trusted device tokens allow recognized devices to bypass MFA for 30 days</li>
                  <li>HTTPS encryption for data in transit</li>
                  <li>S3 file storage uses AES-256 encryption at rest</li>
                  <li>Database encryption at rest (PostgreSQL)</li>
                  <li>Access controls on database and storage</li>
                  <li>iOS: SSL certificate pinning to prevent man-in-the-middle attacks</li>
                  <li>iOS: Keychain storage with device-only accessibility (tokens cannot be transferred to other devices)</li>
                  <li>iOS: Optional biometric authentication (Face ID/Touch ID) for app access</li>
                  <li>iOS: Device integrity checking to detect compromised devices</li>
                  <li>iOS: All cached data (images, API responses, preferences) cleared on logout</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Security Practices</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">
                  No system can guarantee absolute security. We take reasonable measures to protect your data, but like any online service, AretaCare cannot eliminate all security risks. We recommend:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li>Using a strong, unique password for your account</li>
                  <li>Enabling multi-factor authentication for additional security</li>
                  <li>Storing your backup codes in a safe location</li>
                  <li>Keeping your own copies of important documents</li>
                  <li>Reviewing our open source code if you have security concerns</li>
                  <li>On iOS: enabling the biometric lock feature in Settings for additional app-level protection</li>
                  <li>On iOS: logging out before uninstalling the app to ensure all Keychain data is removed</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">8. Data Retention and Deletion</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Document Deletion</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">When you delete a document:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li>The document file is permanently deleted from AWS S3 storage</li>
                  <li>Document thumbnails (if any) are permanently deleted from S3</li>
                  <li>Extracted text and metadata are permanently deleted from the database</li>
                  <li>All references to the document in conversations are removed</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Care Session Deletion</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">When you delete a care session:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li>All conversations in the care session are permanently deleted from the database</li>
                  <li>All journal entries are permanently deleted from the database</li>
                  <li>All uploaded documents and audio files are permanently deleted from S3 storage</li>
                  <li>Document thumbnails and audio transcriptions are permanently deleted</li>
                  <li>All daily digests are permanently deleted from the database</li>
                  <li>Care session collaborator access is removed</li>
                  <li>Your user account remains active with any other care sessions intact</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Account Deletion</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">
                  You can delete your account at any time from the Settings page. This will permanently delete:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li>Your account and profile information (name, email, credentials)</li>
                  <li>All care sessions you own and their complete data (conversations, journal, daily digests)</li>
                  <li>All documents, audio recordings, thumbnails, and associated files in S3 storage</li>
                  <li>Your access to any care sessions shared with you (the shared care sessions remain for other collaborators)</li>
                  <li>Your push notification device tokens (iOS app)</li>
                </ul>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mt-3">
                  On the iOS app, logging out clears all locally stored data including Keychain tokens, cached images, cached API responses, and app preferences. Uninstalling the app removes all on-device data. Keychain items may persist after uninstallation on some iOS versions; logging out before uninstalling ensures complete removal.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Cloud Backup Retention</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">
                  When you delete data, it is immediately removed from our active systems. However, copies may persist temporarily in cloud provider backups:
                </p>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                  These backup copies are not accessible through the application and are automatically purged according to cloud provider retention policies.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Inactive Account Deletion</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                  We reserve the right to delete accounts that have been inactive for more than 90 days. Before deletion, we will make reasonable efforts to notify you at your registered email address. Inactive account deletion follows the same process as user-initiated account deletion, permanently removing all associated data from active systems.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Data Retention Periods</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">
                  The following table summarizes how long different types of data are retained:
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-gray-700 dark:text-gray-300">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-600">
                        <th className="text-left py-2 pr-4 font-semibold text-gray-900 dark:text-white">Data Type</th>
                        <th className="text-left py-2 font-semibold text-gray-900 dark:text-white">Retention Period</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      <tr>
                        <td className="py-2 pr-4">User Content (conversations, journal, documents, audio, profiles)</td>
                        <td className="py-2">Until user deletes it or account is deleted</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4">Audit Logs</td>
                        <td className="py-2">90 days</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4">Security Logs</td>
                        <td className="py-2">90 days</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4">Error Logs</td>
                        <td className="py-2">30 days</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4">API Logs</td>
                        <td className="py-2">30 days</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4">Inactive Accounts</td>
                        <td className="py-2">May be deleted after 90 days (with notification)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Keeping Your Own Copies</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">
                  We recommend keeping your own copies of important information. You can download documents, copy journal entries and daily digests, and save conversation content at any time. Once deleted, data cannot be recovered.
                </p>
              </div>
            </div>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">9. Your Rights and Choices</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Access and Control</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">You can:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li>View all your data within the application</li>
                  <li>Edit your chat messages, journal entries, daily digests, and health profiles</li>
                  <li>Delete documents, audio recordings, and journal entries</li>
                  <li>Delete individual care sessions or your entire account from Settings</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Data Portability</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">You can export your data by:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li>Copying conversation text from the interface</li>
                  <li>Downloading your uploaded documents</li>
                  <li>Copying journal entries and daily digests</li>
                  <li>Exporting your Health Profile as a PDF</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">10. Children's Privacy</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
              AretaCare is not intended for users under the age of 18. We do not knowingly collect information from children. If you believe a child has provided us with personal information, please contact us at{' '}
              <a href="mailto:privacy@aretacare.com" className="text-primary-600 hover:text-primary-700 font-medium underline">
                privacy@aretacare.com
              </a>.
            </p>
          </section>

          {/* Section 11 - HIPAA and Data Practices */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">11. HIPAA Status</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                AretaCare is a direct-to-consumer tool designed for personal use by patients and caregivers. It is not a HIPAA-covered service, does not integrate with healthcare provider systems, and is not intended to serve as a medical record system.
              </p>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                Healthcare providers should not use AretaCare as part of their clinical record or workflow. We recommend keeping your own copies of important medical information.
              </p>
            </div>
          </section>

          {/* Section 12 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">12. Changes to Privacy Policy</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
              We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last Updated" date. Your continued use of AretaCare constitutes acceptance of any changes.
            </p>
          </section>

          {/* Section 13 - Data Use and Insights */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">13. Data Use and Aggregate Insights</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Your Personal Data</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                  We never sell your personal data or share it with hospitals, insurers, advertisers, or data brokers. Your individual information remains private and under your control.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Aggregate, Population-Level Insights</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-3">
                  To fund the platform, we may generate aggregate, population-level insights derived from patterns across many users. These insights:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                  <li>Contain no individual records or personally identifiable information</li>
                  <li>Cannot be traced back to any specific person or account</li>
                  <li>Are derived from patterns across large groups of users</li>
                  <li>May be used to improve the platform or offered to third parties</li>
                </ul>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mt-3">
                  <strong>Example:</strong> We might identify that "60% of users ask about medication side effects" but we would never reveal that any specific user asked about a specific medication on a specific date.
                </p>
              </div>
            </div>
          </section>

          {/* Section 14 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">14. Open Source and Community</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">As an open source project:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                <li>Anyone can review the source code to understand how data is handled</li>
                <li>Security researchers can identify and report vulnerabilities</li>
                <li>The community can contribute improvements to privacy and security</li>
              </ul>
            </div>
          </section>

          {/* Section 15 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">15. Geographic Availability</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                AretaCare is designed for users in the United States. Our servers and data processing are located in the United States. By using this application, you acknowledge that your data will be stored and processed in the United States.
              </p>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                If you are located outside the United States, please be aware that we may not be able to comply with all data protection requirements in your jurisdiction. We encourage you to review this policy and our Terms of Service before using AretaCare.
              </p>
            </div>
          </section>

          {/* Section 16 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">16. State Privacy Rights</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                Residents of California, Colorado, Virginia, Connecticut, Utah, and other states with privacy laws have specific rights regarding their personal information, including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 pl-4">
                <li>The right to know what personal information is collected</li>
                <li>The right to request deletion of personal information</li>
                <li>The right to opt-out of sale of personal information (we do not sell your personal data)</li>
                <li>The right to access and receive a copy of your data</li>
                <li>The right to limit use and disclosure of sensitive personal information</li>
                <li>The right to request correction of inaccurate personal information</li>
              </ul>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">California CPRA Rights</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                  California residents have additional rights under the California Privacy Rights Act (CPRA), including the right to limit the use and disclosure of sensitive personal information. Health information is considered sensitive personal information under CPRA.
                </p>
              </div>

              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                <strong>How to exercise these rights:</strong> You can access, export, or delete your data directly through the application at any time via the Settings page. For additional requests or questions, contact us at{' '}
                <a href="mailto:privacy@aretacare.com" className="text-primary-600 hover:text-primary-700 font-medium underline">
                  privacy@aretacare.com
                </a>
                .
              </p>

              <div className="bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 dark:border-blue-600 p-4 rounded-r-lg">
                <p className="text-blue-800 dark:text-blue-300 text-sm leading-relaxed">
                  <strong>Response Times:</strong> For requests involving sensitive personal information (including health data), we will respond within 15 business days. For other requests, we will respond within 45 days. Complex requests may require an additional extension, in which case we will notify you.
                </p>
              </div>
            </div>
          </section>

          {/* Section 17 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b-2 border-primary-200 dark:border-primary-800">17. Contact and Questions</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mb-4">
              For privacy questions, concerns, or data requests, please contact us at{' '}
              <a href="mailto:privacy@aretacare.com" className="text-primary-600 hover:text-primary-700 font-medium underline">
                privacy@aretacare.com
              </a>
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
              You can also open an issue on our{' '}
              <a href="https://github.com/artificiallyhuman/aretacare" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 font-medium underline">
                GitHub repository
              </a>.
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

export default PrivacyPolicy;
