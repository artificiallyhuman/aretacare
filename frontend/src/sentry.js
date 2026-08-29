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
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers.Authorization;
          delete event.request.headers.Cookie;
        }
        if (event.request.url) {
          event.request.url = event.request.url.split('?')[0];
        }
      }
      delete event.user;
      return event;
    },
    beforeBreadcrumb(crumb) {
      // xhr/fetch breadcrumbs never include bodies, but URLs can carry query
      // params (presigned S3 links, tokens) — keep host/path only.
      if ((crumb.category === 'xhr' || crumb.category === 'fetch') && crumb.data?.url) {
        crumb.data.url = crumb.data.url.split('?')[0];
      }
      return crumb;
    },
  });
}
