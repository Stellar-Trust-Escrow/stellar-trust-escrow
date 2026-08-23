#!/usr/bin/env node
/**
 * audit-security-headers.js
 *
 * Makes an HTTP request to a running server (local :{PORT} in CI, or an
 * optional --url for staging) and checks for required security headers.
 * Prints a /100 score. Exits 1 if score < 90 or a critical header
 * (Content-Security-Policy, Strict-Transport-Security) is missing/invalid.
 *
 * Usage:
 *   node scripts/audit-security-headers.js                  # http://localhost:{PORT}
 *   node scripts/audit-security-headers.js --url https://staging.example.com
 */
import fs from 'fs';
import path from 'path';
import parseCsp from 'content-security-policy-parser';

const SCORE_HISTORY_FILE = path.join(process.cwd(), 'security-header-scores.jsonl');
const MIN_HSTS_MAX_AGE = 31536000; // 1 year, per acceptance criteria
const PASS_THRESHOLD = 90;

// ── Individual header checks ────────────────────────────────────────────────────
// Each check returns { points, max, critical, messages: string[] }.

function checkCsp(headers) {
  const max = 30;
  const critical = true;
  const value = headers.get('content-security-policy');
  if (!value) {
    return { points: 0, max, critical, messages: ['Content-Security-Policy header is missing.'] };
  }

  const directives = parseCsp(value); // Map<string, string[]>
  const messages = [];
  let points = 0;

  const defaultSrc = directives.get('default-src') || [];
  if (defaultSrc.includes("'self'")) {
    points += 10;
  } else {
    messages.push("default-src must include 'self'.");
  }

  const scriptSrc = directives.get('script-src') || defaultSrc;
  if (scriptSrc.length === 0) {
    messages.push('script-src (or default-src) is not defined.');
  } else if (scriptSrc.includes("'unsafe-eval'")) {
    messages.push("script-src must not include 'unsafe-eval'.");
  } else {
    points += 15;
  }

  if (directives.size > 0) {
    points += 5; // structurally valid, multi-directive CSP present
  }

  return { points, max, critical, messages };
}

function checkHsts(headers) {
  const max = 20;
  const critical = true;
  const value = headers.get('strict-transport-security');
  if (!value) {
    return { points: 0, max, critical, messages: ['Strict-Transport-Security header is missing.'] };
  }

  const messages = [];
  let points = 0;

  const maxAgeMatch = value.match(/max-age=(\d+)/i);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
  if (maxAge >= MIN_HSTS_MAX_AGE) {
    points += 15;
  } else {
    messages.push(`Strict-Transport-Security max-age (${maxAge}) is below the required ${MIN_HSTS_MAX_AGE}.`);
  }

  if (/includesubdomains/i.test(value)) {
    points += 5;
  } else {
    messages.push('Strict-Transport-Security must include includeSubDomains.');
  }

  return { points, max, critical, messages };
}

function checkXFrameOptions(headers) {
  const max = 15;
  const value = (headers.get('x-frame-options') || '').toUpperCase();
  if (value === 'DENY' || value === 'SAMEORIGIN') {
    return { points: max, max, critical: false, messages: [] };
  }
  return {
    points: 0,
    max,
    critical: false,
    messages: [`X-Frame-Options must be DENY or SAMEORIGIN (got "${value || '(missing)'}").`],
  };
}

function checkXContentTypeOptions(headers) {
  const max = 15;
  const value = (headers.get('x-content-type-options') || '').toLowerCase();
  if (value === 'nosniff') {
    return { points: max, max, critical: false, messages: [] };
  }
  return { points: 0, max, critical: false, messages: ['X-Content-Type-Options must be "nosniff".'] };
}

function checkReferrerPolicy(headers) {
  const max = 10;
  // Ordered strictest-first; "strict-origin-when-cross-origin or stricter"
  const ACCEPTABLE = [
    'no-referrer',
    'same-origin',
    'strict-origin',
    'strict-origin-when-cross-origin',
  ];
  const value = (headers.get('referrer-policy') || '').toLowerCase();
  if (ACCEPTABLE.includes(value)) {
    return { points: max, max, critical: false, messages: [] };
  }
  return {
    points: 0,
    max,
    critical: false,
    messages: [`Referrer-Policy must be strict-origin-when-cross-origin or stricter (got "${value || '(missing)'}").`],
  };
}

function checkPermissionsPolicy(headers) {
  const max = 10;
  const value = (headers.get('permissions-policy') || '').toLowerCase();
  if (!value) {
    return { points: 0, max, critical: false, messages: ['Permissions-Policy header is missing.'] };
  }
  const disablesAll = ['camera', 'microphone', 'geolocation'].every((feature) =>
    new RegExp(`${feature}=\\(\\)`).test(value),
  );
  if (disablesAll) {
    return { points: max, max, critical: false, messages: [] };
  }
  return {
    points: 0,
    max,
    critical: false,
    messages: ['Permissions-Policy must disable camera, microphone, and geolocation.'],
  };
}

const CHECKS = [
  ['Content-Security-Policy', checkCsp],
  ['Strict-Transport-Security', checkHsts],
  ['X-Frame-Options', checkXFrameOptions],
  ['X-Content-Type-Options', checkXContentTypeOptions],
  ['Referrer-Policy', checkReferrerPolicy],
  ['Permissions-Policy', checkPermissionsPolicy],
];

export async function auditHeaders(url) {
  const res = await fetch(url);
  const headers = res.headers;

  const results = CHECKS.map(([name, fn]) => ({ name, ...fn(headers) }));
  const totalPoints = results.reduce((sum, r) => sum + r.points, 0);
  const totalMax = results.reduce((sum, r) => sum + r.max, 0);
  const score = Math.round((totalPoints / totalMax) * 100);

  const criticalFailures = results.filter((r) => r.critical && r.points < r.max);

  return { score, results, criticalFailures, status: res.status };
}

function printReport({ score, results, status }) {
  console.log(`\nSecurity Headers Audit — response status ${status}\n`);
  for (const r of results) {
    const mark = r.points === r.max ? '✅' : r.points > 0 ? '⚠️ ' : '❌';
    console.log(`${mark} ${r.name}: ${r.points}/${r.max}`);
    for (const msg of r.messages) console.log(`    - ${msg}`);
  }
  console.log(`\nScore: ${score}/100\n`);
}

function appendScoreHistory(score) {
  const entry = {
    date: new Date().toISOString(),
    score,
    commit_sha: process.env.GITHUB_SHA || 'local',
  };
  fs.appendFileSync(SCORE_HISTORY_FILE, `${JSON.stringify(entry)}\n`);
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const urlFlagIndex = args.indexOf('--url');
  const targetUrl =
    urlFlagIndex !== -1 && args[urlFlagIndex + 1]
      ? args[urlFlagIndex + 1]
      : `http://localhost:${process.env.PORT || 4000}/api/health/live`;

  auditHeaders(targetUrl)
    .then((result) => {
      printReport(result);
      appendScoreHistory(result.score);

      if (result.criticalFailures.length > 0) {
        console.error(
          `FAILED: missing/invalid critical header(s): ${result.criticalFailures.map((f) => f.name).join(', ')}`,
        );
        process.exit(1);
      }
      if (result.score < PASS_THRESHOLD) {
        console.error(`FAILED: score ${result.score} is below the required ${PASS_THRESHOLD}.`);
        process.exit(1);
      }
      if (result.score < 100) {
        console.warn(`PASSED with warning: score ${result.score} is below 100.`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Security headers audit errored:', err.message);
      process.exit(1);
    });
}
