# Multi-Factor Authentication (MFA) Implementation

## Overview

This document describes the comprehensive MFA implementation for StellarTrustEscrow, providing enhanced security for administrative panels and high-value wallet operations through TOTP and WebAuthn-based secondary verification.

## Features

### Supported MFA Methods

1. **TOTP (Time-based One-Time Password)**
   - Compatible with Google Authenticator, Authy, 1Password, etc.
   - 30-second time window with ±1 step tolerance
   - 10 backup codes for account recovery
   - QR code generation for easy setup

2. **WebAuthn (Hardware Security Keys)**
   - Support for YubiKey, Titan, and other FIDO2 devices
   - Biometric authentication (Touch ID, Face ID, Windows Hello)
   - Replay attack protection via signature counters
   - Multiple device registration

### Security Features

- **Brute-force Protection**: Automatic lockout after 5 failed attempts
- **Temporary Lockouts**: 15-minute lockout duration with exponential backoff
- **Encrypted Storage**: TOTP secrets and backup codes encrypted at rest
- **Audit Trail**: Complete logging of all MFA attempts and changes
- **Session Management**: 30-minute MFA sessions with automatic extension
- **Replay Protection**: WebAuthn counter validation prevents replay attacks

## Architecture

### Database Schema

```prisma
model User {
  mfaEnabled   Boolean  @default(false)
  mfaEnforced  Boolean  @default(false)
  role         String   @default("user")
  mfaMethods   MfaMethod[]
  mfaAttempts  MfaAttempt[]
}

model MfaMethod {
  type          MfaType  // TOTP | WEBAUTHN
  totpSecret    String?  // Encrypted
  credentialId  String?  // WebAuthn
  publicKey     String?  // WebAuthn
  counter       BigInt?  // WebAuthn replay protection
}

model MfaAttempt {
  success       Boolean
  methodType    MfaType
  failureReason String?
}

model MfaLockout {
  lockedUntil   DateTime
  attempts      Int
}
```

### Components

1. **MFA Service** (`services/mfaService.js`)
   - Core MFA logic
   - TOTP generation and verification
   - WebAuthn registration and authentication
   - Lockout management

2. **MFA Middleware** (`api/middleware/mfaAuth.js`)
   - Route protection
   - Session validation
   - High-value operation checks

3. **MFA Controller** (`api/controllers/mfaController.js`)
   - API endpoints for setup and verification
   - Method management

## API Endpoints

### Setup & Management

#### Get MFA Status

```http
GET /api/mfa/status
Authorization: Bearer <token>

Response:
{
  "mfaEnabled": true,
  "mfaRequired": true,
  "methods": [
    {
      "id": "method-123",
      "type": "TOTP",
      "name": "Authenticator App",
      "isPrimary": true,
      "lastUsedAt": "2026-05-28T10:00:00Z"
    }
  ]
}
```

#### List MFA Methods

```http
GET /api/mfa/methods
Authorization: Bearer <token>
```

#### Remove MFA Method

```http
DELETE /api/mfa/methods/:methodId
Authorization: Bearer <token>
X-MFA-Token: <mfa-token>
```

### TOTP Setup

#### Initialize TOTP Setup

```http
POST /api/mfa/totp/setup
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Authenticator"
}

Response:
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,...",
  "otpauth": "otpauth://totp/...",
  "methodName": "My Authenticator"
}
```

#### Verify TOTP Setup

```http
POST /api/mfa/totp/verify-setup
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "123456"
}

Response:
{
  "success": true,
  "method": {
    "id": "method-123",
    "type": "TOTP",
    "name": "My Authenticator"
  },
  "backupCodes": [
    "ABCD-1234",
    "EFGH-5678",
    ...
  ]
}
```

### TOTP Verification

```http
POST /api/mfa/totp/verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "123456"
}

Response:
{
  "verified": true,
  "method": "TOTP",
  "mfaToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "30m"
}
```

### WebAuthn Setup

#### Generate Registration Options

