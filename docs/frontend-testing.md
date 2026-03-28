# Frontend Testing Strategy

The frontend test pyramid is split into four layers so regressions are caught at the cheapest level possible:

- Unit tests cover isolated UI components, hooks, and utility modules with Jest + Testing Library.
- Integration tests cover page-level flows and state transitions with mocked network responses.
- Accessibility tests run `jest-axe` against reusable UI patterns.
- End-to-end tests use Playwright for navigation, visual regression, and performance smoke checks.

## Commands

```bash
cd frontend
npm run test:unit
npm run test:integration
npm run test:a11y
npm run test:coverage
npm run test:e2e
npm run test:visual:update
npm run test:perf
```

## Coverage Goals

- Statements: 60%
- Lines: 60%
- Functions: 60%
- Branches: 50%

## CI Expectations

- Every pull request runs frontend lint, build, unit, integration, a11y, and coverage checks.
- Playwright runs smoke, visual, and performance tests on Node 20 with browser artifacts uploaded on failure.
- Visual baselines live beside the Playwright specs so regressions show up in code review.
