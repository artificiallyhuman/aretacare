import React from 'react';

/**
 * Link renderer for ReactMarkdown. Only allows safe URL protocols
 * (http, https, mailto, and relative links); anything else renders as plain
 * text. Allowed links open in a new tab with noopener/noreferrer.
 *
 * react-markdown v9 already sanitizes dangerous URLs by default; this adds an
 * explicit allowlist plus consistent link behavior across the app.
 */
export function MarkdownLink({ href, children, ...props }) {
  const isSafe = (() => {
    if (!href) return false;
    try {
      // Relative URLs resolve against the current origin → http(s), allowed.
      const url = new URL(href, window.location.origin);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol);
    } catch {
      return false;
    }
  })();

  if (!isSafe) {
    return <span {...props}>{children}</span>;
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline" {...props}>
      {children}
    </a>
  );
}

/** Components object for bare ReactMarkdown usages that only need link safety. */
export const markdownLinkComponents = { a: MarkdownLink };