```http
POST /api/mfa/webauthn/register-options
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "YubiKey 5"
}

Response:
{
  "challenge": "base64-challenge",
  "rp": { "name": "StellarTrustEscrow", "id": "localhost" },
  "user": { ... },
  "pubKeyCredParams": [ ... ]
}
```

#### Verify Registration

```http
POST /api/mfa/webauthn/register-verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "response": {
    "id": "credential-id",
    "rawId": "...",
    "response": { ... },
    "type": "public-key"
  }
}
```

### WebAuthn Authentication

#### Generate Authentication Options

```http
POST /api/mfa/webauthn/auth-options
Authorization: Bearer <token>
```

#### Verify Authentication

```http
POST /api/mfa/webauthn/auth-verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "response": {
    "id": "credential-id",
    "rawId": "...",
    "response": { ... }
  }
}

Response:
{
  "verified": true,
  "method": "WEBAUTHN",
  "mfaToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "30m"
}
```

## Usage

### Protecting Routes

#### Require MFA for All Requests

```javascript
import { requireMfa } from './api/middleware/mfaAuth.js';

router.post('/admin/users/:id/ban', authMiddleware, requireMfa, adminController.banUser);
```

#### Require MFA for High-Value Operations

```javascript
import { requireMfaForHighValue } from './api/middleware/mfaAuth.js';

router.post(
  '/escrow/:id/release',
  authMiddleware,
  requireMfaForHighValue,
  escrowController.release,
);
```

### Client-Side Flow

#### TOTP Setup Flow

```javascript
// 1. Initialize setup
const { qrCode, secret } = await fetch('/api/mfa/totp/setup', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());

// 2. Display QR code to user
displayQRCode(qrCode);

// 3. User scans and enters code
const code = getUserInput();

// 4. Verify setup
const { backupCodes } = await fetch('/api/mfa/totp/verify-setup', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ code }),
}).then((r) => r.json());

// 5. Display backup codes
displayBackupCodes(backupCodes);
```

#### TOTP Verification Flow

```javascript
// 1. User attempts protected action
// 2. Server returns 403 with mfaRequired: true
// 3. Prompt user for MFA code
const code = getUserInput();

// 4. Verify MFA
const { mfaToken } = await fetch('/api/mfa/totp/verify', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ code }),
}).then((r) => r.json());

// 5. Retry original request with MFA token
await fetch('/admin/users/123/ban', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'X-MFA-Token': mfaToken,
  },
});
```

#### WebAuthn Setup Flow

```javascript
import { startRegistration } from '@simplewebauthn/browser';

// 1. Get registration options
const options = await fetch('/api/mfa/webauthn/register-options', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());

// 2. Prompt user to use security key
const response = await startRegistration(options);

// 3. Verify registration
await fetch('/api/mfa/webauthn/register-verify', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ response }),
});
```

## Configuration

### Environment Variables

```bash
# MFA Encryption
MFA_ENCRYPTION_KEY=<32-byte-hex-key>

# WebAuthn Configuration
WEBAUTHN_RP_NAME="StellarTrustEscrow"
WEBAUTHN_RP_ID="yourdomain.com"
WEBAUTHN_ORIGIN="https://yourdomain.com"

# High-Value Threshold (in base currency units)
MFA_HIGH_VALUE_THRESHOLD=10000

# JWT Secret (shared with main auth)
JWT_SECRET=<your-secret>
```

### Lockout Configuration

Edit `services/mfaService.js`:

```javascript
const MAX_FAILED_ATTEMPTS = 5; // Attempts before lockout
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minute window
```

## Security Considerations

### Encryption

- TOTP secrets are encrypted using AES-256-CBC
- Backup codes are hashed with SHA-256 before encryption
- Encryption key must be 32 bytes (64 hex characters)
- Store encryption key securely (environment variable, secrets manager)

### Backup Codes

- Generated using cryptographically secure random bytes
- Each code is 8 characters (XXXX-XXXX format)
- Hashed before storage to prevent plaintext exposure
- Single-use only - removed after successful verification
- Users should store in secure location (password manager)

### WebAuthn Security

