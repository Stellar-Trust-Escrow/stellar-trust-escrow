# Deprecation Middleware - Quick Start

## Quick Usage

### 1. Deprecate a Single Endpoint

```javascript
import { deprecate } from './deprecation.js';

router.get('/old-endpoint',
  deprecate({
    version: 'v1',
    sunsetDate: new Date('2026-12-31'),
    replacement: '/api/v2/new-endpoint'
  }),
  controller.handler
);
```

### 2. Deprecate All Routes in a Version

```javascript
import { deprecateVersion, deprecationPresets } from './deprecation.js';

// In server.js
app.use('/api/v1', deprecateVersion(deprecationPresets.v1));
```

### 3. Enforce Sunset (Return 410 Gone)

```javascript
import { enforceSunset, deprecate } from './deprecation.js';

const sunsetDate = new Date('2026-06-01');

router.get('/legacy',
  enforceSunset(sunsetDate),
  deprecate({ version: 'legacy', sunsetDate }),
  controller.handler
);
```

## Response Headers Added

- `Deprecation: true` (RFC 8594)
- `Sunset: Sat, 31 Dec 2026 23:59:59 GMT` (RFC 8594)
- `Warning: 299 - "..."` (RFC 7234)
- `X-API-Deprecated: true`
- `X-API-Deprecated-Version: v1`
- `X-API-Sunset-Date: 2026-12-31T23:59:59.000Z`
- `X-API-Replacement: /api/v2/endpoint`

## Available Functions

- `deprecate(config)` - Mark endpoint as deprecated
- `deprecateVersion(config)` - Deprecate entire API version
- `enforceSunset(date)` - Return 410 Gone after sunset
- `addDeprecationToResponse(config)` - Add deprecation to response body
- `createDeprecationNotice(config)` - Create deprecation notice object

## Presets

- `deprecationPresets.legacyUnversioned` - For unversioned endpoints
- `deprecationPresets.v1` - For v1 API deprecation

## Full Documentation

See `/backend/docs/API_DEPRECATION_GUIDE.md` for complete documentation.
