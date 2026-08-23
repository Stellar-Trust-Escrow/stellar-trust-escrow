#!/usr/bin/env node
/**
 * tighten-csp.js
 *
 * Advisory only — never modifies helmetOptions.js or commits anything.
 * Fetches a page's GET response, scans the returned HTML/JS for
 * script/style/font/img sources that aren't already covered by the
 * current CSP, and prints a suggestion for what to add to
 * config/helmetOptions.js. A human decides whether to act on it.
 *
 * Usage: node scripts/tighten-csp.js --url http://localhost:4000
 */
import { helmetOptions } from '../config/helmetOptions.js';

function extractSources(html) {
  const sources = { script: new Set(), style: new Set(), img: new Set(), font: new Set() };

  const patterns = [
    [/<script[^>]+src=["']([^"']+)["']/gi, 'script'],
    [/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi, 'style'],
    [/<img[^>]+src=["']([^"']+)["']/gi, 'img'],
    [/@font-face[^}]*url\(["']?([^"')]+)["']?\)/gi, 'font'],
  ];

  for (const [pattern, kind] of patterns) {
    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = pattern.exec(html)) !== null) {
      const src = match[1];
      if (src.startsWith('http://') || src.startsWith('https://')) {
        try {
          sources[kind].add(new URL(src).origin);
        } catch {
          // ignore unparsable URLs
        }
      }
    }
  }

  return sources;
}

function directiveArray(directives, key) {
  return (directives[key] || directives.defaultSrc || []).map(String);
}

export function suggestAdditions(html) {
  const found = extractSources(html);
  const directives = helmetOptions.contentSecurityPolicy?.directives || {};

  const mapping = [
    ['script', 'scriptSrc'],
    ['style', 'styleSrc'],
    ['img', 'imgSrc'],
    ['font', 'fontSrc'],
  ];

  const suggestions = {};
  for (const [kind, directiveKey] of mapping) {
    const existing = new Set(directiveArray(directives, directiveKey));
    const missing = [...found[kind]].filter((origin) => !existing.has(origin));
    if (missing.length > 0) suggestions[directiveKey] = missing;
  }

  return suggestions;
}

function printSuggestions(suggestions) {
  const keys = Object.keys(suggestions);
  if (keys.length === 0) {
    console.log('No CSP tightening suggestions — all observed sources are already covered.');
    return;
  }

  console.log('CSP tightening suggestions (advisory only — nothing was changed):\n');
  for (const key of keys) {
    console.log(`  ${key}: add ${suggestions[key].map((s) => `'${s}'`).join(', ')}`);
  }
  console.log('\nReview and add these to backend/config/helmetOptions.js manually if legitimate.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const urlFlagIndex = args.indexOf('--url');
  const targetUrl = urlFlagIndex !== -1 ? args[urlFlagIndex + 1] : null;

  if (!targetUrl) {
    console.error('Usage: node scripts/tighten-csp.js --url <url>');
    process.exit(1);
  }

  fetch(targetUrl)
    .then((res) => res.text())
    .then((html) => {
      const suggestions = suggestAdditions(html);
      printSuggestions(suggestions);
      process.exit(0); // advisory — never fails CI
    })
    .catch((err) => {
      console.error('tighten-csp.js errored:', err.message);
      process.exit(0); // still advisory-only, don't fail CI on a fetch error
    });
}