- Credential IDs are unique per device
- Public keys stored, private keys never leave device
- Signature counters prevent replay attacks
- AAGUID tracking for device identification
- Origin validation prevents phishing

### Rate Limiting

- 5 failed attempts trigger 15-minute lockout
- Attempts counted within 10-minute sliding window
- Lockout applies to all MFA methods for user
- Successful verification clears lockout
- IP-based tracking for additional protection

## Performance

### Caching Strategy

- MFA sessions cached in Redis for 30 minutes
- Challenge data cached for 5 minutes during setup
- Automatic session extension on each request
- Cache invalidation on logout or method removal

### Database Optimization

- Indexed queries for user lookups
- Composite indexes for attempt tracking
- Efficient lockout checks with single query
- Batch operations for cleanup tasks

### Benchmarks

- TOTP verification: <10ms
- WebAuthn verification: <50ms
- Session validation: <5ms (cached)
- Lockout check: <5ms

## Monitoring & Metrics

### Key Metrics

- MFA enrollment rate
- Verification success/failure rates
- Lockout frequency
- Method distribution (TOTP vs WebAuthn)
- Average verification time

### Audit Logging

All MFA events are logged to `mfa_attempts` table:

- Setup attempts
- Verification attempts (success/failure)
- Method additions/removals
- Lockout events

Query recent failed attempts:

```sql
SELECT * FROM mfa_attempts
WHERE success = false
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

## Troubleshooting

### Common Issues

#### "TOTP setup not found or expired"

- Setup session expired (5 minutes)
- User needs to restart setup process

#### "Account locked due to too many failed attempts"

- Wait 15 minutes or contact admin
- Check `mfa_lockouts` table for details

#### "WebAuthn registration failed"

- Ensure HTTPS in production
- Verify RP_ID matches domain
- Check browser compatibility

#### "Invalid verification code"

- Check device time synchronization
- Verify correct authenticator app
- Try backup code if available

### Admin Operations

#### Unlock User Account

```javascript
await prisma.mfaLockout.delete({
  where: { userId: <user-id> }
});
```

#### Disable MFA for User (Emergency)

```javascript
await prisma.user.update({
  where: { id: <user-id> },
  data: { mfaEnabled: false, mfaEnforced: false }
});

await prisma.mfaMethod.updateMany({
  where: { userId: <user-id> },
  data: { isActive: false }
});
```

#### View User's MFA Status

```javascript
const user = await prisma.user.findUnique({
  where: { id: <user-id> },
  include: {
    mfaMethods: { where: { isActive: true } },
    mfaAttempts: {
      take: 10,
      orderBy: { createdAt: 'desc' }
    }
  }
});
```

## Migration

### Running the Migration

```bash
# Generate Prisma client
npm run db:generate

# Run migration
npm run db:migrate:up

# Or use Prisma directly
npx prisma migrate deploy --schema=database/schema.prisma
```

### Rollback

```bash
npm run db:migrate:down
```

## Testing

### Run Tests

```bash
# All MFA tests
npm test -- mfa

# Service tests only
npm test -- services/mfaService.test.js

# Middleware tests only
npm test -- middleware/mfaAuth.test.js
```

### Test Coverage

- TOTP setup and verification
- WebAuthn registration and authentication
- Brute-force protection
- Backup code usage
- Session management
- Error handling
- Edge cases

## Future Enhancements

- [ ] SMS-based MFA (with rate limiting)
- [ ] Email-based MFA for account recovery
- [ ] Risk-based authentication (adaptive MFA)
- [ ] Device fingerprinting
- [ ] Trusted device management
- [ ] MFA enforcement policies per tenant
- [ ] Admin dashboard for MFA analytics
- [ ] Backup code regeneration
- [ ] WebAuthn attestation verification

## References

- [TOTP RFC 6238](https://tools.ietf.org/html/rfc6238)
- [WebAuthn Specification](https://www.w3.org/TR/webauthn-2/)
- [FIDO2 Overview](https://fidoalliance.org/fido2/)
- [OWASP MFA Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
