import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const CHECK_SCRIPT = path.join(REPO_ROOT, 'scripts/check-wasm-size.sh');
const UPDATE_SCRIPT = path.join(REPO_ROOT, 'scripts/update-wasm-budget.sh');

let tmpDir;
let wasmPath;

function run(cmd, args, opts = {}) {
  try {
    const stdout = execFileSync(cmd, args, { encoding: 'utf8', ...opts });
    return { stdout, status: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', status: err.status ?? 1 };
  }
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm-budget-test-'));
  // A real, minimal, valid WASM module (hand-assembled via `wasm-as` from a
  // trivial WAT source) — not a fake/text placeholder, so wasm-opt genuinely
  // parses and optimises it, the same as it would a real contract binary.
  const watPath = path.join(tmpDir, 'tiny.wat');
  fs.writeFileSync(
    watPath,
    `(module
  (func $add (param $a i32) (param $b i32) (result i32)
    (i32.add (local.get $a) (local.get $b)))
  (export "add" (func $add)))
`,
  );
  wasmPath = path.join(tmpDir, 'tiny.wasm');
  run('wasm-as', [watPath, '-o', wasmPath]);
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('check-wasm-size.sh', () => {
  test('passes (exit 0) when the optimised size is within budget', () => {
    const budgetsFile = path.join(tmpDir, 'budgets-ok.json');
    fs.writeFileSync(budgetsFile, JSON.stringify({ my_contract: 131072 }));

    const result = run('bash', [CHECK_SCRIPT, wasmPath, 'my_contract'], {
      env: { ...process.env, WASM_SIZE_BUDGETS_FILE: budgetsFile },
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /^OK: my_contract\.wasm is \d+ bytes \(budget: 131072/);
  });

  test('fails (exit 1) with the exact required message format when over budget', () => {
    const budgetsFile = path.join(tmpDir, 'budgets-tiny.json');
    fs.writeFileSync(budgetsFile, JSON.stringify({ my_contract: 10 }));

    const result = run('bash', [CHECK_SCRIPT, wasmPath, 'my_contract'], {
      env: { ...process.env, WASM_SIZE_BUDGETS_FILE: budgetsFile },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^FAIL: my_contract\.wasm is \d+ bytes \(budget: 10, over by \d+ bytes\)/m);
  });

  test('fails with a clear message when no budget is defined for the contract', () => {
    const budgetsFile = path.join(tmpDir, 'budgets-empty.json');
    fs.writeFileSync(budgetsFile, JSON.stringify({}));

    const result = run('bash', [CHECK_SCRIPT, wasmPath, 'unknown_contract'], {
      env: { ...process.env, WASM_SIZE_BUDGETS_FILE: budgetsFile },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /No budget defined for unknown_contract\. Add it to size-budgets\.json\./);
  });

  test('measures the wasm-opt -Oz optimised size, not raw size — dead code is actually eliminated', () => {
    const watWithDeadCode = path.join(tmpDir, 'bigger.wat');
    fs.writeFileSync(
      watWithDeadCode,
      `(module
  (func $unused1 (param $a i32) (result i32) (i32.add (local.get $a) (i32.const 1)))
  (func $unused2 (param $a i32) (result i32) (i32.add (local.get $a) (i32.const 2)))
  (func $add (param $a i32) (param $b i32) (result i32)
    (i32.add (local.get $a) (local.get $b)))
  (export "add" (func $add)))
`,
    );
    const biggerWasm = path.join(tmpDir, 'bigger.wasm');
    run('wasm-as', [watWithDeadCode, '-o', biggerWasm]);

    const rawSize = fs.statSync(biggerWasm).size;
    const optWasm = path.join(tmpDir, 'bigger.opt.wasm');
    run('wasm-opt', ['-Oz', biggerWasm, '-o', optWasm]);
    const optimisedSize = fs.statSync(optWasm).size;

    assert.ok(
      optimisedSize < rawSize,
      `expected wasm-opt -Oz to shrink the module (raw=${rawSize}, optimised=${optimisedSize})`,
    );
  });

  test('fails clearly when the wasm file does not exist', () => {
    const budgetsFile = path.join(tmpDir, 'budgets-ok.json');
    const result = run('bash', [CHECK_SCRIPT, '/nonexistent/path.wasm', 'my_contract'], {
      env: { ...process.env, WASM_SIZE_BUDGETS_FILE: budgetsFile },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /WASM file not found/);
  });
});

describe('update-wasm-budget.sh', () => {
  let scratchRepo;

  before(() => {
    scratchRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm-budget-repo-'));
    fs.mkdirSync(path.join(scratchRepo, 'scripts'));
    fs.mkdirSync(path.join(scratchRepo, 'contracts', 'my_contract', 'target', 'wasm32-unknown-unknown', 'release'), {
      recursive: true,
    });
    fs.copyFileSync(UPDATE_SCRIPT, path.join(scratchRepo, 'scripts', 'update-wasm-budget.sh'));
    fs.copyFileSync(
      wasmPath,
      path.join(scratchRepo, 'contracts', 'my_contract', 'target', 'wasm32-unknown-unknown', 'release', 'my_contract.wasm'),
    );
    fs.writeFileSync(path.join(scratchRepo, 'contracts', 'size-budgets.json'), JSON.stringify({ my_contract: 131072 }));

    run('git', ['init', '-q'], { cwd: scratchRepo });
    run('git', ['config', 'user.email', 'test@test.com'], { cwd: scratchRepo });
    run('git', ['config', 'user.name', 'test'], { cwd: scratchRepo });
    run('git', ['add', '-A'], { cwd: scratchRepo });
    run('git', ['commit', '-q', '-m', 'init'], { cwd: scratchRepo });
  });

  after(() => {
    fs.rmSync(scratchRepo, { recursive: true, force: true });
  });

  test('accepts an increase within 10% of the current measured size and commits it', () => {
    // Current size is ~41 bytes; +10% allows up to ~45.
    const result = run('bash', ['scripts/update-wasm-budget.sh', 'my_contract', '45'], { cwd: scratchRepo });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Updated my_contract budget to 45 bytes/);

    const budgets = JSON.parse(fs.readFileSync(path.join(scratchRepo, 'contracts/size-budgets.json'), 'utf8'));
    assert.equal(budgets.my_contract, 45);

    const log = run('git', ['log', '--oneline', '-1'], { cwd: scratchRepo });
    assert.match(log.stdout, /update-wasm-budget|update.*my_contract/i);
  });

  test('refuses an increase greater than 10% above current measured size', () => {
    const before_ = JSON.parse(fs.readFileSync(path.join(scratchRepo, 'contracts/size-budgets.json'), 'utf8'));

    const result = run('bash', ['scripts/update-wasm-budget.sh', 'my_contract', '10000'], { cwd: scratchRepo });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /REFUSED.*more than 10% above/);

    const after_ = JSON.parse(fs.readFileSync(path.join(scratchRepo, 'contracts/size-budgets.json'), 'utf8'));
    assert.deepEqual(after_, before_); // file untouched by the refused attempt
  });

  test('fails clearly when no compiled wasm exists for the contract', () => {
    const result = run('bash', ['scripts/update-wasm-budget.sh', 'never_built_contract', '100'], {
      cwd: scratchRepo,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not find a compiled never_built_contract\.wasm/);
  });

  test('rejects a non-numeric budget argument', () => {
    const result = run('bash', ['scripts/update-wasm-budget.sh', 'my_contract', 'not-a-number'], {
      cwd: scratchRepo,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be a positive integer/);
  });
});
