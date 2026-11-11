import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom';

// Same guard as SEO.jsx — never init inside the Puppeteer prerender, which
// would emit noise events and could interfere with the HTML capture.
const isPrerender =
  typeof navigator !== 'undefined' && /HeadlessChrome/i.test(navigator.userAgent);

// Host and path only: query strings and fragments can carry single-use tokens,
// presigned-URL signatures and search terms.
const stripQuery = (value) =>
  typeof value === 'string' ? value.split('?')[0].split('#')[0] : value;

// Span attributes that hold a URL, or part of one.
const URL_DATA_KEYS = ['http.url', 'url.full', 'url', 'http.target', 'url.path', 'server.address.url'];
const QUERY_DATA_KEYS = ['http.query', 'url.query', 'http.fragment', 'url.fragment'];

const scrubSpanData = (data) => {
  if (!data || typeof data !== 'object') return;
  URL_DATA_KEYS.forEach((key) => {
    if (data[key]) data[key] = stripQuery(data[key]);
  });
  QUERY_DATA_KEYS.forEach((key) => {
    delete data[key];
  });
};

const scrubRequest = (request) => {
  if (!request) return;
  delete request.cookies;
  delete request.data;
  delete request.query_string;
  if (request.headers) {
    delete request.headers.Authorization;
    delete request.headers.Cookie;
    ['Referer', 'referer'].forEach((name) => {
      if (request.headers[name]) request.headers[name] = stripQuery(request.headers[name]);
    });
  }
  if (request.url) request.url = stripQuery(request.url);
};

/**
 * Initialize Sentry error monitoring. No-op when VITE_SENTRY_DSN is unset
 * (local dev default) or during build-time prerendering.
 *
 * PII posture: AretaCare handles health data. No request bodies, cookies,
 * auth headers, query strings, or user identity may reach Sentry. Session
 * replay is deliberately excluded — PHI is on screen.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || isPrerender) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    // Release is injected by @sentry/vite-plugin at build time.
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    integrations: [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    ignoreErrors: [
      // Benign browser noise
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Browser-extension content scripts (DuckDuckGo Mobile privacy features,
      // etc.) injected into the page; denyUrls can't catch them on iOS WebKit
      // because the injected frames carry the page's own URL.
      /runtime\.sendMessage/,
      'Extension context invalidated',
      // Connectivity failures are handled by NetworkContext's banner and
      // captured server-side when they matter
      'Network Error',
      'Failed to fetch',
      'Load failed',
      // Deliberate cancellations (120s send timeout, care session switches)
      'AbortError',
      'CanceledError',
      'Request aborted',
    ],
    denyUrls: [
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^safari-extension:\/\//,
    ],
    beforeSend(event) {
      // Strip anything that could carry auth material or user content.
      scrubRequest(event.request);
      delete event.user;
      return event;
    },
    // Tracing events are separate from error events and do not pass through
    // beforeSend. Their spans record the full URL of every XHR and every loaded
    // resource (presigned S3 links for documents and thumbnails included), so they
    // get the same host/path-only treatment.
    beforeSendTransaction(event) {
      scrubRequest(event.request);
      delete event.user;
      if (event.transaction) event.transaction = stripQuery(event.transaction);
      const trace = event.contexts?.trace;
      if (trace) {
        if (trace.description) trace.description = stripQuery(trace.description);
        scrubSpanData(trace.data);
      }
      if (Array.isArray(event.spans)) {
        event.spans.forEach((span) => {
          if (span.description) span.description = stripQuery(span.description);
          scrubSpanData(span.data);
        });
      }
      return event;
    },
    beforeSendSpan(span) {
      if (span.description) span.description = stripQuery(span.description);
      if (span.name) span.name = stripQuery(span.name);
      scrubSpanData(span.data);
      scrubSpanData(span.attributes);
      return span;
    },
    beforeBreadcrumb(crumb) {
      // xhr/fetch breadcrumbs never include bodies, but URLs can carry query
      // params (presigned S3 links, tokens) — keep host/path only.
      if ((crumb.category === 'xhr' || crumb.category === 'fetch') && crumb.data?.url) {
        crumb.data.url = stripQuery(crumb.data.url);
      }
      // Navigation breadcrumbs carry full from/to paths, and this app puts
      // single-use secrets in the query string (/reset-password?token=…,
      // /verify-email?token=…, /register?token=…&email=…).
      if (crumb.category === 'navigation' && crumb.data) {
        if (crumb.data.from) crumb.data.from = stripQuery(crumb.data.from);
        if (crumb.data.to) crumb.data.to = stripQuery(crumb.data.to);
      }
      // Click/input breadcrumbs describe the target element including its title,
      // alt and aria-label, which here hold document filenames and people's names.
      // Keep the fact that an interaction happened, not what was clicked.
      if (typeof crumb.category === 'string' && crumb.category.startsWith('ui.')) {
        crumb.message = '';
        delete crumb.data;
      }
      return crumb;
    },
  });
}
