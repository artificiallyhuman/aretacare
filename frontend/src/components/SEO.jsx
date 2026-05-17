import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import { ROUTE_SEO, SEO_DEFAULTS } from '../constants/seoRoutes';

// Reads per-route metadata from ROUTE_SEO based on the current pathname.
// Same data is consumed by the prerender postProcess hook in vite.config.js,
// so the static HTML and the client-side head stay in sync.
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

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SEO_DEFAULTS.SITE_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {jsonLd.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}

SEO.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  noindex: PropTypes.bool,
};

export default SEO;
