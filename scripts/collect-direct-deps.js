/**
 * collect-direct-deps.js
 *
 * Walks the repo's package.json (root, backend, frontend, sdk) and every
 * Cargo.toml (contracts/*) to build the set of DIRECT dependency names.
 * Used by osv-gate.js to distinguish direct vs transitive CVEs.
 *
 * Usage: node scripts/collect-direct-deps.js <out.json>
 */
import fs from 'fs';
import path from 'path';

const NPM_MANIFESTS = ['package.json', 'backend/package.json', 'frontend/package.json', 'sdk/package.json'];

function collectNpmDirectDeps() {
  const names = new Set();
  for (const manifestPath of NPM_MANIFESTS) {
    if (!fs.existsSync(manifestPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      names.add(dep);
    }
  }
  return names;
}

function findCargoTomls(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'target') {
      findCargoTomls(full, acc);
    } else if (entry.name === 'Cargo.toml') {
      acc.push(full);
    }
  }
  return acc;
}

function collectCargoDirectDeps() {
  const names = new Set();
  const tomlFiles = [...findCargoTomls('contracts'), ...(fs.existsSync('Cargo.toml') ? ['Cargo.toml'] : [])];
  for (const tomlPath of tomlFiles) {
    const content = fs.readFileSync(tomlPath, 'utf8');
    // Minimal TOML dependency-table parser: sufficient for `[dependencies]`
    // / `[dev-dependencies]` sections with `name = "..."` or `name = { ... }` lines.
    const lines = content.split('\n');
    let inDepsSection = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^\[(dependencies|dev-dependencies)(\..+)?\]$/.test(trimmed)) {
        inDepsSection = true;
        continue;
      }
      if (/^\[.+\]$/.test(trimmed)) {
        inDepsSection = false;
        continue;
      }
      if (inDepsSection) {
        const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*=/);
        if (match) names.add(match[1]);
      }
    }
  }
  return names;
}

export function collectDirectDeps() {
  return new Set([...collectNpmDirectDeps(), ...collectCargoDirectDeps()]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , outPath] = process.argv;
  const names = [...collectDirectDeps()];
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(names, null, 2));
    console.log(`Wrote ${names.length} direct dependency names to ${outPath}`);
  } else {
    console.log(JSON.stringify(names, null, 2));
  }
}
