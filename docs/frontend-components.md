# Frontend Component Library

This document describes the shared frontend component library used by the Next.js app in `frontend/components/`.
It covers reusable UI primitives, the design token system, composition patterns, and how to create new components.

## What this covers

- Shared component categories in `frontend/components/`
- Reusable UI primitives and props
- Theme and design tokens in `frontend/styles/theme.css` and `frontend/tailwind.config.js`
- How to use CSS variables and Tailwind theme tokens in new components
- Composition patterns used across the app

---

## Design token system

### Theme CSS variables

The root theme is defined in `frontend/styles/theme.css`.
It exposes the current theme with `data-theme="dark"` or `data-theme="light"` and defines the following tokens:

- `--color-bg-base`
- `--color-bg-surface`
- `--color-bg-elevated`
- `--color-bg-overlay`
- `--color-border`
- `--color-border-subtle`
- `--color-text-primary`
- `--color-text-secondary`
- `--color-text-muted`
- `--color-brand`
- `--color-brand-hover`
- `--glass-bg`
- `--glass-border`

The app also defines legacy accent tokens in `frontend/app/globals.css`:

- `--color-accent`
- `--color-success`
- `--color-warning`
- `--color-danger`

These CSS variables are the primary design token API for colors and theme-aware styling.

### Tailwind theme extension

The Tailwind theme is extended in `frontend/tailwind.config.js` with:

- `colors.brand`: `50`, `500`, `600`, `900`
- `fontFamily.sans`: `var(--font-inter)`, `Inter`, `system-ui`
- `fontFamily.mono`: `var(--font-mono)`, `JetBrains Mono`, `Menlo`
- custom animations: `pulse-slow`, `fade-in`

Use Tailwind classes such as `bg-brand-500`, `text-brand-50`, `font-sans`, and `rounded-xl`.

### Spacing scale

The frontend uses Tailwind's built-in spacing scale in most components.
Common spacing tokens include:

- `p-2`, `p-4`, `p-6`
- `px-3`, `px-4`, `px-5`
- `py-1.5`, `py-2`, `py-2.5`
- `gap-2`, `gap-3`, `gap-4`
- `space-x-4`, `space-y-3`

If a new component needs a custom spacing token, prefer Tailwind utility classes rather than hard-coded pixel values.

### Typography scale

The app uses Tailwind typography utilities for type scale and weight.
Common tokens include:

- `text-xs`, `text-sm`, `text-base`, `text-lg`
- `font-medium`, `font-semibold`, `font-bold`
- `leading-none`, `leading-6`
- `text-gray-300`, `text-gray-400`, `text-white`

For body and heading font families, use `font-sans` and `font-mono`.

### Border radii

Common radius tokens are:

- `rounded` / `rounded-md`
- `rounded-lg`
- `rounded-xl`
- `rounded-2xl`
- `rounded-full`

These are used consistently for cards, buttons, modals, and inputs.

### Using CSS variables in new components

Use CSS variables when you want theme-aware color values and when a Tailwind utility class is not expressive enough.

Example:

```jsx
export default function TokenCard({ children }) {
  return (
    <div
      className="border rounded-2xl p-6"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        color: 'var(--color-text-primary)',
        borderColor: 'var(--color-border)',
      }}
    >
      {children}
    </div>
  );
}
```

You can also mix CSS variables with Tailwind utilities:

```jsx
<div className="rounded-2xl p-5 border" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>
  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Title</h2>
</div>
```

### Using Tailwind theme tokens in new components

Example:

```jsx
export default function BrandPanel({ title, description }) {
  return (
    <div className="rounded-2xl border border-brand-500/20 bg-brand-50 p-5">
      <h3 className="text-lg font-semibold text-brand-900">{title}</h3>
      <p className="text-sm text-brand-700">{description}</p>
    </div>
  );
}
```

---

## Component composition patterns

### `cn` utility

The app uses a lightweight helper in `frontend/lib/utils.js`:

```js
export function cn(...inputs) {
  return inputs.filter(Boolean).join(' ');
}
```

This helper is used to combine base class names with conditional and custom classes.

### `asChild` / Link wrapper pattern

Some components support `href` or `asChild` to render as a styled link or wrapper instead of a native button.
The `Button` component is the primary example:

- `href` renders a Next.js `Link` when the button is not disabled
- `asChild` wraps an arbitrary child element with button styles

### Provider + hook patterns

The app uses React providers and hooks for app-wide concerns:

