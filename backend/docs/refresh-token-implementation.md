# JWT Refresh Token Rotation Implementation

This document describes the secure JWT refresh token rotation system implemented for the Stellar Trust Escrow platform.

## Overview

The implementation provides:
- **Short-lived access tokens** (15 minutes) for reduced exposure
- **Long-lived refresh tokens** (7 days) with automatic rotation
- **Redis-based token blacklist** for immediate revocation
- **Secure httpOnly cookie storage** with SameSite=Strict
- **Multiple concurrent sessions** per user (max 5)
- **Comprehensive metrics logging** for security monitoring

## Architecture

### Token Flow

```
1. User Login → Access Token (15m) + Refresh Token (7d)
2. API Request → Access Token Validation
3. Access Token Expired → Auto-refresh using Refresh Token
4. Refresh Token Used → Old Token Blacklisted + New Token Generated
5. Refresh Token Rotation → Continuous security improvement
```

### Security Features

- **Token Rotation**: Each refresh creates a new token and blacklists the old one
- **Redis Blacklist**: Immediate token revocation for compromised tokens
- **Concurrent Session Limits**: Maximum 5 active refresh tokens per user
- **Device Tracking**: IP address and user agent logging for each token
- **Suspicious Activity Detection**: Metrics for unusual refresh patterns
- **Secure Cookies**: httpOnly, SameSite=Strict, and secure flags

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login with token generation |
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/logout` | Revoke specific refresh token |
| POST | `/api/auth/revoke-all` | Revoke all user tokens (requires auth) |
| GET | `/api/auth/sessions` | List active user sessions (requires auth) |

### Token Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/refresh` | Rotate refresh token and get new access token |

## Database Schema

### RefreshToken Model

```prisma
model RefreshToken {
  id         String   @id @default(cuid())
  userId     Int      @map("user_id")
  tenantId   String   @map("tenant_id")
  tokenHash  String   @unique @map("token_hash")
  deviceInfo Json?    @map("device_info")
  ipAddress  String?  @map("ip_address")
  userAgent  String?  @map("user_agent")
  isActive   Boolean  @default(true) @map("is_active")
  expiresAt  DateTime @map("expires_at")
  lastUsedAt DateTime? @map("last_used_at")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@index([userId, tenantId])
  @@index([tokenHash])
  @@index([expiresAt])
  @@index([isActive])
  @@map("refresh_tokens")
}
```

## Environment Variables

```bash
# JWT Configuration
JWT_ACCESS_SECRET=your_strong_access_secret_here
JWT_REFRESH_SECRET=your_strong_refresh_secret_here
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Redis for Blacklist (optional, falls back to memory)
REDIS_URL=redis://localhost:6379
```

## Usage Examples

### Basic Login Flow

```javascript
// Login
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'your_tenant_id'
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const { accessToken, refreshToken } = await response.json();
```

### Token Refresh

```javascript
// Auto-refresh when access token expires
const refreshResponse = await fetch('/api/auth/refresh', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'your_tenant_id'
  },
  body: JSON.stringify({ refreshToken })
});

const { accessToken: newAccessToken, refreshToken: newRefreshToken } = await refreshResponse.json();
```

### Secure Cookie Usage

```javascript
// With httpOnly cookies (recommended)
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'your_tenant_id'
  },
  credentials: 'include' // Important for cookies
});

// Refresh token automatically sent in cookies
const refreshResponse = await fetch('/api/auth/refresh', {
  method: 'POST',
  headers: {
    'X-Tenant-ID': 'your_tenant_id'
  },
  credentials: 'include'
});
```

### Session Management

```javascript
// List active sessions
const sessionsResponse = await fetch('/api/auth/sessions', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'X-Tenant-ID': 'your_tenant_id'
  }
});

const { sessions } = await sessionsResponse.json();

// Revoke all sessions
await fetch('/api/auth/revoke-all', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'X-Tenant-ID': 'your_tenant_id'
  }
});
```

## Security Best Practices

### Client-Side

1. **Store access tokens in memory** (not localStorage)
2. **Use httpOnly cookies** for refresh tokens when possible
3. **Implement automatic token refresh** before expiry
4. **Clear all tokens on logout**
5. **Handle token expiry gracefully**

### Server-Side

1. **Always validate token type** in JWT payload
2. **Check Redis blacklist** on every token validation
3. **Log all token events** for security monitoring
4. **Implement rate limiting** on refresh endpoints
5. **Monitor suspicious activity patterns**

### Token Rotation

1. **Rotate refresh tokens on every use**
2. **Blacklist old tokens immediately**
3. **Limit concurrent sessions per user**
4. **Track device information** for each token
5. **Implement emergency revocation** procedures

## Monitoring and Metrics

### Available Metrics

- `tokensGenerated`: Total tokens created
- `tokensRefreshed`: Successful token rotations
- `tokensRevoked`: Tokens explicitly revoked
- `tokensBlacklisted`: Tokens blacklisted for security
- `refreshAttempts`: Total refresh attempts
- `refreshFailures`: Failed refresh attempts
- `concurrentSessions`: Currently active sessions
- `suspiciousActivity`: Detected security issues

### Monitoring Endpoints

```javascript
// Get token metrics (admin only)
const metrics = await fetch('/api/admin/metrics/tokens', {
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'X-Tenant-ID': 'your_tenant_id'
  }
});
```

## Migration Guide

### From Single Refresh Token

1. **Run database migration** to add `refresh_tokens` table
2. **Update environment variables** with separate JWT secrets
3. **Deploy new authentication endpoints**
4. **Update client code** to use new refresh flow
5. **Monitor metrics** during transition

### Breaking Changes

- Old `users.refresh_token` column is removed
- Refresh tokens now include `tokenId` and `type` fields
- Access tokens must include `type: 'access'`
- Refresh endpoint now rotates tokens automatically

## Testing

Run the comprehensive test suite:

```bash
# Run refresh token tests
npm test -- refreshToken.test.js

# Run all authentication tests
npm test -- auth

# Run with coverage
npm test -- --coverage --testPathPattern=refreshToken
```

## Troubleshooting

### Common Issues

1. **"Token has been revoked"**: Check Redis blacklist
2. **"Invalid token type"**: Ensure JWT includes `type` field
3. **"Too many concurrent sessions"**: User exceeded session limit
4. **Redis connection errors**: Falls back to memory blacklist

### Debug Logging

Enable debug logging:

```bash
DEBUG=token:* npm run dev
```

## Security Considerations

### Threat Mitigation

- **Token Theft**: Automatic rotation reduces window of abuse
- **Replay Attacks**: Blacklist prevents token reuse
- **Session Hijacking**: Device tracking and IP monitoring
- **Brute Force**: Rate limiting on refresh endpoints
- **XSS**: httpOnly cookies protect refresh tokens

### Compliance

- **GDPR**: Right to revoke all tokens (logout all)
- **SOC 2**: Comprehensive audit logging
- **OWASP**: Follows JWT security best practices

## Performance Considerations

- **Redis TTL**: Automatic cleanup of expired blacklist entries
- **Database Indexes**: Optimized queries for token validation
- **Connection Pooling**: Efficient database connections
- **Memory Fallback**: Graceful degradation without Redis

## Future Enhancements

- **Webhook notifications** for suspicious activity
- **Geographic tracking** for token usage
- **Adaptive authentication** based on risk scores
- **Hardware-backed tokens** for high-security accounts
- **Biometric authentication** integration

## Support

For issues or questions about the refresh token implementation:

1. Check the troubleshooting guide
2. Review the test cases for expected behavior
3. Monitor metrics for unusual patterns
4. Contact the security team for security concerns
