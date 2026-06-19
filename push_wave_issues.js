#!/usr/bin/env node
/**
 * push_wave_issues.js
 *
 * Reads issues.md, parses every ## #N issue block, and pushes each one
 * to GitHub as a real issue via the REST API — one at a time, with
 * progress tracking so you can safely stop and resume at any point.
 *
 * ── Quick start ───────────────────────────────────────────────────────────────
 *
 *   export GITHUB_TOKEN=ghp_yourTokenHere
 *   export GITHUB_OWNER=YourOrgOrUser
 *   export GITHUB_REPO=stellar-trust-escrow
 *   node push_wave_issues.js
 *
 * ── Environment variables ─────────────────────────────────────────────────────
 *
 *   GITHUB_TOKEN     Required. Fine-grained PAT or classic token with
 *                    repo scope (issues: write).
 *
 *   GITHUB_OWNER     GitHub username or organisation.
 *                    Default: Stellar-Trust-Escrow
 *
 *   GITHUB_REPO      Repository name.
 *                    Default: stellar-trust-escrow
 *
 *   ISSUES_FILE      Path to the markdown source file.
 *                    Default: issues.md
 *
 *   DRY_RUN          Set to "true" to parse and preview every issue
 *                    without making any API calls.
 *                    Default: false
 *
 *   START_FROM       Issue number to begin at (inclusive).
 *                    Default: 1
 *
 *   END_AT           Issue number to stop at (inclusive).
 *                    Default: last issue in the file
 *
 *   DELAY_MS         Milliseconds to wait between consecutive API calls.
 *                    Default: 600
 *
 *   PROGRESS_FILE    JSON file used to persist which issues have already
 *                    been pushed so re-runs skip them automatically.
 *                    Default: .push_progress.json
 *
 * ── Resuming after an interruption ───────────────────────────────────────────
 *
 *   The script saves progress after every successful push. If you press
 *   Ctrl-C or the process crashes, simply run it again — previously
 *   pushed issues will be skipped automatically.
 *
 *   To start completely fresh, delete .push_progress.json (or whatever
 *   you set PROGRESS_FILE to).
 *
 * ── Dry-run preview ──────────────────────────────────────────────────────────
 *
 *   DRY_RUN=true node push_wave_issues.js
 *
 *   Prints every parsed issue title, labels, and the first 120 characters
 *   of the body without touching the GitHub API.
 */

import https    from 'https';
import fs       from 'fs';
import path     from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Configuration ────────────────────────────────────────────────────────────

const TOKEN         = process.env.GITHUB_TOKEN;
const OWNER         = process.env.GITHUB_OWNER  || 'Stellar-Trust-Escrow';
const REPO          = process.env.GITHUB_REPO   || 'stellar-trust-escrow';
const ISSUES_FILE   = process.env.ISSUES_FILE   || 'issues.md';
const DRY_RUN       = process.env.DRY_RUN       === 'true';
const START_FROM    = parseInt(process.env.START_FROM    || '1',      10);
const END_AT        = parseInt(process.env.END_AT        || '999999', 10);
const DELAY_MS      = parseInt(process.env.DELAY_MS      || '600',    10);
const PROGRESS_FILE = process.env.PROGRESS_FILE || '.push_progress.json';

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const USE_COLOR = process.stdout.isTTY !== false;

const C = USE_COLOR
  ? {
      reset:  '\x1b[0m',
      bold:   '\x1b[1m',
      dim:    '\x1b[2m',
      green:  '\x1b[32m',
      red:    '\x1b[31m',
      yellow: '\x1b[33m',
      cyan:   '\x1b[36m',
      magenta:'\x1b[35m',
      blue:   '\x1b[34m',
      grey:   '\x1b[90m',
    }
  : Object.fromEntries(
      ['reset','bold','dim','green','red','yellow','cyan','magenta','blue','grey']
        .map(k => [k, ''])
    );

const fmt = {
  ok:    s => `${C.green}${C.bold}✅  ${s}${C.reset}`,
  fail:  s => `${C.red}${C.bold}❌  ${s}${C.reset}`,
  skip:  s => `${C.grey}⏭   ${s}${C.reset}`,
  warn:  s => `${C.yellow}⚠️   ${s}${C.reset}`,
  info:  s => `${C.cyan}ℹ️   ${s}${C.reset}`,
  dry:   s => `${C.magenta}🔍  ${s}${C.reset}`,
  dim:   s => `${C.dim}${s}${C.reset}`,
  bold:  s => `${C.bold}${s}${C.reset}`,
  head:  s => `${C.bold}${C.blue}${s}${C.reset}`,
};

