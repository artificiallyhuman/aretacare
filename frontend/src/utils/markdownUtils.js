/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Must be called before inserting user content into HTML.
 */
const escapeHtml = (text) => {
  const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
};

// Simple markdown to HTML converter for clipboard
export const markdownToHtml = (markdown) => {
  // First, escape HTML to prevent XSS attacks
  let html = escapeHtml(markdown);

  // Bold (do before italic to avoid conflicts)
  // Note: We're replacing escaped asterisks/underscores since we escaped HTML first
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Split into lines for processing
  const lines = html.split('\n');
  const processed = [];
  let listStack = []; // Track nested lists

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Horizontal rule
    if (trimmed.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      // Close any open lists
      while (listStack.length > 0) {
        processed.push(`</${listStack.pop()}>`);
      }
      processed.push('<hr>');
      continue;
    }

    // Headers (with inline styles to match conversation display)
    if (trimmed.match(/^### /)) {
      while (listStack.length > 0) { processed.push(`</${listStack.pop()}>`); }
      processed.push(trimmed.replace(/^### (.*)$/, '<h3 style="font-size: 1em; font-weight: 600; margin: 0.5em 0;">$1</h3>'));
      continue;
    } else if (trimmed.match(/^## /)) {
      while (listStack.length > 0) { processed.push(`</${listStack.pop()}>`); }
      processed.push(trimmed.replace(/^## (.*)$/, '<h2 style="font-size: 1.125em; font-weight: 600; margin: 0.5em 0;">$1</h2>'));
      continue;
    } else if (trimmed.match(/^# /)) {
      while (listStack.length > 0) { processed.push(`</${listStack.pop()}>`); }
      processed.push(trimmed.replace(/^# (.*)$/, '<h1 style="font-size: 1.25em; font-weight: 700; margin: 0.5em 0;">$1</h1>'));
      continue;
    }

    // Calculate indentation level
    const indent = line.search(/\S/);
    const indentLevel = indent === -1 ? 0 : Math.floor(indent / 2);

    // Check for list items (unordered or ordered)
    const ulMatch = trimmed.match(/^[\*\-] (.*)$/);
    const olMatch = trimmed.match(/^\d+\. (.*)$/);

    if (ulMatch || olMatch) {
      const content = ulMatch ? ulMatch[1] : olMatch[1];
      const listType = ulMatch ? 'ul' : 'ol';

      // Adjust list stack to match current indent level
      while (listStack.length > indentLevel + 1) {
        processed.push(`</${listStack.pop()}>`);
      }

      // Open new list if needed
      if (listStack.length === indentLevel) {
        processed.push(`<${listType}>`);
        listStack.push(listType);
      }

      processed.push(`<li>${content}</li>`);
      continue;
    }

    // Empty line
    if (trimmed === '') {
      // Close all lists on empty line
      while (listStack.length > 0) {
        processed.push(`</${listStack.pop()}>`);
      }
      // Only add paragraph break if there's more content coming
      if (i < lines.length - 1 && lines[i + 1].trim() !== '') {
        processed.push('</p><p>');
      }
      continue;
    }

    // Regular text
    if (listStack.length > 0) {
      while (listStack.length > 0) {
        processed.push(`</${listStack.pop()}>`);
      }
    }
    processed.push(line + '<br>');
  }

  // Close any remaining open lists
  while (listStack.length > 0) {
    processed.push(`</${listStack.pop()}>`);
  }

  // Join and wrap in paragraph
  html = '<p>' + processed.join('') + '</p>';

  // Clean up
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<[uo]l>)/g, '$1');
  html = html.replace(/(<\/[uo]l>)<\/p>/g, '$1');
  html = html.replace(/<p>(<h[123]>)/g, '$1');
  html = html.replace(/(<\/h[123]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr>)/g, '$1');
  html = html.replace(/(<hr>)<\/p>/g, '$1');
  html = html.replace(/<br><\/p>/g, '</p>');
  html = html.replace(/<p><br>/g, '<p>');

  return html;
};
