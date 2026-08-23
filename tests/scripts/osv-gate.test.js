import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractCvssScore, runGate } from '../../scripts/osv-gate.js';

// lodash@4.17.15 is a real known-vulnerable version (CVE-2020-8203, prototype
// pollution, CVSS 7.4) — used here as the "known-vulnerable package version"
// fixture called for in the issue's acceptance criteria. minimist@1.2.5 has
// a real moderate CVE (CVSS < 7) so it should never trip the gate.
const FIXTURE_COMPONENTS = [
  { name: 'lodash', version: '4.17.15', ecosystem: 'npm' }, // direct, high sev
  { name: 'minimist', version: '1.2.5', ecosystem: 'npm' }, // transitive, high sev
  { name: 'left-pad', version: '1.3.0', ecosystem: 'npm' }, // direct, clean
];

function mockFetch({ batchResponse, vulnDetails }) {
  return async (url, opts) => {
    if (url.includes('querybatch')) {
      return { ok: true, json: async () => batchResponse };
    }
    const id = url.split('/').pop();
    if (!vulnDetails[id]) return { ok: false, status: 404 };
    return { ok: true, json: async () => vulnDetails[id] };
  };
}

describe('extractCvssScore', () => {
  test('reads a numeric CVSS score from the severity array', () => {
    const score = extractCvssScore({ severity: [{ type: 'CVSS_V3', score: '7.4' }] });
    assert.equal(score, 7.4);
  });

  test('falls back to database_specific.cvss.score', () => {
    const score = extractCvssScore({ database_specific: { cvss: { score: 9.1 } } });
    assert.equal(score, 9.1);
  });

  test('returns null when no score is present', () => {
    assert.equal(extractCvssScore({}), null);
  });
});

describe('runGate — exploitability gate', () => {
  test('fails (directHigh populated) for a known-vulnerable DIRECT dependency', async () => {
    const fetchImpl = mockFetch({
      batchResponse: {
        results: [
          { vulns: [{ id: 'CVE-2020-8203' }] }, // lodash
          { vulns: [{ id: 'CVE-2021-44906' }] }, // minimist
          { vulns: [] }, // left-pad
        ],
      },
      vulnDetails: {
        'CVE-2020-8203': { severity: [{ type: 'CVSS_V3', score: '7.4' }] },
        'CVE-2021-44906': { severity: [{ type: 'CVSS_V3', score: '9.8' }] },
      },
    });

    const directNames = new Set(['lodash', 'left-pad']); // minimist is transitive-only
    const result = await runGate(FIXTURE_COMPONENTS, directNames, fetchImpl);

    assert.equal(result.directHigh.length, 1);
    assert.equal(result.directHigh[0].package, 'lodash');
    assert.equal(result.directHigh[0].id, 'CVE-2020-8203');

    assert.equal(result.transitiveHigh.length, 1);
    assert.equal(result.transitiveHigh[0].package, 'minimist');
  });

  test('does not flag low-severity CVEs (below CVSS 7.0)', async () => {
    const fetchImpl = mockFetch({
      batchResponse: { results: [{ vulns: [{ id: 'CVE-LOW' }] }, { vulns: [] }, { vulns: [] }] },
      vulnDetails: { 'CVE-LOW': { severity: [{ type: 'CVSS_V3', score: '3.1' }] } },
    });

    const result = await runGate(FIXTURE_COMPONENTS, new Set(['lodash', 'left-pad']), fetchImpl);
    assert.equal(result.directHigh.length, 0);
    assert.equal(result.transitiveHigh.length, 0);
  });

  test('clean components produce no findings', async () => {
    const fetchImpl = mockFetch({
      batchResponse: { results: [{ vulns: [] }, { vulns: [] }, { vulns: [] }] },
      vulnDetails: {},
    });
    const result = await runGate(FIXTURE_COMPONENTS, new Set(['lodash', 'left-pad']), fetchImpl);
    assert.equal(result.directHigh.length, 0);
    assert.equal(result.transitiveHigh.length, 0);
  });
});