// ─── Label definitions ────────────────────────────────────────────────────────
//
//  These are created/ensured in the target repo before any issue is pushed.
//  A 422 response from GitHub ("label already exists") is treated as success.

const LABEL_DEFS = [
  // ── Category ──────────────────────────────────────────────────────────────
  { name: 'documentation',    color: '0052cc', description: 'Documentation and guides'              },
  { name: 'smart-contract',   color: 'e4e669', description: 'Soroban smart-contract work'           },
  { name: 'testing',          color: '0e8a16', description: 'Test coverage and harness'             },
  { name: 'security',         color: 'ee0701', description: 'Security related'                      },
  { name: 'dev-experience',   color: '5319e7', description: 'DX, tooling, CI/CD'                   },
  { name: 'advanced-feature', color: '1d76db', description: 'New feature implementation'           },
  { name: 'refactoring',      color: 'bfd4f2', description: 'Code quality and refactoring'         },
  // ── Difficulty ────────────────────────────────────────────────────────────
  { name: 'good first issue', color: '7057ff', description: 'Good for newcomers'                   },
  { name: 'intermediate',     color: 'fef2c0', description: 'Intermediate difficulty'              },
  { name: 'advanced',         color: 'd93f0b', description: 'Advanced difficulty'                  },
  // ── Priority ──────────────────────────────────────────────────────────────
  { name: 'priority: high',   color: 'b60205', description: 'High priority'                        },
  { name: 'priority: medium', color: 'fbca04', description: 'Medium priority'                      },
  { name: 'priority: low',    color: 'c5def5', description: 'Low priority'                         },
];

// ── Label lookup helpers ───────────────────────────────────────────────────────

function categoryLabel(raw) {
  const s = (raw || '').toLowerCase().trim();
  const map = {
    'documentation':    'documentation',
    'smart contract':   'smart-contract',
    'testing':          'testing',
    'security':         'security',
    'dev experience':   'dev-experience',
    'advanced features':'advanced-feature',
    'refactoring':      'refactoring',
  };
  return map[s] || null;
}

function difficultyLabel(raw) {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'beginner')     return 'good first issue';
  if (s === 'intermediate') return 'intermediate';
  if (s === 'advanced')     return 'advanced';
  return null;
}

function priorityLabel(raw) {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'high')   return 'priority: high';
  if (s === 'medium') return 'priority: medium';
  if (s === 'low')    return 'priority: low';
  return null;
}

// ─── Parser ──────────────────────────────────────────────────────────────────
//
//  The issues.md format uses lines of 50 dashes as separators between issues.
//  Each issue block has the structure:
//
//    ## #<number> <short title>
//
//    Title: <full title>
//
//    Body:
//
//    Category: <...>
//    Difficulty: <...>
//    Priority: <...>
//    Estimated Time: <...>
//
//    Description:
//    <...>
//
//    Requirements and Context:
//    <...>
//
//    Acceptance Criteria:
//    - [ ] <...>
//
//    Branch Suggestion:
//    <branch-name>
//
//    Commit Message Suggestions:
//    - `...`
//
//    PR Title:
//    <...>
//
//    PR Description:
//    <...>
//
//    Checklist:
//    - [ ] <...>

