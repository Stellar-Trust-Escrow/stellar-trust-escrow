import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectDirectDeps } from '../../scripts/collect-direct-deps.js';

describe('collect-direct-deps', () => {
  test('picks up npm dependencies + devDependencies and Cargo [dependencies]', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-test-'));
    const cwd = process.cwd();
    try {
      fs.writeFileSync(
        path.join(tmp, 'package.json'),
        JSON.stringify({ dependencies: { express: '^4.0.0' }, devDependencies: { jest: '^29.0.0' } }),
      );
      fs.mkdirSync(path.join(tmp, 'contracts', 'escrow_contract'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, 'contracts', 'escrow_contract', 'Cargo.toml'),
        '[package]\nname = "escrow"\n\n[dependencies]\nsoroban-sdk = "20.0.0"\n\n[dev-dependencies]\nsoroban-sdk-testutils = "20.0.0"\n',
      );

      process.chdir(tmp);
      const names = collectDirectDeps();

      assert.ok(names.has('express'));
      assert.ok(names.has('jest'));
      assert.ok(names.has('soroban-sdk'));
      assert.ok(names.has('soroban-sdk-testutils'));
    } finally {
      process.chdir(cwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
