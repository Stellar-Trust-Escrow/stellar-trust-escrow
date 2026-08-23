import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

describe('passkeyService', () => {
  let svc;

  beforeEach(async () => {
    jest.resetModules();
    svc = await import('../services/passkeyService.js');
  });

  test('generateRegistrationOptions returns challenge and rp fields', () => {
    const opts = svc.generateRegistrationOptions('GABC');
    expect(opts).toHaveProperty('challenge');
    expect(opts).toHaveProperty('rp');
    expect(opts.rp.name).toBe('Stellar Trust Escrow');
    expect(typeof opts.challenge).toBe('string');
    expect(opts.challenge.length).toBeGreaterThan(0);
  });

  test('verifyRegistration succeeds with valid challenge', async () => {
    svc.generateRegistrationOptions('GDEF');
    const result = await svc.verifyRegistration('GDEF', { id: 'cred_abc', response: { attestationObject: 'mock' } });
    expect(result.verified).toBe(true);
    expect(result).toHaveProperty('credentialId');
  });

  test('verifyRegistration throws if no challenge exists', async () => {
    await expect(svc.verifyRegistration('GXXX', { id: 'cred' })).rejects.toThrow('Registration challenge expired or not found');
  });

  test('generateAuthenticationOptions returns challenge and allowCredentials', () => {
    const opts = svc.generateAuthenticationOptions('GHIJ');
    expect(opts).toHaveProperty('challenge');
    expect(Array.isArray(opts.allowCredentials)).toBe(true);
  });

  test('storeCredential and getCredentials round-trip', () => {
    svc.storeCredential('GKLM', { credentialId: 'cred_xyz', publicKey: 'pk', counter: 0 });
    const creds = svc.getCredentials('GKLM');
    expect(creds).toHaveLength(1);
    expect(creds[0].credentialId).toBe('cred_xyz');
  });

  test('removeCredential removes the right credential', () => {
    svc.storeCredential('GNOP', { credentialId: 'cred_1', publicKey: 'pk1', counter: 0 });
    svc.storeCredential('GNOP', { credentialId: 'cred_2', publicKey: 'pk2', counter: 0 });
    svc.removeCredential('GNOP', 'cred_1');
    const creds = svc.getCredentials('GNOP');
    expect(creds).toHaveLength(1);
    expect(creds[0].credentialId).toBe('cred_2');
  });

  test('verifyAuthentication increments counter', async () => {
    svc.storeCredential('GQRS', { credentialId: 'cred_auth', publicKey: 'pk', counter: 5 });
    svc.generateAuthenticationOptions('GQRS');
    const result = await svc.verifyAuthentication('GQRS', { id: 'cred_auth' });
    expect(result.verified).toBe(true);
    expect(result.newCounter).toBe(6);
  });

  test('verifyAuthentication throws if credential not found', async () => {
    svc.generateAuthenticationOptions('GTUV');
    await expect(svc.verifyAuthentication('GTUV', { id: 'nonexistent' })).rejects.toThrow('Credential not found');
  });
});
