# Add Lighthouse CI performance gate, image optimization & below-fold code-splitting

Closes #1439

## Summary

The frontend had no automated performance budget and shipped several
unoptimized assets and eagerly-loaded heavy dependencies. This PR adds a
Lighthouse CI gate that enforces Core Web Vitals budgets on the key routes,
migrates every raw `<img>` to `next/image`, enables AVIF/WebP + IPFS remote
optimization, and code-splits the heaviest below-fold chunks (recharts and the
i18n locale bundles) so they no longer weigh down first load.

## What changed

### Lighthouse CI budgets (`.lighthouserc.cjs`)

- Collects **3 runs** each for `/`, `/dashboard`, and `/escrow/create`
  (the real create route — the tracking issue's `/escrows/new` does not exist).
- Fails the build when any budget regresses:
  - `categories:performance` >= **0.85**
  - `largest-contentful-paint` <= **3500 ms**
  - `cumulative-layout-shift` <= **0.1**
  - `total-blocking-time` <= **300 ms**
  - `uses-optimized-images` (**error**)
- Uses `.cjs` because both root and `frontend` `package.json` are ESM
  (`"type": "module"`), so a `module.exports` config must be CommonJS.
- `@lhci/cli` added to `frontend` devDependencies; **both** `package-lock.json`
  files regenerated to stay consistent with CI's `npm ci`.

### CI workflow (`.github/lighthouse.workflow.yml.example`)

- Runs on PRs touching `frontend/**` or `.lighthouserc.cjs`: installs deps,
  builds the frontend, then runs `lhci autorun` against the budgets above.

> **Enabling the workflow:** committed as
> `.github/lighthouse.workflow.yml.example` because the automation token used to
> open this PR lacks the GitHub `workflow` scope required to push files under
> `.github/workflows/`. A maintainer should place it via:
> `cp .github/lighthouse.workflow.yml.example .github/workflows/lighthouse.yml`
> (its contents are already correct and complete).

### Image optimization (`next/image`)

- Added IPFS/gateway `remotePatterns` (`ipfs.io`, `dweb.link`,
  `cloudflare-ipfs.com`, `gateway.pinata.cloud`, `*.ipfs.dweb.link`) to
  `next.config.js`. AVIF/WebP `formats` were already configured.
- Replaced all **6** remaining raw `<img>` tags with `next/image`:
  - `components/ui/Avatar.jsx` — sized `Image` (width/height per size token).
  - `components/profile/ProfileForm.jsx` — `fill` inside the avatar container.
  - `components/dispute/EvidenceViewer.tsx`,
    `components/dispute/EvidenceUploader.jsx`,
    `app/arbitrator/workspace/[id]/page.jsx`,
    `app/arbitrator/workspace/[id]/split/page.jsx` — `fill` previews. These
    render arbitrary remote / blob object-URL uploads, so they use
    `unoptimized` (the optimizer can't process blob/data URLs) while still
    eliminating the raw `<img>` element and its layout-shift risk.
- `EvidenceUploader` imports `Image` from `lucide-react`, so `next/image` is
  aliased as `NextImage` there to avoid a name clash.

### Below-fold code-splitting

- **recharts** — `app/governance/proposals/[id]/page.jsx` imported the whole
  recharts barrel at module scope. Extracted the pie chart into
  `components/governance/VoteDistributionChart.jsx` and loaded it with
  `next/dynamic` (`ssr: false`, `Skeleton` fallback). This route's First Load JS
  drops from ~499 kB to ~286 kB. (The dashboard already lazy-loads its charts.)
- **i18n locales** — `i18n/index.jsx` statically imported all 6 locale JSON
  files. Now only the default (`en`) is bundled up-front; the other 5 locales
  are code-split into their own chunks and fetched on demand when the user
  switches language.

## Acceptance criteria

- [x] Lighthouse CI config enforces performance >= 0.85 and Core Web Vitals
      budgets (LCP/CLS/TBT) plus `uses-optimized-images`, across `/`,
      `/dashboard`, `/escrow/create`, 3 runs each.
- [x] Zero raw `<img>` remain in `app/` and `components/` (verified via grep).
- [x] Image optimization enabled (AVIF/WebP + IPFS remote patterns).
- [x] Heaviest below-fold deps (recharts, non-default locales) are lazy-loaded.
- [x] `npm run build` exits 0; `npm run lint` exits 0 (0 errors).

## How to verify locally

```bash
# Production build (must exit 0; note reduced First Load JS on the
# governance proposal route)
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run build -w frontend

# No raw <img> elements remain
grep -rn "<img" frontend/app frontend/components | grep -v "OptimizedImage\|__mocks__"

# Lint (0 errors)
npm run lint -w frontend

# Run the performance gate against the budgets
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run build -w frontend
./frontend/node_modules/.bin/lhci autorun --config=.lighthouserc.cjs
```

closes #1439
