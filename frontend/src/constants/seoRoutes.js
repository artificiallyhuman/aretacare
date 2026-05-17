// Per-route SEO metadata. Single source of truth read by:
//   1. The prerender postProcess hook in vite.config.js — injects the
//      correct <title>, <meta>, canonical, OG/Twitter, JSON-LD into each
//      prerendered HTML file at build time.
//   2. The runtime <SEO /> component (src/components/SEO.jsx) — updates
//      document.head via direct DOM mutation in a useEffect for client-side
//      route changes after hydration.
// Both consumers read the same map, so the static head and the runtime head
// never drift.
import {
  SITE_URL,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
  ORGANIZATION_JSON_LD,
  WEBSITE_JSON_LD,
} from './seo';

const DEFAULT_DESCRIPTION =
  'AretaCare is a healthcare coach and organizer that helps patients and caregivers make sense of medical information, prepare for doctor visits, and keep care organized.';

// FAQs surfaced as structured data on /about. Kept in sync with the
// FAQ_DATA array in pages/About.jsx — only the questions and plain-text
// answers are needed here.
const ABOUT_FAQS = [
  { q: 'What is AretaCare?', a: 'AretaCare is a secure platform for patients and caregivers to organize medical information, understand complex concepts, and prepare for clearer conversations with care teams. It keeps notes, documents, audio recordings, and updates together in one place.' },
  { q: 'How is this different than ChatGPT?', a: "AretaCare uses the same AI models, but it's built for a specific purpose. Instead of one-off chats, you get a dedicated place to organize your care information and collaborate with family or other caregivers. You also stay in control of your data, with the ability to add, edit, or delete anything at any time." },
  { q: 'Why are the AI responses so slow?', a: "There's a tradeoff when it comes to AI. Small models are fast and cheap, but their responses aren't always reliable and they struggle processing complex information. Large models are slow and expensive, but they're highly capable. We care most about quality, so we use large models even though responses take a little longer and are more expensive to generate." },
  { q: 'Are AI models trained on my data?', a: "No. We do not train our own models, and all data sent to OpenAI via the API is excluded from their model training. When you delete your AretaCare data, it's gone." },
  { q: 'Why can I only have five owned care sessions?', a: "Care sessions are designed as focused workspaces, not permanent archives. Care sessions where you're a collaborator don't count toward your owned care session limit. You can delete care sessions you no longer need in Settings, or transfer ownership to another collaborator." },
  { q: 'What kind of information can I store in AretaCare?', a: 'Anything that helps you manage care: notes and questions, documents and images, audio recordings, journal entries, appointment details, symptoms, medications, and updates.' },
  { q: 'Is my data secure?', a: 'Yes. Your data is encrypted in transit and at rest. All traffic is protected by enterprise-grade edge security. Accounts use hashed passwords, secure login tokens, email verification, and optional multi-factor authentication.' },
  { q: 'Who can see my information?', a: 'Only you and the people you invite to collaborate on a care session. AretaCare never sells your personal data or shares it with hospitals, insurers, advertisers, or data brokers.' },
  { q: 'Does AretaCare sell or share my data?', a: 'No. Your personal data is never sold or used for advertising. You stay in control of what you add and what you delete.' },
  { q: 'Is AretaCare a HIPAA-covered service?', a: 'No. AretaCare is a consumer-facing tool, not a HIPAA-covered entity or business associate. Even though HIPAA does not apply, AretaCare uses strong security and privacy practices like encrypted storage, secure authentication, and strict access controls.' },
  { q: 'Can I delete my data?', a: 'Yes. You can delete documents, audio recordings, journal entries, sessions, or your entire account.' },
  { q: 'Is my data backed up?', a: 'AretaCare does not maintain user-accessible backups. You should always keep your own copies of essential documents.' },
  { q: 'Does AretaCare give medical advice?', a: "No. AretaCare helps you understand information and stay organized, but it doesn't diagnose conditions, recommend treatments, or serve as medical advice." },
  { q: 'Can doctors use AretaCare with me?', a: "Not right now. AretaCare is designed for personal use by patients and caregivers. It isn't part of clinical workflows and shouldn't replace any official medical systems." },
  { q: 'Is AretaCare free?', a: 'The AretaCare web app is completely free. The iOS app requires a subscription after a 7-day free trial to help cover the additional cost of building and maintaining a native mobile experience.' },
  { q: 'Why does the mobile app cost money?', a: 'Maintaining a native iOS app is a significant undertaking on top of the web platform. The subscription helps cover this additional work so we can keep the web app free for everyone.' },
  { q: 'Is AretaCare open source?', a: 'Yes. Anyone can review how the platform works, suggest improvements, or verify how data is handled in our public GitHub repository.' },
];

const ABOUT_FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: ABOUT_FAQS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

export const ROUTE_SEO = {
  '/': {
    title: 'Healthcare Coach & Organizer for Patients & Families',
    description: 'AretaCare is a healthcare coach and organizer that helps patients and caregivers make sense of medical information, prepare for doctor visits, and keep care organized across family members.',
    jsonLd: [ORGANIZATION_JSON_LD, WEBSITE_JSON_LD],
  },
  '/about': {
    title: 'About AretaCare — Healthcare Coach & Organizer',
    description: 'AretaCare is a healthcare coach and organizer that helps patients and caregivers make sense of medical information, prepare for doctor visits, and keep care organized.',
    jsonLd: [ABOUT_FAQ_JSON_LD],
  },
  '/waitlist': {
    title: 'Join the Waitlist',
    description: "AretaCare is opening to new users in phases. Join the waitlist to be invited as space becomes available.",
  },
  '/login': {
    title: 'Sign in',
    description: 'Sign in to AretaCare to organize medical information, share care sessions with family, and prepare for healthcare conversations.',
  },
  '/register': {
    title: 'Create your account',
    description: 'Create a free AretaCare account to organize medical information, collaborate with family, and prepare for care team conversations.',
  },
  '/tools/jargon': {
    title: 'Medical Jargon Translator — Free Plain-English Definitions',
    description: 'Free medical jargon translator. Paste any medical term, abbreviation, lab value, or diagnosis and get a plain-English explanation written for patients and caregivers.',
  },
  '/tools/coach': {
    title: 'Doctor Visit Prep — Free Conversation Coach',
    description: 'Free coaching to prepare for doctor visits, specialist appointments, and family care conversations. Describe the situation and get questions and talking points to bring along.',
  },
  '/contact': {
    title: 'Contact AretaCare',
    description: "Share feedback, report bugs, or request features. We'd love to hear from you as we build AretaCare for patients and caregivers.",
  },
  '/terms': {
    title: 'Terms of Service',
    description: 'AretaCare Terms of Service. AretaCare is a consumer tool, not a medical service, and does not provide medical advice, diagnosis, or treatment.',
  },
  '/privacy': {
    title: 'Privacy Policy',
    description: 'AretaCare Privacy Policy. Learn how AretaCare collects, uses, and protects your information across the web and iOS apps.',
  },
};

export const fullTitleFor = (path) => {
  const meta = ROUTE_SEO[path];
  return meta?.title ? `${meta.title} | ${SITE_NAME}` : SITE_NAME;
};

export const SEO_DEFAULTS = {
  SITE_URL,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
  DEFAULT_DESCRIPTION,
};
