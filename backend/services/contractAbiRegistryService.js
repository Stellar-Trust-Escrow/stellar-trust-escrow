'use strict';

/**
 * Soroban Contract ABI Version Registry
 *
 * Tracks deployed contract versions, their method signatures, and
 * client-version compatibility so API consumers can negotiate the
 * correct ABI at runtime.
 *
 * All public functions return plain serialisable objects suitable for
 * JSON responses — no class instances, no Buffers.
 */

// ---------------------------------------------------------------------------
// In-memory registry (swap for Prisma persistence in production)
// ---------------------------------------------------------------------------

/**
 * Primary store keyed by contractName -> Map<version, DeploymentRecord>
 *
 * DeploymentRecord shape:
 * {
 *   contractName: string,
 *   wasmHash:     string,
 *   version:      string,   // semver-style, e.g. "1.2.0"
 *   deployedAt:   string,   // ISO timestamp
 *   methods:      MethodSignature[],
 * }
 *
 * MethodSignature shape:
 * {
 *   name:       string,
 *   inputs:     Array<{ name: string, type: string }>,
 *   outputs:    Array<{ type: string }>,
 *   mutability: 'read' | 'write',
 * }
 */
const registry = new Map(); // contractName -> Map<version, record>

// Compatibility matrix store: contractName -> Array<CompatibilityEntry>
// CompatibilityEntry: { clientVersionRange: string, contractVersion: string }
const compatibilityStore = new Map(); // contractName -> CompatibilityEntry[]

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getOrCreateVersionMap(contractName) {
  if (!registry.has(contractName)) {
    registry.set(contractName, new Map());
  }
  return registry.get(contractName);
}