function parseIssues(raw) {
  // Split on separator lines (50 or more dashes on their own line)
  const blocks = raw
    .split(/^-{50,}\s*$/m)
    .map(b => b.trim())
    .filter(Boolean);

  const issues = [];

  for (const block of blocks) {
    // ── Issue header ─────────────────────────────────────────────────────────
    const headerMatch = block.match(/^##\s+#(\d+)\s+(.+)$/m);
    if (!headerMatch) continue; // not an issue block

    const number     = parseInt(headerMatch[1], 10);
    const shortTitle = headerMatch[2].trim();

    // ── Title field ──────────────────────────────────────────────────────────
    const titleMatch = block.match(/^Title:\s*(.+)$/m);
    const title      = titleMatch ? titleMatch[1].trim() : shortTitle;

    // ── Metadata fields ───────────────────────────────────────────────────────
    const field = (name) => {
      const m = block.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
      return m ? m[1].trim() : '';
    };

    const category   = field('Category');
    const difficulty = field('Difficulty');
    const priority   = field('Priority');
    const estTime    = field('Estimated Time');

    // ── Single-line-after-header fields ──────────────────────────────────────
    const nextLine = (header) => {
      const m = block.match(new RegExp(`^${header}:\\s*\\n([^\\n]+)`, 'm'));
      return m ? m[1].trim() : '';
    };

    const branch  = nextLine('Branch Suggestion');
    const prTitle = nextLine('PR Title');

    // ── Full body (everything after the "Body:" marker) ───────────────────────
    //
    //  We surface the entire structured body to GitHub so contributors get
    //  the Description, Requirements, Acceptance Criteria, Branch Suggestion,
    //  Commit Message Suggestions, PR Title, PR Description, and Checklist
    //  all inside the issue body exactly as written.

    const bodyParts = block.split(/^Body:\s*$/m);
    const body      = bodyParts.length > 1
      ? bodyParts.slice(1).join('\nBody:\n').trim()
      : block;

    // ── Labels ────────────────────────────────────────────────────────────────
    const labels = [
      categoryLabel(category),
      difficultyLabel(difficulty),
      priorityLabel(priority),
    ].filter(Boolean);

    issues.push({
      number,
      title,
      shortTitle,
      category,
      difficulty,
      priority,
      estTime,
      branch,
      prTitle,
      body,
      labels,
    });
  }

  // Guarantee ascending order by issue number
  issues.sort((a, b) => a.number - b.number);
  return issues;
}

// ─── GitHub REST API wrapper ──────────────────────────────────────────────────

function githubRequest(method, apiPath, payload) {
  return new Promise((resolve, reject) => {
    const data = payload ? JSON.stringify(payload) : null;

    const options = {
      hostname: 'api.github.com',
      path:     apiPath,
      method,
      headers: {
        'User-Agent':           'push-wave-issues/1.0',
        Authorization:          `Bearer ${TOKEN}`,
        Accept:                 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: raw });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function ensureLabel({ name, color, description }) {
  const res = await githubRequest(
    'POST',
    `/repos/${OWNER}/${REPO}/labels`,
    { name, color, description }
  );
  // 201 = created, 422 = already exists — both are acceptable
  if (res.status !== 201 && res.status !== 422) {
    console.warn(fmt.warn(`Label "${name}": unexpected status ${res.status}`));
  }
}

async function pushIssue(title, body, labels) {
  return githubRequest(
    'POST',
    `/repos/${OWNER}/${REPO}/issues`,
    { title, body, labels }
  );
}

// ─── Progress persistence ─────────────────────────────────────────────────────

function loadProgress() {
  try {
    const raw  = fs.readFileSync(PROGRESS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return {
      pushed:  Array.isArray(data.pushed) ? data.pushed : [],
      githubNumbers: data.githubNumbers || {},
    };
  } catch {
    return { pushed: [], githubNumbers: {} };
  }
}

function saveProgress(progress) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (e) {
    console.error(fmt.warn(`Could not save progress file: ${e.message}`));
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function truncate(str, max = 70) {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

function printHeader() {
  const bar = '─'.repeat(60);
  console.log(`\n${C.bold}${C.blue}${bar}${C.reset}`);
  console.log(`${C.bold}${C.blue}  🌊  Stellar Trust Escrow — Wave Issue Pusher${C.reset}`);
  console.log(`${C.bold}${C.blue}${bar}${C.reset}`);
  console.log(fmt.dim(`  Repo          : ${OWNER}/${REPO}`));
  console.log(fmt.dim(`  Issues file   : ${ISSUES_FILE}`));
  console.log(fmt.dim(`  Range         : #${START_FROM} → #${END_AT === 999999 ? 'last' : END_AT}`));
  console.log(fmt.dim(`  Delay         : ${DELAY_MS} ms between requests`));
  console.log(fmt.dim(`  Progress file : ${PROGRESS_FILE}`));
  if (DRY_RUN) {
    console.log(`\n  ${C.bold}${C.magenta}DRY RUN — no API calls will be made${C.reset}`);
  }
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();

  // ── Guard: token required outside dry-run ────────────────────────────────
  if (!TOKEN && !DRY_RUN) {
    console.error(fmt.fail('GITHUB_TOKEN is not set.'));
    console.error(fmt.dim('  export GITHUB_TOKEN=ghp_yourTokenHere'));
    process.exit(1);
  }

  // ── Load and parse the issues file ───────────────────────────────────────
  const filePath = path.resolve(__dirname, ISSUES_FILE);
  if (!fs.existsSync(filePath)) {
    console.error(fmt.fail(`Issues file not found: ${filePath}`));
    console.error(fmt.dim(`  Set ISSUES_FILE=<path> to point to your markdown file.`));
    process.exit(1);
  }

  const raw       = fs.readFileSync(filePath, 'utf8');
  const allIssues = parseIssues(raw);

  if (allIssues.length === 0) {
    console.error(fmt.fail('No issues parsed from the file.'));
    console.error(fmt.dim('  Make sure the file uses the expected format (## #N ... separators).'));
    process.exit(1);
  }

  console.log(fmt.info(`Parsed ${C.bold}${allIssues.length}${C.reset} issues from ${ISSUES_FILE}`));

  // ── Filter to requested range ─────────────────────────────────────────────
  const rangeIssues = allIssues.filter(i => i.number >= START_FROM && i.number <= END_AT);

  if (rangeIssues.length === 0) {
    console.log(fmt.warn(`No issues fall within range #${START_FROM}–#${END_AT}. Nothing to do.`));
    process.exit(0);
  }

  // ── Load progress and partition into skip / push ──────────────────────────
  const progress    = loadProgress();
  const alreadyDone = new Set(progress.pushed);

  const toSkip = rangeIssues.filter(i => alreadyDone.has(i.number));
  const toPush = rangeIssues.filter(i => !alreadyDone.has(i.number));

  if (toSkip.length > 0) {
    console.log(fmt.info(`Skipping ${C.bold}${toSkip.length}${C.reset} already-pushed issues (from ${PROGRESS_FILE})`));
  }
  console.log(fmt.info(`Issues to push this run: ${C.bold}${toPush.length}${C.reset}\n`));

  if (toPush.length === 0) {
    console.log(fmt.ok('Nothing left to push. All done!'));
    process.exit(0);
  }

  // ── DRY RUN: print preview and exit ──────────────────────────────────────
  if (DRY_RUN) {
    console.log(fmt.head(`── Preview (${toPush.length} issues) ───────────────────────`));
    for (const issue of toPush) {
      console.log(
        `\n  ${C.bold}#${issue.number}${C.reset} ${truncate(issue.title, 72)}`
      );
      console.log(fmt.dim(`  Labels  : ${issue.labels.join(', ') || '(none)'}`));
      console.log(fmt.dim(`  Branch  : ${issue.branch || '(not specified)'}`));
      console.log(fmt.dim(`  Body[0] : ${truncate(issue.body.replace(/\s+/g, ' '), 120)}`));
    }
    console.log(`\n${fmt.ok(`Dry run complete — ${toPush.length} issues previewed`)}`);
    process.exit(0);
  }

  // ── Seed labels in the target repo ───────────────────────────────────────
  process.stdout.write(`${C.cyan}📌  Seeding ${LABEL_DEFS.length} labels...${C.reset} `);
  for (const label of LABEL_DEFS) {
    await ensureLabel(label);
  }
  console.log('done\n');

  // ── Graceful Ctrl-C handler ───────────────────────────────────────────────
  let interrupted = false;
  process.on('SIGINT', () => {
    interrupted = true;
    console.log(`\n\n${C.yellow}${C.bold}⚡  Interrupted by user. Saving progress...${C.reset}`);
    saveProgress(progress);
    console.log(fmt.dim(`  Progress saved to ${PROGRESS_FILE}`));
    console.log(fmt.dim('  Re-run the script to continue from where you left off.\n'));
    process.exit(0);
  });

  // ── Push loop ─────────────────────────────────────────────────────────────
  let created = 0;
  let failed  = 0;
  let retries = 0;

  for (let idx = 0; idx < toPush.length; idx++) {
    if (interrupted) break;

    const issue   = toPush[idx];
    const counter = `[${pad(issue.number)}/${pad(allIssues.length)}]`;
    const preview = truncate(issue.title, 58);

    process.stdout.write(`${C.bold}${counter}${C.reset} ${preview} `);

    // ── Attempt with up to 3 retries on rate-limit / transient error ────────
    let pushed   = false;
    let attempts = 0;

    while (attempts < 3 && !pushed && !interrupted) {
      attempts++;

      let res;
      try {
        res = await pushIssue(issue.title, issue.body, issue.labels);
      } catch (networkErr) {
        const wait = 3000 * attempts;
        process.stdout.write(fmt.warn(`Network error (${networkErr.message}) — retry in ${wait / 1000}s `));
        await sleep(wait);
        retries++;
        continue;
      }

      if (res.status === 201) {
        // ── Success ──────────────────────────────────────────────────────────
        const ghNum = res.body.number;
        const url   = res.body.html_url || '';
        process.stdout.write(fmt.ok(`#${ghNum}\n`));
        if (url) process.stdout.write(fmt.dim(`         ${url}\n`));

        progress.pushed.push(issue.number);
        progress.githubNumbers[issue.number] = ghNum;
        saveProgress(progress);
        created++;
        pushed = true;

      } else if (res.status === 429) {
        // ── Primary rate limit ────────────────────────────────────────────────
        const retryAfter = parseInt(res.headers['retry-after'] || '60', 10);
        process.stdout.write(`\n  ${fmt.warn(`Rate-limited — waiting ${retryAfter}s before retry ${attempts}/3`)}\n`);
        await sleep(retryAfter * 1000);
        retries++;

      } else if (res.status === 403) {
        // ── Secondary rate limit or forbidden ────────────────────────────────
        const msg = res.body?.message || '';
        if (msg.toLowerCase().includes('secondary rate limit') || msg.toLowerCase().includes('abuse')) {
          const wait = 60 * attempts;
          process.stdout.write(`\n  ${fmt.warn(`Secondary rate limit — waiting ${wait}s`)}\n`);
          await sleep(wait * 1000);
          retries++;
        } else {
          process.stdout.write(fmt.fail(`Forbidden — check token scope (needs repo / issues:write)\n`));
          process.stdout.write(fmt.dim(`  Message: ${msg}\n`));
          failed++;
          pushed = true; // don't retry — permanent error
        }

      } else if (res.status === 404) {
        // ── Repo not found — fatal ────────────────────────────────────────────
        process.stdout.write(fmt.fail(`404 — repo "${OWNER}/${REPO}" not found or token has no access\n`));
        saveProgress(progress);
        process.exit(1);

      } else if (res.status === 410) {
        // ── Issues disabled on repo ────────────────────────────────────────────
        process.stdout.write(fmt.fail(`410 — Issues are disabled on ${OWNER}/${REPO}\n`));
        saveProgress(progress);
        process.exit(1);

      } else {
        // ── Other non-retryable error ─────────────────────────────────────────
        const msg = typeof res.body === 'object'
          ? (res.body.message || JSON.stringify(res.body))
          : String(res.body);
        process.stdout.write(fmt.fail(`HTTP ${res.status}: ${truncate(msg, 120)}\n`));
        failed++;
        pushed = true; // stop retrying
      }
    }

    if (!pushed && !interrupted) {
      process.stdout.write(fmt.fail(`Gave up on issue #${issue.number} after ${attempts} attempts\n`));
      failed++;
    }

    // ── Polite delay between requests ─────────────────────────────────────────
    if (idx < toPush.length - 1 && !interrupted) {
      await sleep(DELAY_MS);
    }
  }

  // ── Final save ────────────────────────────────────────────────────────────
  saveProgress(progress);

  // ── Summary ───────────────────────────────────────────────────────────────
  const bar = '─'.repeat(50);
  console.log(`\n${C.bold}${bar}${C.reset}`);
  console.log(`  ${C.bold}${C.green}✅  Created  : ${created}${C.reset}`);
  if (failed  > 0) console.log(`  ${C.bold}${C.red}❌  Failed   : ${failed}${C.reset}`);
  if (retries > 0) console.log(`  ${C.yellow}♻️   Retries  : ${retries}${C.reset}`);
  console.log(fmt.dim(`  Progress saved → ${PROGRESS_FILE}`));
  console.log(`${C.bold}${bar}${C.reset}`);

  const remaining = allIssues.length - progress.pushed.length;
  if (remaining > 0) {
    console.log(fmt.warn(`${remaining} issue(s) not yet pushed. Re-run to continue.\n`));
  } else {
    console.log(fmt.ok(`All ${allIssues.length} issues have been pushed!\n`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

main().catch(err => {
  console.error(fmt.fail(`Unexpected error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
