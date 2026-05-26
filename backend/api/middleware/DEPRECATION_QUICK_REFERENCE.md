# API Deprecation - Quick Reference Card

## Import

```javascript
import { 
  deprecate, 
  deprecateVersion, 
  enforceSunset,
  deprecationPresets 
} from './api/middleware/deprecation.js';
```

## Common Patterns

### Pattern 1: Deprecate Single Endpoint
```javascript
router.get('/old', 
  deprecate({
    version: 'v1',
    sunsetDate: new Date('2026-12-31'),
    replacement: '/api/v2/new'
  }),
  handler
);
```

### Pattern 2: Deprecate API Version
```javascript
app.use('/api/v1', deprecateVersion(deprecationPresets.v1));
```

### Pattern 3: Enforce Sunset
```javascript
router.get('/legacy',
  enforceSunset(new Date('2026-06-01')),
  handler
);
```

### Pattern 4: Combined (Recommended)
```javascript
const sunset = new Date('2026-12-31');

router.get('/endpoint',
  enforceSunset(sunset),
  deprecate({
    version: 'v1',
    sunsetDate: sunset,
    replacement: '/api/v2/endpoint'
  }),
  handler
);
```

## Configuration Object

```javascript
{
  version: 'v1',              // Required: API version
  sunsetDate: new Date(),     // Required: Removal date
  replacement: '/api/v2/...',  // Optional: New endpoint
  message: 'Custom message',   // Optional: Custom warning
  documentationUrl: '/docs'    // Optional: Docs URL
}
```

## Response Headers

| Header | Value |
|--------|-------|
| Deprecation | `true` |
| Sunset | `Sat, 31 Dec 2026 23:59:59 GMT` |
| Warning | `299 - "Message"` |
| X-API-Deprecated | `true` |
| X-API-Replacement | `/api/v2/endpoint` |

## Presets

```javascript
deprecationPresets.legacyUnversioned  // Sunset: 2026-12-31
deprecationPresets.v1                 // Sunset: 2027-06-30
```

## Timeline

1. **Announce** - Add deprecation headers (6+ months before sunset)
2. **Monitor** - Track usage and contact heavy users
3. **Sunset** - Enforce with `enforceSunset()` (returns 410 Gone)

## Client Detection

```javascript
if (response.headers.get('Deprecation') === 'true') {
  const sunset = response.headers.get('X-API-Sunset-Date');
  const replacement = response.headers.get('X-API-Replacement');
  console.warn(`Deprecated! Sunset: ${sunset}. Use: ${replacement}`);
}
```

## Full Docs

📖 See `backend/docs/API_DEPRECATION_GUIDE.md`