- `frontend/contexts/ThemeContext.jsx` → `ThemeProvider` / `useTheme`
- `frontend/contexts/CurrencyContext.jsx` → `CurrencyProvider`
- `frontend/contexts/ToastContext.jsx` → `ToastProvider`

The root layout wraps the app in providers in `frontend/app/layout.jsx`.

### Shared shell patterns

Common composition patterns include:

- Layout components such as `Header`, `Footer`, `MobileDrawer`, `NavigationProgress`
- Domain-specific components that compose smaller UI primitives, e.g. `EscrowCard` and `MilestoneList`
- Overlay components that manage global interaction state, e.g. `Modal`, `OfflineBanner`, `Toast`
- Accessible wrappers such as `Tooltip` and `ErrorBoundary`

### Client components

Use `"use client"` only for components that need React state, hooks, event handlers, or browser-only APIs.
Many shared components in `frontend/components/ui/` are client components.

---

## Shared component reference

This section describes the main shared component families in `frontend/components/`.

### UI primitives (`frontend/components/ui/`)

#### `Button`

- File: `frontend/components/ui/Button.jsx`
- Props:
  - `variant`: `'primary' | 'secondary' | 'danger' | 'ghost'` (default: `primary`)
  - `size`: `'sm' | 'md' | 'lg'` (default: `md`)
  - `isLoading`: `boolean`
  - `disabled`: `boolean`
  - `href`: `string`
  - `asChild`: `boolean`
  - `className`: `string`
  - `onClick`: `function`
- Notes:
  - Renders a styled `<button>` by default.
  - When `href` is provided and the button is enabled, renders a Next.js `Link`.
  - When `asChild` is true, wraps the first child in styled markup.

Example:

```jsx
<Button variant="secondary" size="lg" onClick={handleSave}>
  Save draft
</Button>

<Button href="/escrow/create">Create escrow</Button>
```

#### `Badge`

- File: `frontend/components/ui/Badge.jsx`
- Props:
  - `status`: `string`
  - `variant`: `string`
  - `size`: `'sm' | 'md'` (default: `md`)
  - `children`: `React.ReactNode`
- Notes:
  - Supports escrow and milestone statuses such as `Active`, `Completed`, `Disputed`, `Cancelled`, `Pending`, `Submitted`, `Approved`, `Rejected`.
  - Also supports generic variants: `success`, `warning`, `danger`, `info`, and `default`.

Example:

```jsx
<Badge status="Active" />
<Badge variant="danger" size="sm">Blocked</Badge>
```

#### `Avatar`

- File: `frontend/components/ui/Avatar.jsx`
- Props:
  - `src`: `string`
  - `address`: `string`
  - `size`: `'sm' | 'md' | 'lg'` (default: `md`)
  - `className`: `string`
  - `alt`: `string`
- Notes:
  - Uses an initials fallback when the image fails to load.
  - Initials are derived from the Stellar wallet address.

Example:

```jsx
<Avatar src={profileImageUrl} address={walletAddress} size="lg" />
```

#### `Modal`

- File: `frontend/components/ui/Modal.jsx`
- Props:
  - `isOpen`: `boolean`
  - `onClose`: `function`
  - `title`: `string`
  - `children`: `React.ReactNode`
  - `size`: `'sm' | 'md' | 'lg'` (default: `md`)
  - `isConfirmation`: `boolean`
  - `onConfirm`: `function`
  - `confirmLabel`: `string` (default: `Confirm`)
  - `cancelLabel`: `string` (default: `Cancel`)
  - `confirmVariant`: `string` (default: `primary`)
- Notes:
  - Supports Escape key close and backdrop dismiss.
  - Prevents scrolling while open.

Example:

```jsx
<Modal isOpen={isOpen} onClose={close} title="Confirm cancellation" isConfirmation onConfirm={handleConfirm}>
  <p>Are you sure you want to cancel this escrow?</p>
</Modal>
```

#### `Tooltip`

- File: `frontend/components/ui/Tooltip.jsx`
- Props:
  - `children`: `React.ReactNode`
  - `content`: `string`
  - `position`: `'top' | 'bottom' | 'left' | 'right'` (default: `top`)
- Notes:
  - Displays on hover/focus.
  - Uses an accessible `role="tooltip"` container.

Example:

```jsx
<Tooltip content="Copy wallet address">
  <button>Copy</button>
</Tooltip>
```

#### `Spinner`

