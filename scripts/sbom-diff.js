/**
 * sbom-diff.js
 *
 * Diffs two CycloneDX SBOM JSON files (current PR vs. main's committed
 * baseline) and emits a markdown table of added/removed/updated packages,
 * plus a machine-readable JSON summary for downstream steps (e.g. the OSV
 * exploitability gate, which only needs to scan the current SBOM but wants
 * to know what changed).
 *
 * Usage: node scripts/sbom-diff.js <baseline.json|--none> <current.json> <out.md> [out.json]
 */
import fs from 'fs';

function loadComponents(path) {
  if (!path || path === '--none' || !fs.existsSync(path)) return new Map();
  const sbom = JSON.parse(fs.readFileSync(path, 'utf8'));
  const map = new Map();
  for (const c of sbom.components || []) {
    map.set(`${c.name}@${c.version}`, {
      name: c.name,
      version: c.version,
      license: (c.licenses || []).map((l) => l.license?.id || l.license?.name || l.expression).join(', ') || 'unknown',
    });
  }
  return map;
}

export function diffComponents(baselineMap, currentMap) {
  // Group by package name to detect version updates vs pure add/remove.
  const baselineByName = new Map();
  for (const c of baselineMap.values()) baselineByName.set(c.name, c);
  const currentByName = new Map();
  for (const c of currentMap.values()) currentByName.set(c.name, c);

  const rows = [];
  const seenNames = new Set([...baselineByName.keys(), ...currentByName.keys()]);

  for (const name of seenNames) {
    const before = baselineByName.get(name);
    const after = currentByName.get(name);

    if (before && after && before.version !== after.version) {
      rows.push({ name, version: `${before.version} -> ${after.version}`, action: 'updated', license: after.license });
    } else if (!before && after) {
      rows.push({ name, version: after.version, action: 'added', license: after.license });
    } else if (before && !after) {
      rows.push({ name, version: before.version, action: 'removed', license: before.license });
    }
    // unchanged (before && after && same version): skip
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export function toMarkdownTable(rows) {
  if (rows.length === 0) {
    return '_No dependency changes detected in this PR._';
  }
  const header = '| Package | Version | Action | License |\n|---|---|---|---|';
  const body = rows
    .map((r) => `| ${r.name} | ${r.version} | ${r.action} | ${r.license} |`)
    .join('\n');
  return `${header}\n${body}`;
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , baselinePath, currentPath, outMd, outJson] = process.argv;
  if (!currentPath || !outMd) {
    console.error('Usage: node scripts/sbom-diff.js <baseline.json|--none> <current.json> <out.md> [out.json]');
    process.exit(1);
  }

  const baseline = loadComponents(baselinePath);
  const current = loadComponents(currentPath);
  const rows = diffComponents(baseline, current);

  const MARKER = '<!-- sbom-diff-report -->';
  const table = toMarkdownTable(rows);
  fs.writeFileSync(
    outMd,
    `${MARKER}\n### 📦 Dependency SBOM Diff\n\n${table}\n`,
  );

  if (outJson) {
    fs.writeFileSync(outJson, JSON.stringify(rows, null, 2));
  }

  console.log(`SBOM diff: ${rows.length} package change(s) written to ${outMd}`);
}
