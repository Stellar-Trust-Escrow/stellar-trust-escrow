# Contributing to Trustchain Escrow

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone git@github.com:<you>/trustchain-escrow.git`
3. Install dependencies: `npm install`
4. Copy env file: `cp backend/.env.example backend/.env`

## Branch Naming

| Type    | Pattern                     |
| ------- | --------------------------- |
| Feature | `feat/<short-description>`  |
| Bug fix | `fix/<short-description>`   |
| Docs    | `docs/<short-description>`  |
| Chore   | `chore/<short-description>` |

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(contracts): add milestone release support
fix(backend): correct cursor pagination on escrow list
docs(api): document webhook signature verification
```

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Link the relevant issue with `Closes #<number>`
- Ensure all CI checks pass before requesting review
- Add tests for any new behaviour

## Code Style

- **Backend**: ESLint + Prettier (runs on commit via lint-staged)
- **Frontend**: ESLint + Prettier
- **Contracts**: `cargo fmt` + `cargo clippy`

## Questions?

Open a discussion or an issue — we're happy to help.
