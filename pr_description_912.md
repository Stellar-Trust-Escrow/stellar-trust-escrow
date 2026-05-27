# feat: Add Comprehensive Automated Accessibility Scanner

## Summary

This PR implements a comprehensive automated accessibility scanner using Playwright and @axe-core/playwright to prevent accessibility regressions in the frontend application.

## Changes

### Core Implementation
- ✅ Created `scripts/accessibility-scan.js` - Automated scanner that checks all major pages for WCAG Level AA violations
- ✅ Installed `@axe-core/playwright` dependency for accessibility testing
- ✅ Added `test:a11y:scan` npm script to frontend package.json
- ✅ Installed `wait-on` dependency for CI server startup coordination

### Pages Scanned
The scanner automatically checks these routes:
1. Landing Page (`/`)
2. Dashboard (`/dashboard`)
3. Explorer (`/explorer`)
4. Create Escrow (`/escrow/create`)
5. Profile (`/profile`)

### CI/CD Integration
- ✅ Enhanced `.github/workflows/ci.yml` accessibility job
- ✅ Automated scanner runs on every PR and push to develop
- ✅ Builds frontend, starts server, and runs comprehensive scans
- ✅ Uploads detailed HTML reports as artifacts
- ✅ Blocks PRs that exceed violation thresholds

### Thresholds
Custom thresholds configured to fail CI on critical violations:

| Impact Level | Local | CI Mode |
|--------------|-------|---------|
| Critical     | 0     | 0       |
| Serious      | 5     | 0       |
| Moderate     | 10    | 5       |
| Minor        | 20    | 10      |

**CI mode is stricter** to prevent regressions from being merged.

### Documentation
- ✅ Created `scripts/README-ACCESSIBILITY.md` with comprehensive guide
- ✅ Local testing instructions
- ✅ Common issues and fixes
- ✅ Best practices and resources
- ✅ Troubleshooting guide

### Configuration
- ✅ Added `frontend/accessibility-reports/` to .gitignore
- ✅ Configured Axe to check WCAG 2.0 Level A, AA and WCAG 2.1 Level A, AA
- ✅ HTML reports generated with detailed violation information

## Testing

### Local Testing
```bash
cd frontend
npm run build
npm run start:test

# In another terminal
npm run test:a11y:scan
```

### CI Testing
The scanner runs automatically in the CI pipeline when frontend files change.

## Reports

The scanner generates detailed HTML reports including:
- Summary of violations by severity
- Detailed information for each violation
- Affected HTML elements with code snippets
- Links to WCAG guidelines and remediation guidance
- WCAG criteria references

## Benefits

1. **Automated Detection** - Catches accessibility issues before they reach production
2. **WCAG Compliance** - Ensures Level AA compliance across all major pages
3. **Developer Feedback** - Clear, actionable reports with fix guidance
4. **CI Integration** - Blocks PRs with critical violations
5. **Local Development** - Run scans during development to catch issues early

## Usage

Run locally:
```bash
npm run test:a11y:scan
```

View reports in `frontend/accessibility-reports/`

## Documentation

See `scripts/README-ACCESSIBILITY.md` for:
- Complete setup instructions
- Understanding violation severity
- Common issues and fixes
- Best practices
- Troubleshooting guide

Closes #912
