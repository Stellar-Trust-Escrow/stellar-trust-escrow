import 'dotenv/config';
import keyRotationService from './services/keyRotationService.js';
import cache from './lib/cache.js';
import jwt from 'jsonwebtoken';

async function run() {
  try {
    console.log("Rotating Key 1...");
    const key1 = await keyRotationService.rotateKey();
    console.log("Current Key 1 KID:", key1.kid);
    
    const jwks = await keyRotationService.getValidPublicKeys(true);
    console.log("JWKS:", jwks.map(k => k.kid));
    
    const token = jwt.sign({ hello: "world" }, key1.privateKey, { algorithm: 'RS256', keyid: key1.kid });
    
    console.log("Rotating Key 2...");
    const key2 = await keyRotationService.rotateKey();
    console.log("Current Key 2 KID:", key2.kid);
    
    const validKeys = await keyRotationService.getValidPublicKeys();
    console.log("Valid keys length:", validKeys.length);
    console.log("Valid kids:", validKeys.map(k => k.kid));
    
    // Test verification
    const decoded = jwt.decode(token, { complete: true });
    console.log("Decoded token kid:", decoded.header.kid);
    
    const matched = validKeys.find(k => k.kid === decoded.header.kid);
    if (matched) {
       console.log("Matched key found! Verifying...");
       jwt.verify(token, matched.publicKey, { algorithms: ['RS256'] });
       console.log("Verification successful!");
    } else {
       console.log("Match not found!");
    }

  } catch (e) {
    console.error("Error:", e);
  } finally {
    process.exit(0);
  }
}
run();