function parseVersion(v) {
  const parts = String(v).split('.').map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function compareVersions(a, b) {
  const [aMaj, aMin, aPat] = parseVersion(a);
  const [bMaj, bMin, bPat] = parseVersion(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}

function sortedVersions(versionMap) {
  return [...versionMap.keys()].sort(compareVersions);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a new contract deployment.
 *
 * @param {string}             contractName
 * @param {string}             wasmHash      SHA-256 hash of the uploaded WASM
 * @param {string}             version       Semver string, e.g. "2.0.0"
 * @param {object[]}           methods       Array of MethodSignature objects
 * @returns {{ registered: boolean, record: object }}
 */
function registerDeployment(contractName, wasmHash, version, methods) {
  if (!contractName || !wasmHash || !version) {
    throw new Error('contractName, wasmHash, and version are required');
  }

  const versionMap = getOrCreateVersionMap(contractName);

  const record = {
    contractName,
    wasmHash,
    version,
    deployedAt: new Date().toISOString(),
    methods: Array.isArray(methods) ? methods : [],
  };

  versionMap.set(version, record);

  return { registered: true, record };
}

/**
 * Get the latest deployed version of a contract.
 *
 * @param {string} contractName
 * @returns {object|null}  DeploymentRecord or null if unknown
 */
function getLatestVersion(contractName) {
  const versionMap = registry.get(contractName);
  if (!versionMap || versionMap.size === 0) return null;

  const latest = sortedVersions(versionMap).pop();
  return versionMap.get(latest);
}

/**
 * Retrieve the ABI signature for a specific method on a specific version.
 *
 * @param {string} contractName
 * @param {string} version
 * @param {string} methodName
 * @returns {object|null}  MethodSignature or null
 */
function getMethodSignature(contractName, version, methodName) {
  const versionMap = registry.get(contractName);
  if (!versionMap) return null;

  const record = versionMap.get(version);
  if (!record) return null;

  return record.methods.find((m) => m.name === methodName) || null;
}

/**
 * Build a compatibility matrix showing which client version ranges are
 * compatible with each contract version.
 *
 * @param {string} contractName
 * @returns {object}  { contractName, matrix: Array<{ contractVersion, compatibleClientVersions }> }
 */
function buildCompatibilityMatrix(contractName) {
  const versionMap = registry.get(contractName);
  if (!versionMap || versionMap.size === 0) {
    return { contractName, matrix: [] };
  }

  const stored = compatibilityStore.get(contractName) || [];
  const versions = sortedVersions(versionMap);

  const matrix = versions.map((cv) => {
    const explicit = stored
      .filter((e) => e.contractVersion === cv)
      .map((e) => e.clientVersionRange);

    // If no explicit compat entries exist, derive a default from the
    // contract's own semver: same major version is considered compatible.
    const [maj] = parseVersion(cv);
    const defaultRange = `>=${maj}.0.0 <${maj + 1}.0.0`;

    return {
      contractVersion: cv,
      compatibleClientVersions: explicit.length > 0 ? explicit : [defaultRange],
    };
  });

  return { contractName, matrix };
}

/**
 * Return an ordered changelog of method signature changes across versions.
 *
 * @param {string} contractName
 * @returns {{ contractName: string, changelog: object[] }}
 */
function getChangelog(contractName) {
  const versionMap = registry.get(contractName);
  if (!versionMap || versionMap.size === 0) {
    return { contractName, changelog: [] };
  }

  const versions = sortedVersions(versionMap);
  const changelog = [];

  for (let i = 0; i < versions.length; i++) {
    const version = versions[i];
    const record = versionMap.get(version);
    const prevRecord = i > 0 ? versionMap.get(versions[i - 1]) : null;

    const added = [];
    const removed = [];
    const modified = [];

    const currentMethods = record.methods.reduce((acc, m) => {
      acc[m.name] = m;
      return acc;
    }, {});

    const prevMethods = prevRecord
      ? prevRecord.methods.reduce((acc, m) => {
          acc[m.name] = m;
          return acc;
        }, {})
      : {};

    for (const [name, sig] of Object.entries(currentMethods)) {
      if (!prevMethods[name]) {
        added.push(name);
      } else if (JSON.stringify(sig) !== JSON.stringify(prevMethods[name])) {
        modified.push(name);
      }
    }

    for (const name of Object.keys(prevMethods)) {
      if (!currentMethods[name]) removed.push(name);
    }

    changelog.push({
      version,
      deployedAt: record.deployedAt,
      wasmHash: record.wasmHash,
      changes: { added, removed, modified },
    });
  }

  return { contractName, changelog };
}

/**
 * Negotiate the best compatible contract version for a given client version.
 *
 * Returns the highest contract version whose compatibility range covers the
 * requested client version.  Falls back to the latest version if no explicit
 * compat data is registered.
 *
 * @param {string} contractName
 * @param {string} clientVersion   Semver string, e.g. "1.4.2"
 * @returns {{ contractName: string, clientVersion: string, negotiatedVersion: string|null, record: object|null }}
 */
function negotiateVersion(contractName, clientVersion) {
  const versionMap = registry.get(contractName);
  if (!versionMap || versionMap.size === 0) {
    return { contractName, clientVersion, negotiatedVersion: null, record: null };
  }

  const [cMaj, cMin] = parseVersion(clientVersion);
  const stored = compatibilityStore.get(contractName) || [];
  const versions = sortedVersions(versionMap).reverse(); // newest first

  // Try explicit compat entries first
  for (const cv of versions) {
    const entries = stored.filter((e) => e.contractVersion === cv);
    for (const entry of entries) {
      if (rangeCoversVersion(entry.clientVersionRange, clientVersion)) {
        return {
          contractName,
          clientVersion,
          negotiatedVersion: cv,
          record: versionMap.get(cv),
        };
      }
    }
  }

  // Fallback: find newest contract version with same major as client
  for (const cv of versions) {
    const [cvMaj] = parseVersion(cv);
    if (cvMaj === cMaj) {
      return {
        contractName,
        clientVersion,
        negotiatedVersion: cv,
        record: versionMap.get(cv),
      };
    }
  }

  // Last resort: return latest regardless
  const latest = versions[0];
  return {
    contractName,
    clientVersion,
    negotiatedVersion: latest,
    record: versionMap.get(latest),
  };
}

/**
 * Register explicit compatibility between a client version range and a
 * deployed contract version (optional — used by negotiateVersion).
 *
 * @param {string} contractName
 * @param {string} contractVersion
 * @param {string} clientVersionRange  e.g. ">=1.0.0 <2.0.0"
 */
function registerCompatibility(contractName, contractVersion, clientVersionRange) {
  if (!compatibilityStore.has(contractName)) {
    compatibilityStore.set(contractName, []);
  }
  compatibilityStore.get(contractName).push({ contractVersion, clientVersionRange });
}

/**
 * List all registered contract names.
 *
 * @returns {string[]}
 */
function listContracts() {
  return [...registry.keys()];
}

/**
 * List all versions registered for a contract.
 *
 * @param {string} contractName
 * @returns {string[]}
 */
function listVersions(contractName) {
  const versionMap = registry.get(contractName);
  if (!versionMap) return [];
  return sortedVersions(versionMap);
}

// ---------------------------------------------------------------------------
// Internal: simple semver range check (handles ">= x.y.z <a.b.c" syntax)
// ---------------------------------------------------------------------------
function rangeCoversVersion(range, version) {
  const parts = range.trim().split(/\s+/);
  let covered = true;
  for (let i = 0; i < parts.length - 1; i += 2) {
    const op = parts[i];
    const bound = parts[i + 1];
    const cmp = compareVersions(version, bound);
    if (op === '>=' && cmp < 0) covered = false;
    if (op === '>' && cmp <= 0) covered = false;
    if (op === '<' && cmp >= 0) covered = false;
    if (op === '<=' && cmp > 0) covered = false;
    if (op === '==' && cmp !== 0) covered = false;
  }
  return covered;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  registerDeployment,
  getLatestVersion,
  getMethodSignature,
  buildCompatibilityMatrix,
  getChangelog,
  negotiateVersion,
  registerCompatibility,
  listContracts,
  listVersions,
};
