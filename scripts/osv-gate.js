/**
 * osv-gate.js
 *
 * Scans an SBOM's components against the OSV database (batched querybatch
 * call, plus a per-vulnerability lookup for the CVSS score), then applies
 * the exploitability gate:
 *
 *   - CVSS >= 7.0 (high) in a DIRECT dependency -> CI fails (exit 1)
 *   - CVSS >= 7.0 in a TRANSITIVE-only dependency -> warning only, CI passes
 *
 * "Direct" is determined from the dependencies/devDependencies fields of the
 * relevant package.json files (npm) and the [dependencies] table of
 * Cargo.toml files (Rust) — not from the SBOM itself, since a flat SBOM
 * component list doesn't encode the dependency graph depth.
 *
 * Usage:
 *   node scripts/osv-gate.js <sbom.json> <direct-deps.json> <out.md>
 *
 * <direct-deps.json> is produced by scripts/collect-direct-deps.js.
 */
import fs from 'fs';

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const OSV_VULN_URL = (id) => `https://api.osv.dev/v1/vulns/${id}`;
const BATCH_CHUNK_SIZE = 100;
const HIGH_SEVERITY_THRESHOLD = 7.0;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function extractCvssScore(vuln) {
  // OSV represents severity in a few shapes depending on the source feed.
  const cvssEntry = (vuln.severity || []).find((s) => s.type?.startsWith('CVSS'));
  if (cvssEntry?.score) {
    const parsed = parseFloat(cvssEntry.score);
    if (Number.isFinite(parsed)) return parsed;
    // Some feeds put the full vector string in `score`; base score isn't
    // trivially parseable from the vector, so fall through to database_specific.
  }
  const dbScore = vuln.database_specific?.cvss?.score ?? vuln.database_specific?.severity;
  if (Number.isFinite(dbScore)) return dbScore;
  return null;
}

export async function queryBatch(components, fetchImpl = fetch) {
  const queries = components.map((c) => ({
    package: { name: c.name, ecosystem: c.ecosystem },
    version: c.version,
  }));

  const results = [];
  for (const batch of chunk(queries, BATCH_CHUNK_SIZE)) {
    const res = await fetchImpl(OSV_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: batch }),
    });
    if (!res.ok) throw new Error(`OSV querybatch failed: HTTP ${res.status}`);
    const data = await res.json();
    results.push(...(data.results || []));
  }
  return results;
}

export async function fetchVulnDetails(id, fetchImpl = fetch) {
  const res = await fetchImpl(OSV_VULN_URL(id));
  if (!res.ok) throw new Error(`OSV vuln lookup failed for ${id}: HTTP ${res.status}`);
  return res.json();
}

/**
 * @param {Array<{name, version, ecosystem}>} components
 * @param {Set<string>} directNames — package names that are direct deps
 * @param {Function} fetchImpl — injectable for tests
 * @returns {{ directHigh: Array, transitiveHigh: Array }}
 */
export async function runGate(components, directNames, fetchImpl = fetch) {
  const batchResults = await queryBatch(components, fetchImpl);
  const directHigh = [];
  const transitiveHigh = [];

  for (let i = 0; i < components.length; i += 1) {
    const component = components[i];
    const vulnIds = (batchResults[i]?.vulns || []).map((v) => v.id);
    for (const id of vulnIds) {
      const details = await fetchVulnDetails(id, fetchImpl);
      const score = extractCvssScore(details);
      if (score !== null && score >= HIGH_SEVERITY_THRESHOLD) {
        const entry = { id, package: component.name, version: component.version, score };
        if (directNames.has(component.name)) directHigh.push(entry);
        else transitiveHigh.push(entry);
      }
    }
  }
  return { directHigh, transitiveHigh };
}

function toMarkdown({ directHigh, transitiveHigh }) {
  const lines = ['### 🛡️ OSV Vulnerability Scan'];
  if (directHigh.length === 0 && transitiveHigh.length === 0) {
    lines.push('No high-severity (CVSS ≥ 7.0) vulnerabilities found.');
    return lines.join('\n');
  }
  if (directHigh.length > 0) {
    lines.push('\n**❌ Direct dependencies — CI blocked:**');
    lines.push('| CVE | Package | Version | CVSS |\n|---|---|---|---|');
    for (const e of directHigh) lines.push(`| ${e.id} | ${e.package} | ${e.version} | ${e.score} |`);
  }
  if (transitiveHigh.length > 0) {
    lines.push('\n**⚠️ Transitive dependencies — warning only:**');
    lines.push('| CVE | Package | Version | CVSS |\n|---|---|---|---|');
    for (const e of transitiveHigh) lines.push(`| ${e.id} | ${e.package} | ${e.version} | ${e.score} |`);
    lines.push('\nReproduce locally: `osv-scanner --sbom <path-to-sbom.json>`');
  }
  return lines.join('\n');
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , sbomPath, directDepsPath, outMd] = process.argv;
  if (!sbomPath || !directDepsPath || !outMd) {
    console.error('Usage: node scripts/osv-gate.js <sbom.json> <direct-deps.json> <out.md>');
    process.exit(1);
  }

  const sbom = JSON.parse(fs.readFileSync(sbomPath, 'utf8'));
  const directNames = new Set(JSON.parse(fs.readFileSync(directDepsPath, 'utf8')));
  const components = (sbom.components || []).map((c) => ({
    name: c.name,
    version: c.version,
    ecosystem: c.purl?.startsWith('pkg:cargo') ? 'crates.io' : 'npm',
  }));

  runGate(components, directNames)
    .then((result) => {
      fs.writeFileSync(outMd, toMarkdown(result));
      if (result.directHigh.length > 0) {
        console.error(`OSV gate FAILED: ${result.directHigh.length} high-severity CVE(s) in direct dependencies.`);
        process.exit(1);
      }
      console.log(`OSV gate passed. ${result.transitiveHigh.length} transitive warning(s).`);
    })
    .catch((err) => {
      console.error('OSV gate errored:', err.message);
      process.exit(1);
    });
}
