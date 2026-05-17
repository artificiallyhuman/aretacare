export const SITE_URL = 'https://www.aretacare.com';
export const SITE_NAME = 'AretaCare';
// 1200x630 banner used for OG/Twitter social previews.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/favicon/og-image.png`;
// Square logo for schema.org/Organization (Google Knowledge Panel expects square).
const ORG_LOGO = `${SITE_URL}/favicon/web-app-manifest-512x512.png`;

export const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AretaCare',
  legalName: 'AretaCare LLC',
  url: SITE_URL,
  logo: ORG_LOGO,
  description:
    'AretaCare is a healthcare coach and organizer that helps patients and caregivers make sense of medical information, prepare for doctor visits, and keep care organized.',
  sameAs: ['https://github.com/artificiallyhuman/aretacare'],
};

export const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
};
