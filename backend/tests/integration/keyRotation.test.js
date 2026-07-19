import request from 'supertest';
import app from '../../server.js';
import prisma from '../../lib/prisma.js';
import { generateTestAdminToken } from '../helpers/adminAuthHelper.js';
import { Keypair } from '@stellar/stellar-sdk';
import jwt from 'jsonwebtoken';
import keyRotationService from '../../services/keyRotationService.js';

describe('Key Rotation Integration', () => {
  let adminToken;
  let testClientAddress;

  beforeAll(async () => {
    // Need a valid signature/nonce loop to get user token if we were to test full login.
    // Instead we will mock or directly call keyRotationService for testing overlap.
    const kp = Keypair.random();
    testClientAddress = kp.publicKey();
    
    adminToken = generateTestAdminToken('admin_123');
    await keyRotationService.rotateKey(); // initialize
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('JWT validation during overlap', () => {
    it('should validate tokens signed with older keys during overlap window', async () => {
      // 1. Get current key
      const key1 = await keyRotationService.getCurrentSigningKey();
      
      // 2. Sign token with key1
      const token1 = jwt.sign({ address: testClientAddress, type: 'access' }, key1.privateKey, {
        algorithm: 'RS256',
        keyid: key1.kid,
        expiresIn: '1h'
      });

      // 3. Rotate key
      const rotateRes = await request(app)
        .post('/api/admin/keys/rotate')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      expect(rotateRes.body.kid).toBeDefined();
      expect(rotateRes.body.kid).not.toBe(key1.kid);

      // 4. Validate token1 still works by calling a protected endpoint, e.g. listing sessions
      // We'll mock the decoded part manually to ensure auth middleware handles it.
      // But we can just call an auth required endpoint like /api/auth/sessions (if it exists) 
      // or we can test the token by calling /api/escrows with the token.
      
      const res = await request(app)
        .get('/api/escrows')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200); // 200 means auth succeeded, even if list is empty
        
      expect(res.body).toBeDefined();
    });

    it('should return 401 for an invalid kid that is not found', async () => {
      const key1 = await keyRotationService.getCurrentSigningKey();
      const fakeToken = jwt.sign({ address: testClientAddress, type: 'access' }, key1.privateKey, {
        algorithm: 'RS256',
        keyid: 'fake-kid-123',
        expiresIn: '1h'
      });
      
      const res = await request(app)
        .get('/api/escrows')
        .set('Authorization', `Bearer ${fakeToken}`)
        .expect(401);
    });
  });

  describe('Public JWKS Endpoint', () => {
    it('should return valid JWKS format without auth', async () => {
      const res = await request(app)
        .get('/.well-known/jwks.json')
        .expect(200);

      expect(res.body.keys).toBeDefined();
      expect(Array.isArray(res.body.keys)).toBe(true);
      
      const key = res.body.keys[0];
      expect(key.kid).toBeDefined();
      expect(key.alg).toBe('RS256');
      expect(key.kty).toBe('RSA');
      expect(key.use).toBe('sig');
      expect(key.n).toBeDefined();
      expect(key.e).toBeDefined();
    });
  });

  describe('Admin Routes', () => {
    it('should list active keys', async () => {
      const res = await request(app)
        .get('/api/admin/keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
        
      expect(res.body.keys).toBeDefined();
      expect(Array.isArray(res.body.keys)).toBe(true);
      // Ensure private keys are not leaked
      expect(res.body.keys[0].privateKey).toBeUndefined();
      expect(res.body.keys[0].kid).toBeDefined();
    });
  });
});
