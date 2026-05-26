# API Deprecation Strategy Guide

## Overview

This guide describes the comprehensive API deprecation process for the Stellar Trust Escrow platform. Our deprecation strategy ensures smooth transitions when APIs change, providing clear communication and migration paths for API consumers.

## Deprecation Process

### 1. Announcement Phase
- Deprecation is announced at least 6 months before sunset
- Documentation is updated with migration guides
- Deprecation headers are added to affected endpoints

### 2. Deprecation Phase
- Endpoints continue to work normally
- All responses include deprecation headers
- Usage is logged for monitoring
- Support team is notified of active users

### 3. Sunset Phase
- After sunset date, endpoints return 410 Gone
- Clear error messages with migration guidance
- Support available for urgent migrations

## HTTP Headers

Our deprecation strategy uses standard HTTP headers for maximum compatibility:

### Response Headers

| Header | Description | Example |
|--------|-------------|---------|
| `Deprecation` | Indicates endpoint is deprecated (RFC 8594) | `true` |
| `Sunset` | Date when endpoint will be removed (RFC 8594) | `Sat, 31 Dec 2026 23:59:59 GMT` |
| `Warning` | Human-readable deprecation message (RFC 7234) | `299 - "API v1 is deprecated"` |
| `Link` | Link to deprecation documentation | `</docs>; rel="deprecation"` |
| `X-API-Deprecated` | Custom header for easy parsing | `true` |
| `X-API-Deprecated-Version` | Version being deprecated | `v1` |
| `X-API-Sunset-Date` | ISO 8601 sunset date | `2026-12-31T23:59:59.000Z` |
| `X-API-Replacement` | Suggested replacement endpoint | `/api/v2/escrows` |

## Usage Examples

### Deprecating a Specific Endpoint

```javascript
import { deprecate } from './api/middleware/deprecation.js';

router.get('/old-endpoint',
  deprecate({
    version: 'v1',
    sunsetDate: new Date('2026-12-31'),
    replacement: '/api/v2/new-endpoint',
    message: 'This endpoint is deprecated. Please use v2 API.'
  }),
  controller.handler
);
```

### Deprecating an Entire API Version

```javascript
import { deprecateVersion, deprecationPresets } from './api/middleware/deprecation.js';

// Using preset configuration
app.use('/api/v1', deprecateVersion(deprecationPresets.v1));
```


### Enforcing Sunset Date

```javascript
import { enforceSunset, deprecate } from './api/middleware/deprecation.js';

const sunsetDate = new Date('2026-06-01');

router.get('/legacy-endpoint',
  enforceSunset(sunsetDate),  // Returns 410 Gone after sunset
  deprecate({
    version: 'legacy',
    sunsetDate,
    replacement: '/api/v2/endpoint'
  }),
  controller.handler
);
```

### Adding Deprecation Info to Response Body

```javascript
import { addDeprecationToResponse } from './api/middleware/deprecation.js';

router.get('/api/v1/data',
  addDeprecationToResponse({
    version: 'v1',
    sunsetDate: new Date('2026-12-31'),
    replacement: '/api/v2/data'
  }),
  (req, res) => {
    res.json({
      data: [...],
      // _deprecation field will be automatically added
    });
  }
);
```

## Client Integration

### Detecting Deprecated Endpoints

Clients should check for deprecation headers in responses:

```javascript
// JavaScript/Node.js example
const response = await fetch('/api/escrows');

if (response.headers.get('Deprecation') === 'true') {
  const sunsetDate = response.headers.get('X-API-Sunset-Date');
  const replacement = response.headers.get('X-API-Replacement');
  
  console.warn(`API deprecated. Sunset: ${sunsetDate}. Use: ${replacement}`);
}
```

### Handling 410 Gone Responses

```javascript
const response = await fetch('/api/old-endpoint');

if (response.status === 410) {
  const error = await response.json();
  console.error('Endpoint has been sunset:', error.message);
}
```

## Monitoring Deprecation Usage

All deprecated endpoint usage is automatically logged with details including path, method, version, sunset date, user agent, and IP address.

## Deprecation Presets

Pre-configured deprecation settings for common scenarios:

### Legacy Unversioned Endpoints
- Sunset: 2026-12-31
- Replacement: /api/v1

### API v1
- Sunset: 2027-06-30
- Replacement: /api/v2

## Best Practices

1. **Provide Adequate Notice**: Minimum 6 months for minor changes, 12 months for major versions
2. **Clear Migration Paths**: Document replacement endpoints with code examples
3. **Monitor Usage**: Track deprecated endpoint usage and identify heavy users
4. **Gradual Rollout**: Start with headers, add notices, then enforce sunset
5. **Version Everything**: Use semantic versioning in URL paths

## Communication Checklist

When deprecating an API:

- [ ] Update API documentation
- [ ] Add deprecation middleware to endpoints
- [ ] Create migration guide
- [ ] Announce in changelog
- [ ] Email notification to registered developers
- [ ] Update SDK/client libraries
- [ ] Add sunset date to status page
- [ ] Monitor usage and reach out to heavy users
- [ ] Provide support during transition period

## References

- [RFC 8594 - Sunset HTTP Header](https://www.rfc-editor.org/rfc/rfc8594.html)
- [RFC 7234 - HTTP Caching (Warning Header)](https://www.rfc-editor.org/rfc/rfc7234.html)
