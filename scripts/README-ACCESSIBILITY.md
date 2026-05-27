# Accessibility Scanner

Automated accessibility testing for the Stellar Trust Escrow frontend using Playwright and @axe-core/playwright.

## Overview

The accessibility scanner automatically checks all major pages of the application for WCAG Level AA violations. It runs as part of the CI/CD pipeline and can also be run locally during development.

## Running Locally

### Prerequisites

1. Install dependencies:
   ```bash
   npm ci
   cd frontend && npm ci
   ```

2. Build and start the frontend:
   ```bash
   cd frontend
   npm run build
   npm run start:test
   ```

### Run the Scanner

In a separate terminal:

```bash
cd frontend
npm run test:a11y:scan
```

Or from the root directory:

```bash
node scripts/accessibility-scan.js
```

### Environment Variables

- `BASE_URL` - Base URL of the application (default: `http://localhost:3000`)
- `CI` - Set to `true` to enable stricter CI thresholds

Example:
```bash
BASE_URL=http://localhost:3000 npm run test:a11y:scan
```

## Pages Scanned

The scanner checks the following pages:

1. **Landing Page** (`/`)
2. **Dashboard** (`/dashboard`)
3. **Explorer** (`/explorer`)
4. **Create Escrow** (`/escrow/create`)
5. **Profile** (`/profile`)

## Violation Thresholds

The scanner uses different thresholds for local development vs CI:

| Impact Level | Local Threshold | CI Threshold |
|--------------|----------------|--------------|
| Critical     | 0              | 0            |
| Serious      | 5              | 0            |
| Moderate     | 10             | 5            |
| Minor        | 20             | 10           |

**CI mode is stricter** to prevent accessibility regressions from being merged.

## Understanding Results

### HTML Report

After each scan, an HTML report is generated in `frontend/accessibility-reports/`. The report includes:

- Summary of violations by severity
- Detailed information for each violation
- Affected HTML elements
- Links to remediation guidance
- WCAG criteria references

### Violation Severity

- **Critical**: Must be fixed immediately. Blocks basic functionality for users with disabilities.
- **Serious**: Significant barriers that should be fixed soon.
- **Moderate**: Noticeable issues that should be addressed.
- **Minor**: Small improvements that enhance accessibility.

## CI Integration

The accessibility scanner runs automatically in the CI pipeline:

1. Triggered on pushes and PRs to `develop` branch
2. Only runs when frontend files change
3. Fails the build if thresholds are exceeded
4. Uploads HTML reports as artifacts

### Viewing CI Reports

1. Go to the GitHub Actions run
2. Navigate to the "Accessibility (a11y)" job
3. Download the `accessibility-reports-*` artifact
4. Open the HTML file in a browser

## Common Issues and Fixes

### Color Contrast

**Issue**: Text doesn't have sufficient contrast with background.

**Fix**: Use colors that meet WCAG AA contrast ratios:
- Normal text: 4.5:1
- Large text (18pt+): 3:1

### Missing Alt Text

**Issue**: Images missing `alt` attributes.

**Fix**: Add descriptive alt text to all images:
```jsx
<img src="logo.png" alt="Stellar Trust Escrow Logo" />
```

### Form Labels

**Issue**: Form inputs missing associated labels.

**Fix**: Use proper label associations:
```jsx
<label htmlFor="email">Email</label>
<input id="email" type="email" />
```

### Keyboard Navigation

**Issue**: Interactive elements not keyboard accessible.

**Fix**: Ensure all interactive elements can be focused and activated via keyboard:
```jsx
<button onClick={handleClick}>Click Me</button>
// Not: <div onClick={handleClick}>Click Me</div>
```

### ARIA Attributes

**Issue**: Incorrect or missing ARIA attributes.

**Fix**: Use semantic HTML first, ARIA as enhancement:
```jsx
// Good
<button>Submit</button>

// If custom component needed
<div role="button" tabIndex={0} aria-label="Submit">Submit</div>
```

## Best Practices

1. **Run locally before committing** - Catch issues early
2. **Fix critical and serious violations immediately**
3. **Use semantic HTML** - Reduces need for ARIA
4. **Test with screen readers** - Automated tools catch ~30-40% of issues
5. **Review HTML reports** - Understand the context of violations

## Additional Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Axe Rules Documentation](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [MDN Accessibility Guide](https://developer.mozilla.org/en-US/docs/Web/Accessibility)

## Troubleshooting

### Scanner Times Out

If the scanner times out waiting for pages to load:

1. Increase timeout in `accessibility-scan.js`:
   ```javascript
   timeout: 60000  // Increase from 30000
   ```

2. Check that the frontend server is running on the correct port

### False Positives

If you encounter false positives:

1. Review the violation in the HTML report
2. Verify it's actually a false positive (consult WCAG guidelines)
3. If confirmed, consider adding an exception with documentation

### Server Not Starting

Ensure the frontend builds successfully:
```bash
cd frontend
npm run build
npm run start:test
```

Check that port 3000 is not already in use:
```bash
lsof -i :3000
```

## Contributing

When adding new pages:

1. Add the page to `PAGES_TO_SCAN` in `accessibility-scan.js`
2. Run the scanner locally to establish baseline
3. Fix any violations before committing
4. Update this README if needed

## Support

For questions or issues with the accessibility scanner:

1. Check this README first
2. Review the HTML report for specific guidance
3. Consult the [Axe documentation](https://www.deque.com/axe/)
4. Open an issue with the `accessibility` label