- File: `frontend/components/ui/Spinner.jsx`
- Props:
  - `size`: `'sm' | 'md' | 'lg'` (default: `md`)
  - `label`: `string` (default: `Loading…`)

Example:

```jsx
<Spinner size="sm" />
```

#### `Skeleton`

- File: `frontend/components/ui/Skeleton.jsx`
- Props:
  - `variant`: `'text' | 'heading' | 'card' | 'image' | 'line' | 'table'`
  - `className`: `string`
- Notes:
  - Used for loading placeholders.

Example:

```jsx
<Skeleton variant="heading" />
```

#### `EmptyState`

- File: `frontend/components/ui/EmptyState.jsx`
- Props:
  - `title`: `string`
  - `description`: `string`
  - `actionLabel`: `string`
  - `actionHref`: `string`
  - `onAction`: `function`
  - `className`: `string`
- Notes:
  - Renders a CTA as a link or button depending on props.

Example:

```jsx
<EmptyState
  title="No escrows yet"
  description="Create an escrow to start managing your milestones."
  actionLabel="Create escrow"
  actionHref="/escrow/create"
/>
```

#### `ErrorAlert`

- File: `frontend/components/ui/ErrorAlert.jsx`
- Props:
  - `message`: `string`
  - `onDismiss`: `function`
  - `title`: `string` (default: `Error`)

Example:

```jsx
<ErrorAlert message={errorText} onDismiss={() => setError(null)} />
```

#### `CopyButton`

- File: `frontend/components/ui/CopyButton.jsx`
- Props:
  - `text`: `string`
  - `label`: `string` (default: `Copy`)
  - `feedbackDuration`: `number` (default: `2000`)

Example:

```jsx
<CopyButton text={walletAddress} label="Copy address" />
```

#### `Toast`

- File: `frontend/components/ui/Toast.jsx`
- Props:
  - `message`: `string`
  - `type`: `'success' | 'error' | 'info'`
  - `onClose`: `function`
  - `duration`: `number` (default: `4000`)

Example:

```jsx
<Toast type="success" message="Escrow created" onClose={hideToast} />
```

#### `StellarAddressInput`

- File: `frontend/components/ui/StellarAddressInput.jsx`
- Props:
  - `value`: `string`
  - `onChange`: `function`
  - `label`: `string` (default: `Stellar Address`)
  - `placeholder`: `string`
  - `id`: `string`
  - `required`: `boolean`
- Notes:
  - Performs inline Stellar address validation.

Example:

```jsx
<StellarAddressInput value={address} onChange={setAddress} />
```

#### `CurrencySelector`

- File: `frontend/components/ui/CurrencySelector.jsx`
- Props:
  - `size`: `'sm' | 'md'` (default: `md`)
  - `className`: `string`
- Notes:
  - Reads and writes the selected currency via `CurrencyContext`.

Example:

```jsx
<CurrencySelector size="sm" />
```

#### `LazyComponent`

- File: `frontend/components/ui/LazyComponent.jsx`
- Props:
  - `children`: `React.ReactNode`
  - `fallback`: `React.ReactNode`
  - `rootMargin`: `string`
  - `className`: `string`
  - `minHeight`: `string`
- Notes:
  - Uses `IntersectionObserver` to lazy-mount children.

Example:

```jsx
<LazyComponent fallback={<Skeleton variant="card" />} minHeight="280px">
  <HeavyChart data={chartData} />
</LazyComponent>
```

### Layout and shell components (`frontend/components/layout/`)

- `Header.jsx` — app header with navigation and theme toggle
- `Footer.jsx` — site footer and legal links
- `MobileDrawer.jsx` — mobile navigation drawer
- `NavigationProgress.jsx` — page transition progress indicator
- `NetworkIndicator.jsx` — online/offline/network status marker
- `PageTransition.jsx` — animated page wrapper
- `ThemeToggle.jsx` — toggles dark/light theme via `useTheme`

Use these components as shared layout primitives rather than recreating fixed page chrome.

### Domain components

`frontend/components/escrow/`
- `EscrowCard.jsx`
- `MilestoneList.jsx`
- `MilestoneItem.jsx`
- `MilestonePlanner.jsx`
- `ProgressChart.jsx`
- `TransactionGraph.jsx`
- `TemplateSelector.jsx`
- `DisputeModal.jsx`
- `MilestoneGantt.jsx`
- `CancelEscrowModal.jsx`

