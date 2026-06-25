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

| Issue ID | Description | Component | Status |
| -------- | ----------- | --------- | ------ |
| A11Y-001 | Missing `htmlFor` on admin API key input | `app/admin/page.jsx` | Fixed |
| A11Y-002 | Missing `id`/`htmlFor` on ResolveModal inputs | `app/admin/disputes/page.jsx` | Fixed |
| A11Y-003 | Textarea in ResolveModal had no label | `app/admin/disputes/page.jsx` | Fixed |
| A11Y-004 | Modal overlay missing `role="dialog"` and `aria-modal` | `app/admin/disputes/page.jsx` | Fixed |
| A11Y-005 | Filter tab buttons missing `type` and `aria-pressed` | `app/admin/disputes/page.jsx` | Fixed |
| A11Y-006 | Pagination missing `<nav>` wrapper and `aria-label` | `app/admin/disputes/page.jsx` | Fixed |
| A11Y-007 | Page number live region not announced to screen readers | `app/admin/disputes/page.jsx` | Fixed |
| A11Y-008 | Toast notification missing `role="status"` | `app/admin/disputes/page.jsx` | Fixed |
| A11Y-009 | Error message missing `role="alert"` | `app/admin/disputes/page.jsx` | Fixed |
| A11Y-010 | Dispute reason textarea missing `id`/`htmlFor` | `components/escrow/DisputeModal.jsx` | Fixed |
| A11Y-011 | Explorer search input missing `<label>` | `app/explorer/page.jsx` | Fixed |
| A11Y-012 | Filter toggle button missing `aria-expanded` | `app/explorer/page.jsx` | Fixed |
| A11Y-013 | Explorer pagination missing `<nav>` and `aria-label` | `app/explorer/page.jsx` | Fixed |

## Fixes Tracked

| Fix Date   | Issue       | Resolution |
| ---------- | ----------- | ---------- |
| 2026-06-25 | A11Y-001–013 | Added ARIA roles, labels, live regions, and dialog semantics across admin, dispute, and explorer pages. Added jest-axe unit tests for DisputeTermsDiff and extended ARIA pattern tests in accessibility.test.js. |

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
