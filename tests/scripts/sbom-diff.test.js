import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { diffComponents, toMarkdownTable } from '../../scripts/sbom-diff.js';

function map(components) {
  const m = new Map();
  for (const c of components) m.set(`${c.name}@${c.version}`, c);
  return m;
}

describe('sbom-diff', () => {
  test('detects added packages', () => {
    const rows = diffComponents(map([]), map([{ name: 'left-pad', version: '1.0.0', license: 'MIT' }]));
    assert.deepEqual(rows, [{ name: 'left-pad', version: '1.0.0', action: 'added', license: 'MIT' }]);
  });

  test('detects removed packages', () => {
    const rows = diffComponents(map([{ name: 'left-pad', version: '1.0.0', license: 'MIT' }]), map([]));
    assert.deepEqual(rows, [{ name: 'left-pad', version: '1.0.0', action: 'removed', license: 'MIT' }]);
  });

  test('detects version updates as a single "updated" row, not add+remove', () => {
    const baseline = map([{ name: 'lodash', version: '4.17.15', license: 'MIT' }]);
    const current = map([{ name: 'lodash', version: '4.17.21', license: 'MIT' }]);
    const rows = diffComponents(baseline, current);
    assert.deepEqual(rows, [{ name: 'lodash', version: '4.17.15 -> 4.17.21', action: 'updated', license: 'MIT' }]);
  });

  test('skips unchanged packages', () => {
    const baseline = map([{ name: 'react', version: '18.2.0', license: 'MIT' }]);
    const current = map([{ name: 'react', version: '18.2.0', license: 'MIT' }]);
    assert.deepEqual(diffComponents(baseline, current), []);
  });

  test('renders a markdown table with the required columns', () => {
    const table = toMarkdownTable([{ name: 'left-pad', version: '1.0.0', action: 'added', license: 'MIT' }]);
    assert.match(table, /\| Package \| Version \| Action \| License \|/);
    assert.match(table, /\| left-pad \| 1\.0\.0 \| added \| MIT \|/);
  });

  test('renders a friendly message when there are no changes', () => {
    assert.match(toMarkdownTable([]), /no dependency changes/i);
  });
});
