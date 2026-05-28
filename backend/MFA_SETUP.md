# MFA Setup Guide

Quick setup guide for implementing Multi-Factor Authentication in StellarTrustEscrow.

## Prerequisites

- Node.js 18+
- PostgreSQL database
- Redis cache
- Existing authentication system

## Installation

### 1. Install Dependencies

```bash
cd backend
npm install
```

New packages added:
- `otplib` - TOTP generation and verification
- `qrcode` - QR code generation for TOTP setup
- `@simplewebauthn/server` - WebAuthn server implementation

### 2. Generate Encryption Key

```bash
# Generate a secure 32-byte encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Configure Environment Variables

Add to your `.env` file:

```bash
# MFA Configuration
MFA_ENCRYPTION_KEY=<generated-32-byte-hex-key>

# WebAuthn Configuration (Production)
WEBAUTHN_RP_NAME="StellarTrustEscrow"
WEBAUTHN_RP_ID="yourdomain.com"
WEBAUTHN_ORIGIN="https://yourdomain.com"

# WebAuthn Configuration (Development)
# WEBAUTHN_RP_ID="localhost"
# WEBAUTHN_ORIGIN="http://localhost:3000"

# High-Value Transaction Threshold (optional)
MFA_HIGH_VALUE_THRESHOLD=10000
```

### 4. Run Database Migration

```bash
# Generate Prisma client
npm run db:generate

# Run migration
npm run db:migrate:up

# Or use Prisma migrate
npx prisma migrate deploy --schema=database/schema.prisma
```

### 5. Register MFA Routes

Add to your main router (e.g., `server.js` or `api/v1/index.js`):

```javascript
import mfaRoutes from './api/routes/mfa.js';

// After auth routes
app.use('/api/mfa', mfaRoutes);
```

## Usage Examples

### Protect Admin Routes

```javascript
import { requireMfa } from './api/middleware/mfaAuth.js';

// Require MFA for sensitive admin operations
router.post('/admin/users/:id/ban', 
  authMiddleware, 
  requireMfa, 
  adminController.banUser
);

router.patch('/admin/settings', 
  authMiddleware, 
  requireMfa, 
  adminController.updateSettings
);
```

### Protect High-Value Operations

```javascript
import { requireMfaForHighValue } from './api/middleware/mfaAuth.js';

// Automatically require MFA for transactions above threshold
router.post('/escrow/:id/release', 
  authMiddleware, 
  requireMfaForHighValue, 
  escrowController.release
);
```

### Enable MFA for Admin Users

```javascript
// Mark admin users as requiring MFA
await prisma.user.update({
  where: { id: adminUserId },
  data: { 
    role: 'admin',
    mfaEnforced: true 
  }
});
```

## Testing

### Run Tests

```bash
# All MFA tests
npm test -- mfa

# Specific test suites
npm test -- services/mfaService.test.js
npm test -- middleware/mfaAuth.test.js
```

### Manual Testing

#### Test TOTP Setup

```bash
# 1. Get auth token
TOKEN="your-jwt-token"

# 2. Initialize TOTP setup
curl -X POST http://localhost:3001/api/mfa/totp/setup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Authenticator"}'

# 3. Scan QR code with authenticator app

# 4. Verify setup with code from app
curl -X POST http://localhost:3001/api/mfa/totp/verify-setup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "123456"}'
```

#### Test MFA-Protected Route

```bash
# 1. Try accessing protected route without MFA
curl -X POST http://localhost:3001/api/admin/users/GTEST123/ban \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Test ban"}'

# Response: 403 with mfaRequired: true

# 2. Verify MFA
curl -X POST http://localhost:3001/api/mfa/totp/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "123456"}'

# Response includes mfaToken

# 3. Retry with MFA token
curl -X POST http://localhost:3001/api/admin/users/GTEST123/ban \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-MFA-Token: $MFA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Test ban"}'

# Success!
```

## Security Checklist

- [ ] Encryption key is 32 bytes (64 hex characters)
- [ ] Encryption key stored securely (not in code)
- [ ] HTTPS enabled in production
- [ ] WebAuthn RP_ID matches your domain
- [ ] WebAuthn ORIGIN matches your frontend URL
- [ ] Admin users have `mfaEnforced: true`
- [ ] Sensitive routes protected with `requireMfa`
- [ ] High-value routes protected with `requireMfaForHighValue`
- [ ] Backup codes stored securely by users
- [ ] Lockout duration appropriate for your use case
- [ ] Monitoring enabled for failed MFA attempts

## Troubleshooting

### "MFA_ENCRYPTION_KEY not set"

Generate and set the encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### "WebAuthn registration failed"

- Ensure HTTPS in production (WebAuthn requires secure context)
- Verify `WEBAUTHN_RP_ID` matches your domain
- Check browser console for detailed errors

### "TOTP codes not working"

- Verify device time is synchronized
- Check TOTP secret was entered correctly
- Try backup codes if available

### "Account locked"

Wait 15 minutes or manually unlock:
```javascript
await prisma.mfaLockout.delete({
  where: { userId: <user-id> }
});
```

## Production Deployment

### Pre-Deployment

1. Generate production encryption key
2. Configure WebAuthn for production domain
3. Run database migration
4. Test MFA flow end-to-end
5. Enable MFA for admin accounts

### Post-Deployment

1. Monitor MFA adoption rate
2. Check for failed attempt patterns
3. Review lockout frequency
4. Verify audit logs are captured

### Monitoring Queries

```sql
-- Failed MFA attempts in last hour
SELECT * FROM mfa_attempts 
WHERE success = false 
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Current lockouts
SELECT * FROM mfa_lockouts 
WHERE locked_until > NOW();

-- MFA adoption rate
SELECT 
  COUNT(*) FILTER (WHERE mfa_enabled) as enabled,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE mfa_enabled) / COUNT(*), 2) as percentage
FROM users;
```

## Next Steps

1. Review [MFA_IMPLEMENTATION.md](./docs/MFA_IMPLEMENTATION.md) for detailed documentation
2. Implement frontend MFA flows
3. Add MFA to additional sensitive routes
4. Configure monitoring and alerts
5. Train admin users on MFA usage

## Support

For issues or questions:
- Check [MFA_IMPLEMENTATION.md](./docs/MFA_IMPLEMENTATION.md) troubleshooting section
- Review test files for usage examples
- Check audit logs for detailed error information
