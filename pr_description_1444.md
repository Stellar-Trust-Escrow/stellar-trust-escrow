# Mobile-first redesign — 44px touch targets, swipe-to-action & bottom-sheet drawers

## Summary

The frontend had no mobile-first strategy: tap targets were smaller than 44px,
primary actions were buried in hover menus, and modals covered the whole screen
with hard-to-reach close buttons. This PR implements a mobile-first experience
that directly addresses those gaps:

1. **Responsive tokens** — added a mobile-first `screens` scale (`xs` 375px →
   `xl` 1280px) and a reusable `touch` size token (44px) in Tailwind.
2. **Thumb-friendly tap targets** — `CopyButton`, `FileDropZone` cancel button,
   and drop zone now enforce `min-h-touch` / `min-w-touch` (44px) and larger
   hit areas on touch.
3. **Swipe-to-action list items** — `EscrowListItem` lets users **swipe left →
   Dispute** and **swipe right → Release all** (when eligible). The card snaps
   back if the gesture is not completed, mirroring native mobile mail/reminder
   apps.
4. **Bottom-sheet drawers** — `BottomSheet` renders as a slide-up sheet with a
   drag handle and swipe-down-to-dismiss on mobile; `Modal` automatically swaps
   to it when `useIsMobile()` is true, so dispute/release dialogs no longer
   cover the full viewport with tiny close buttons.
5. **Native sharing** — `lib/share.js` wraps the Web Share API with a clipboard
   fallback; `EscrowDetail` now exposes a **Share** action that uses the OS
   share sheet on mobile.
6. **Responsive pages** — `EscrowDetail` gains a fixed bottom action bar (with
   padding compensation) and bottom-sheet modals; `CreateEscrowWizard` collapses
   its step indicator into a compact progress bar on small screens; the explorer
   and dashboard grids/lists use the new swipeable `EscrowListItem`; the dispute
   form now has a thumb-friendly file-upload drop zone with inline previews.

> **Repository note:** the issue referenced TypeScript paths
> (`src/hooks/useSwipeGesture.ts`, `src/components/ui/BottomSheet.tsx`,
> `src/components/escrow/EscrowListItem.tsx`, `src/lib/share.ts`). This repo's
> frontend is plain JSX/JS (no `tsconfig` / `src/` dir) and CI only builds
> `.jsx`/`.js`. To keep the CI build green, those modules were added as
> `frontend/hooks/useSwipeGesture.js`, `frontend/components/ui/BottomSheet.jsx`,
> `frontend/components/escrow/EscrowListItem.jsx`, and `frontend/lib/share.js`.
> The new unit test for the swipe hook follows the issue-requested path
> `frontend/tests/unit/useSwipeGesture.test.ts` but is written with
> `React.createElement` (no JSX) because `.ts` files are not JSX-compiled here.

Closes #1444

---

## Files changed

| File | Purpose |
| --- | --- |
| `frontend/tailwind.config.js` | Adds mobile-first `screens` breakpoints and a `touch` (44px) size token. |
| `frontend/hooks/useSwipeGesture.js` | Dependency-free pointer-events swipe hook (axis, threshold, snap-back). |
| `frontend/hooks/useMediaQuery.js` | `useMediaQuery` + `useIsMobile` helpers. |
| `frontend/lib/share.js` | `shareContent` (Web Share API) + `copyToClipboard` fallback. |
| `frontend/components/ui/BottomSheet.jsx` | Mobile slide-up bottom sheet with drag handle + swipe-down dismiss. |
| `frontend/components/ui/Modal.jsx` | Renders `BottomSheet` instead of a centered modal when on mobile. |
| `frontend/components/escrow/EscrowListItem.jsx` | Swipe-left→Dispute / swipe-right→Release-all wrapper around the card. |
| `frontend/components/escrow/EscrowCard.jsx` | Touch-target audit / `min-h-touch` sizing. |
| `frontend/components/escrow/DisputeModal.jsx` | Adds `FileDropZone` evidence upload + `evidence` state. |
| `frontend/components/ui/CopyButton.jsx` | Accepts `value`/`text`/`label`, visible label, default export, `min-h-touch`. |
| `frontend/components/ui/FileDropZone.jsx` | `min-h-[140px]` drop zone, `min-h-touch` cancel button, inline previews. |
| `frontend/components/ui/Toast.jsx` | Fix: add `export default Toast` (was a pre-existing named-export-only bug). |
| `frontend/app/escrow/[id]/page.jsx` | Responsive detail, Share button, fixed bottom action bar, bottom-sheet modals. |
| `frontend/app/escrow/create/page.jsx` | Step indicator collapses to a progress bar on mobile. |
| `frontend/app/explorer/page.jsx` | Uses `EscrowListItem` + conditionally-rendered `DisputeModal`. |
| `frontend/app/dashboard/page.jsx` | Uses `EscrowListItem` + conditionally-rendered `DisputeModal`. |
| `frontend/jest.setup.cjs` | Mocks `navigator.clipboard` for jsdom share/clipboard tests. |
| `frontend/tests/unit/useSwipeGesture.test.ts` | Unit tests for the swipe hook. |
| `frontend/tests/unit/share.test.ts` | Unit tests for `shareContent`/`copyToClipboard`. |
| `frontend/tests/unit/BottomSheet.test.tsx` | Unit tests for the bottom sheet. |
| `frontend/tests/components/escrow/EscrowListItem.test.jsx` | Tests for swipe actions / snap-back / release eligibility. |