`frontend/components/profile/`
- `ProfileForm.jsx`
- `WalletLedger.jsx`

`frontend/components/settings/`
- `DataExport.jsx`

`frontend/components/auth/`
- `BiometricAuth.jsx`
- `RouteGuard.jsx`
- `TokenRefreshManager.jsx`

`frontend/components/chat/`
- `DisputeChat.jsx`

`frontend/components/dispute/`
- `EvidenceUploader.jsx`
- `MultiUploader.jsx`

`frontend/components/governance/`
- `ParameterSimulator.jsx`

`frontend/components/explorer/`
- `SearchFilters.jsx`

`frontend/components/onboarding/`
- `DashboardTour.jsx`
- `ProductTour.jsx`

`frontend/components/error/`
- `ErrorBoundary.jsx`

`frontend/components/providers/`
- `ThemeProvider.jsx`

These domain components often compose UI primitives from `frontend/components/ui/`.
Use them as examples when building new feature-specific components.

### Utility components in `frontend/components/ui/`

These helpers are reusable across pages and should be preferred over one-off equivalents.

- `Avatar.jsx`
- `BackToTop.jsx`
- `Badge.jsx`
- `Button.jsx`
- `CardSkeleton.jsx`
- `CopyButton.jsx`
- `CurrencyAmount.jsx`
- `CurrencyConverter.jsx`
- `CurrencySelector.jsx`
- `CurrencySwapper.jsx`
- `DataTableSkeleton.jsx`
- `EmptyState.jsx`
- `ErrorAlert.jsx`
- `ErrorBoundary.jsx`
- `EscrowCardSkeleton.jsx`
- `FileDropZone.jsx`
- `GasEstimator.jsx`
- `LanguageSwitcher.jsx`
- `LazyComponent.jsx`
- `Modal.jsx`
- `OfflineBanner.jsx`
- `OfflineIndicator.jsx`
- `OptimizedImage.jsx`
- `PageSkeleton.jsx`
- `PerformanceMonitor.jsx`
- `PriceConverter.jsx`
- `Progress.jsx`
- `ReputationBadge.jsx`
- `RetryButton.jsx`
- `ServiceWorkerRegistrar.jsx`
- `Skeleton.jsx`
- `Spinner.jsx`
- `StatCard.jsx`
- `StellarAddressInput.jsx`
- `Toast.jsx`
- `Tooltip.jsx`
- `TransactionHash.jsx`
- `TruncatedAddress.jsx`
- `WalletStatus.jsx`
- `XLMAmountInput.jsx`

---

## How to add a new shared component

1. Add the file to `frontend/components/ui/` if it is a reusable UI primitive, or to a feature-specific folder otherwise.
2. Prefer Tailwind utilities for layout and spacing.
3. Use CSS variables from `frontend/styles/theme.css` for theme-aware colors.
4. Export a default React component and document props in JSDoc.
5. Add a Storybook story or a small example if the component is reusable.
6. Reuse existing components where possible instead of adding new one-off markup.

### New component pattern example

```jsx
import { cn } from '../../lib/utils';

export default function StatusPanel({ title, description, className }) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-6',
        'bg-[var(--color-bg-surface)] border-[var(--color-border)]',
        className,
      )}
    >
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{description}</p>
    </div>
  );
}
```

### Prefer composition over duplication

- Use `Button` instead of creating custom action buttons.
- Use `Badge` for status labels instead of rendering raw pills.
- Use `Modal` for overlay dialogs instead of building a custom portal.
- Use `Skeleton` and `PageSkeleton` for loading states.

---

## Theme provider and app integration

The app root wraps pages with `ThemeProvider` in `frontend/app/layout.jsx`.
The provider sets `localStorage` theme state and toggles the `dark` class on `<html>`.

`ThemeToggle` in the header toggles between dark and light mode.

If you need a theme-aware component, prefer `useTheme()` from `frontend/contexts/ThemeContext.jsx`.

---

## Storybook and visual discovery

UI component stories exist under `frontend/components/ui/*.stories.jsx`.
Use them to explore reusable component variants and verify visual behavior before adding new styles.

---

## Notes

- The current design token implementation is hybrid: CSS custom properties for core colors and Tailwind for spacing, typography, and brand palette.
- When adding new tokens, keep them in `frontend/styles/theme.css` and use meaningful names like `--color-success` or `--color-bg-surface`.
- Avoid new one-off color utilities; prefer theme tokens and Tailwind semantic classes.
