import express from 'express';
import {
  generateRegistrationOptions,
  verifyRegistration,
  generateAuthenticationOptions,
  verifyAuthentication,
  storeCredential,
  getCredentials,
  removeCredential,
} from '../../services/passkeyService.js';

const router = express.Router();

router.post('/register/start', (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) return res.status(400).json({ error: 'walletAddress is required' });
    const options = generateRegistrationOptions(walletAddress);
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/register/finish', async (req, res) => {
  try {
    const { walletAddress, credential } = req.body;
    if (!walletAddress || !credential) return res.status(400).json({ error: 'walletAddress and credential are required' });
    const result = await verifyRegistration(walletAddress, credential);
    if (!result.verified) return res.status(400).json({ error: 'Registration verification failed' });
    storeCredential(walletAddress, { credentialId: result.credentialId, publicKey: result.publicKey, counter: result.counter });
    res.json({ success: true, credentialId: result.credentialId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/authenticate/start', (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) return res.status(400).json({ error: 'walletAddress is required' });
    const options = generateAuthenticationOptions(walletAddress);
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/authenticate/finish', async (req, res) => {
  try {
    const { walletAddress, assertion } = req.body;
    if (!walletAddress || !assertion) return res.status(400).json({ error: 'walletAddress and assertion are required' });
    const result = await verifyAuthentication(walletAddress, assertion);
    if (!result.verified) return res.status(401).json({ error: 'Authentication failed' });
    res.json({ success: true, newCounter: result.newCounter });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

router.get('/credentials/:walletAddress', (req, res) => {
  const { walletAddress } = req.params;
  res.json(getCredentials(walletAddress));
});

router.delete('/credentials/:walletAddress/:credentialId', (req, res) => {
  const { walletAddress, credentialId } = req.params;
  removeCredential(walletAddress, credentialId);
  res.json({ success: true });
});

export default router;
