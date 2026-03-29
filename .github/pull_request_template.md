---
name: Feature / Bugfix PR
about: Standard pull request template
---

## Description

Briefly describe what this PR does and why.

**Issue:** Closes #123

## Changes

### What
- List key changes bullet-point style
- Technical decisions made

### Why  
- Business/technical motivation
- Alternatives considered

## Tech Stack
- List main technologies/files changed

## Testing

### Local Testing
1. Clone this branch
2. Follow [CONTRIBUTING.md](docs/CONTRIBUTING.md) quickstart
3. Run `npm test`
4. Manual testing steps...

### Verification Checklist
- [ ] `npm run lint && npm run format` passes
- [ ] All tests pass (`npm test`)
- [ ] Docker builds (`docker compose up --build`)
- [ ] No breaking API changes (or documented in CHANGELOG.md)
- [ ] Updated relevant docs
- [ ] Screenshots/GIFs for UI changes

## Additional Context
- Deployment considerations
- Performance impact
- Security review needed?

