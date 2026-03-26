/**
 * Secrets Manager Tests
 *
 * Tests the env backend (no Vault required).
 * Vault backend is tested via integration tests against a real Vault instance.
 */

import { jest } from '@jest/globals';

// Reset module registry between tests so cache state doesn't leak
beforeEach(() => {
  jest.resetModules();
  // Ensure we're always in env mode for unit tests
  process.env.SECRETS_BACKEND = 'env';
  process.env.TEST_SECRET_FOO = 'bar';
  process.env.TEST_SECRET_NUM = '42';
});

afterEach(() => {
  delete process.env.TEST_SECRET_FOO;
  delete process.env.TEST_SECRET_NUM;
});

test('getSecret returns value from env', async () => {
  const { getSecret } = await import('../lib/secrets.js');
  const val = await getSecret('TEST_SECRET_FOO');
  expect(val).toBe('bar');
});

test('getSecret returns fallback when key missing', async () => {
  const { getSecret } = await import('../lib/secrets.js');
  const val = await getSecret('DOES_NOT_EXIST', 'default_val');
  expect(val).toBe('default_val');
});

test('getSecret throws when key missing and no fallback', async () => {
  const { getSecret } = await import('../lib/secrets.js');
  await expect(getSecret('DOES_NOT_EXIST')).rejects.toThrow('DOES_NOT_EXIST');
});

test('getSecrets returns multiple values', async () => {
  const { getSecrets } = await import('../lib/secrets.js');
  const result = await getSecrets(['TEST_SECRET_FOO', 'TEST_SECRET_NUM']);
  expect(result.TEST_SECRET_FOO).toBe('bar');
  expect(result.TEST_SECRET_NUM).toBe('42');
});

test('getSecrets throws when any key is missing', async () => {
  const { getSecrets } = await import('../lib/secrets.js');
  await expect(getSecrets(['TEST_SECRET_FOO', 'MISSING_KEY'])).rejects.toThrow('MISSING_KEY');
});

test('assertSecretsPresent passes when all keys present', async () => {
  const { assertSecretsPresent } = await import('../lib/secrets.js');
  await expect(
    assertSecretsPresent(['TEST_SECRET_FOO', 'TEST_SECRET_NUM']),
  ).resolves.toBeUndefined();
});

test('assertSecretsPresent throws listing missing keys', async () => {
  const { assertSecretsPresent } = await import('../lib/secrets.js');
  await expect(assertSecretsPresent(['TEST_SECRET_FOO', 'MISSING_A', 'MISSING_B'])).rejects.toThrow(
    /MISSING_A.*MISSING_B|MISSING_B.*MISSING_A/,
  );
});

test('rotateSecrets re-fetches and updates cache', async () => {
  const { getSecret, rotateSecrets } = await import('../lib/secrets.js');

  // Initial read
  expect(await getSecret('TEST_SECRET_FOO')).toBe('bar');

  // Simulate secret rotation in the environment
  process.env.TEST_SECRET_FOO = 'rotated';

  // Force rotation
  await rotateSecrets();

  expect(await getSecret('TEST_SECRET_FOO')).toBe('rotated');
});

test('getAuditLog records read actions', async () => {
  const { getSecret, getAuditLog } = await import('../lib/secrets.js');
  await getSecret('TEST_SECRET_FOO');
  const log = getAuditLog();
  const readEntries = log.filter((e) => e.action === 'read');
  expect(readEntries.length).toBeGreaterThan(0);
  expect(readEntries.some((e) => e.detail.includes('TEST_SECRET_FOO'))).toBe(true);
});

test('getAuditLog records error on missing secret', async () => {
  const { getSecret, getAuditLog } = await import('../lib/secrets.js');
  try {
    await getSecret('TOTALLY_MISSING');
  } catch {
    // expected
  }
  const log = getAuditLog();
  const errorEntries = log.filter((e) => e.action === 'error');
  expect(errorEntries.some((e) => e.detail.includes('TOTALLY_MISSING'))).toBe(true);
});
