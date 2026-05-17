import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import { ROUTE_SEO, SEO_DEFAULTS } from '../constants/seoRoutes';

// SEO contributes nothing to the React tree (returns null) so it can't cause
// any hydration mismatch. Head updates happen post-mount via direct DOM
// mutation. The initial render's head is already correct because the prerender
// postProcess in vite.config.js injects the right tags at build time.

function setMetaTag(selector, attrName, attrValue, content) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setRobotsNoindex(noindex) {
  const existing = document.head.querySelector('meta[name="robots"]');
  if (noindex) {
    if (existing) {
      existing.setAttribute('content', 'noindex, nofollow');
    } else {
      const el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      el.setAttribute('content', 'noindex, nofollow');
      document.head.appendChild(el);
    }
  } else if (existing) {
    existing.remove();
  }
}

function syncJsonLd(scripts) {
  // Replace any existing JSON-LD blocks tagged as ours so we don't accumulate.
  document.head
    .querySelectorAll('script[type="application/ld+json"][data-seo="route"]')
    .forEach((s) => s.remove());
  for (const obj of scripts) {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.setAttribute('data-seo', 'route');
    el.text = JSON.stringify(obj);
    document.head.appendChild(el);
  }
}

function SEO({ title: titleOverride, description: descriptionOverride, noindex = false }) {
  const location = useLocation();
  const path = location.pathname;
  const route = ROUTE_SEO[path];

  const baseTitle = titleOverride || route?.title;
  const title = baseTitle
    ? `${baseTitle} | ${SEO_DEFAULTS.SITE_NAME}`
    : SEO_DEFAULTS.SITE_NAME;
  const description =
    descriptionOverride || route?.description || SEO_DEFAULTS.DEFAULT_DESCRIPTION;
  const canonical = `${SEO_DEFAULTS.SITE_URL}${path}`;
  const ogImage = SEO_DEFAULTS.DEFAULT_OG_IMAGE;
  const jsonLd = route?.jsonLd || [];
  const jsonLdKey = JSON.stringify(jsonLd);

  useEffect(() => {
    // Skip head mutation while running under the prerender's headless browser.
    // postProcess in vite.config.js injects the correct head at build time;
    // running this effect inside Puppeteer would duplicate the JSON-LD scripts
    // and double-write the meta tags.
    if (typeof navigator !== 'undefined' && /HeadlessChrome/i.test(navigator.userAgent)) {
      return;
    }
    document.title = title;
    setMetaTag('meta[name="description"]', 'name', 'description', description);
    setCanonical(canonical);
    setRobotsNoindex(noindex);
    setMetaTag('meta[property="og:title"]', 'property', 'og:title', title);
    setMetaTag('meta[property="og:description"]', 'property', 'og:description', description);
    setMetaTag('meta[property="og:url"]', 'property', 'og:url', canonical);
    setMetaTag('meta[property="og:image"]', 'property', 'og:image', ogImage);
    setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    setMetaTag('meta[name="twitter:image"]', 'name', 'twitter:image', ogImage);
    syncJsonLd(jsonLd);
  }, [title, description, canonical, ogImage, noindex, jsonLdKey, jsonLd]);

  return null;
}

SEO.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  noindex: PropTypes.bool,
};

export default SEO;
