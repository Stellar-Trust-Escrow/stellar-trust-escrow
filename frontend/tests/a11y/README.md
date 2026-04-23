# Accessibility Testing (a11y)

This directory contains automated accessibility tests using aXe (jest-axe) to ensure WCAG compliance.

## Overview

Automated accessibility testing catches regressions and ensures ongoing compliance with WCAG standards.

## Required Features

- ✅ aXe integration
- ✅ CI runs accessibility
- ✅ Validates WCAG
- ✅ Reports issues
- ✅ Fixes tracked (this file)

## Running Tests

```bash
# Run all accessibility tests
npm run test:a11y -w frontend

# Run with coverage
npm run test:a11y -w frontend -- --coverage
```

## CI Integration

Accessibility tests run automatically in CI on every push to `main` and `develop` branches, as well as on PRs.

See: `.github/workflows/ci.yml` - `accessibility` job

## WCAG Standards Tested

- WCAG 2.1 Level A
- WCAG 2.1 Level AA
- Best practices

## Test Categories

1. **UI Components** - Button, Badge, Modal, Spinner, StatCard
2. **Page Structure** - Home page, forms, navigation
3. **ARIA Implementation** - Proper use of ARIA attributes

## Known Issues

<!-- Track accessibility issues here for tracking fixes -->

| Issue ID | Description              | Component | Status |
| -------- | ------------------------ | --------- | ------ |
|          | (No issues detected yet) |           |        |

## Fixes Tracked

| Fix Date | Issue          | Resolution |
| -------- | -------------- | ---------- |
|          | (No fixes yet) |            |

## Adding New Tests

1. Import `axe` from jest-axe
2. Use `expect.extend(toHaveNoViolations)`
3. Run `await axe(container)` on rendered components

Example:

```javascript
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

it('should not have accessibility violations', async () => {
  const { container } = render(<MyComponent />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

## Configuration

See `axe-config.js` for aXe configuration including:

- WCAG version
- Standards to test
- Rules to run
- Rules to ignore