---

## Acceptance criteria — how each is met

- ✅ **44px minimum tap targets on mobile.** `CopyButton` and `FileDropZone`
  cancel/drop-area use `min-h-touch`/`min-w-touch` (44px); drop zone is at least
  140px tall; `EscrowCard` actions use the touch token.
- ✅ **Swipe-to-action on escrow list items.** `EscrowListItem` supports
  swipe-left→Dispute and swipe-right→Release-all with snap-back under the
  40% threshold; unit tests assert both directions and the snap-back behaviour.
- ✅ **Bottom-sheet drawers instead of full-screen modals on mobile.** `Modal`
  swaps to `BottomSheet` via `useIsMobile()`; the sheet slides up, has a drag
  handle, and can be dismissed by swipe-down or backdrop tap.
- ✅ **Web Share API with clipboard fallback.** `lib/share.js` prefers
  `navigator.share`, falls back to `navigator.clipboard.writeText`;
  `EscrowDetail` exposes a Share action.
- ✅ **Responsive detail page with single-column layout + fixed bottom actions.**
  `EscrowDetail` uses a fixed bottom action bar on mobile (`pb-24 sm:pb-0` on the
  content) and bottom-sheet modals; the milestone timeline already stacks
  vertically on small screens.
- ✅ **Responsive create wizard.** The step `ol` is hidden on mobile and replaced
  by a compact progress bar (`Step X: Label`); on `sm+` the full step list shows.
- ✅ **Thumb-friendly dispute form upload.** `DisputeModal` now uses
  `FileDropZone` with a large drop area and inline file previews.
- ✅ **No breaking changes / no new dependencies.** `useSwipeGesture` and
  `BottomSheet` are dependency-free (pointer events + CSS transitions); no new
  npm packages were added, so CI install/build stay green.

---

## Local verification performed

- `npm run test:unit -w frontend` → **367 passed / 367 total**.
- `npm run test:a11y -w frontend` → **14 passed / 14 total**.
- `npm run test:integration -w frontend` → **92 passed**; the only failing
  suites are `dashboard` and `escrow-detail`, which are the **same two suites
  that already fail on `develop`** (pre-existing, unrelated to this change).
  This PR actually *reduced* total integration failures (the `CopyButton` /
  `Toast` export fixes resolved several previously-crashing tests).
- `npm run build -w frontend` → **builds successfully** (all 24 routes
  prerender/server-render). Note: the sandbox needed a `npm install --no-save
  @opentelemetry/core` (an optional transitive dep of `@sentry/nextjs`) and the
  standard `NEXT_PUBLIC_*` env vars to build locally; CI provides both.

Run it yourself:

```bash
npm run test:unit -w frontend -- frontend/tests/unit/useSwipeGesture.test.ts \
  frontend/tests/unit/share.test.ts frontend/tests/unit/BottomSheet.test.tsx \
  frontend/tests/components/escrow/EscrowListItem.test.jsx
npm run test:a11y -w frontend
npm run build -w frontend
```

---

## Notes / follow-ups

- The pre-existing `dashboard` / `escrow-detail` integration failures are not
  introduced by this PR (identical on a clean `develop` checkout). A follow-up
  could add the missing test providers/mocks for those two suites.
- The issue's TypeScript module paths were mapped to this repo's JSX/JS layout
  to preserve the CI build (see the repository note above). No `tsconfig` was
  added.

closes #1444
