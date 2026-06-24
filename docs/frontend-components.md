# Frontend Component Library & Design Tokens

## Overview

The StellarTrustEscrow frontend uses a reusable component system built with React, Next.js 15 (App Router), and Tailwind CSS. This guide documents every shared component, design token, and the composition pattern used across the codebase.

**Location:** `frontend/components/ui/`  
**Design System:** Tailwind CSS + CSS variables  
**Component Convention:** PascalCase, one component per file, JSDoc props documentation

---

## Design Tokens

### Color Palette

CSS variables are defined in `app/globals.css` and extended via `tailwind.config.js`.

#### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-accent` | `#6366f1` (indigo-500) | Primary interactive elements, focus states |
| `--color-success` | `#10b981` (emerald-500) | Active/completed status, positive actions |
| `--color-warning` | `#f59e0b` (amber-500) | Pending/processing states, warnings |
| `--color-danger` | `#ef4444` (red-500) | Errors, disputes, destructive actions |

#### Dark Mode Support

All components inherit dark mode from Tailwind's `dark:` variant system. The theme uses:
- Light: `bg-white`, `text-gray-900`
- Dark: `bg-gray-950`, `text-gray-100`

### Spacing Scale

Follows Tailwind's default spacing (4px unit):

| Scale | Size | Usage |
|-------|------|-------|
| `gap-1` | 4px | Inline icon spacing, tight layouts |
| `gap-2` | 8px | Button content, compact card spacing |
| `gap-3` | 12px | Form field vertical spacing |
| `gap-4` | 16px | Section padding, default card padding |
| `gap-6` | 24px | Large section separation, modal padding |

**Consistency Rule:** Always use Tailwind spacing utilities (`gap-*`, `p-*`, `m-*`), never hardcoded pixel values.

### Typography Scale

Fonts configured in `tailwind.config.js`:

| Family | Font Stack | Usage |
|--------|-----------|-------|
| `font-sans` | Inter, system-ui, sans-serif | All body text |
| `font-mono` | JetBrains Mono, Menlo, monospace | Code, Stellar addresses, transaction hashes |

#### Font Sizes

| Size | Class | Usage |
|------|-------|-------|
| `text-xs` | 12px | Badge labels, small metadata |
| `text-sm` | 14px | Form labels, small text |
| `text-base` | 16px | Body text, button labels |
| `text-lg` | 18px | Card headings |
| `text-2xl` | 24px | Page titles |

### Border Radius

| Scale | Size | Usage |
|-------|------|-------|
| `rounded-lg` | 8px | Buttons, form inputs, small components |
| `rounded-xl` | 12px | Cards, modals |
| `rounded-2xl` | 16px | Large modal panels |
| `rounded-full` | 9999px | Pills, badges, avatars |

### Animations

| Animation | Duration | Keyframes | Usage |
|-----------|----------|-----------|-------|
| `animate-spin` | Default | CSS `spin` | Loading spinners |
| `animate-pulse-slow` | 3s | `pulse` | Subtle background animations |
| `fade-in` | 0.25s | Opacity + translateY(6px) | Page transitions |
| `progress` | Custom | Width 0% → 100% | Progress bars |

---

## Core Components

### Button

**File:** `components/ui/Button.jsx`

Versatile button with multiple variants and sizes. Renders as `<Link>` when `href` is provided.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | ReactNode | — | Button label or icon content |
| `variant` | `'primary'\|'secondary'\|'danger'\|'ghost'` | `'primary'` | Visual style variant |
| `size` | `'sm'\|'md'\|'lg'` | `'md'` | Button dimensions (padding, text size) |
| `isLoading` | boolean | `false` | Shows spinner, disables interaction |
| `disabled` | boolean | `false` | Disabled state (also set by `isLoading`) |
| `href` | string | — | Renders as Next.js `<Link>` when set |
| `asChild` | boolean | `false` | Wraps arbitrary child with button styles (for custom link components) |
| `className` | string | — | Additional Tailwind classes |
| `onClick` | function | — | Click handler |

#### Variants

- **primary:** Indigo background, white text (default interactive element)
- **secondary:** Dark gray background, gray text (secondary action)
- **danger:** Red with transparency, red text (destructive actions)
- **ghost:** Transparent background, gray text (de-emphasized actions)

#### Usage Examples

```jsx
// Basic button
<Button onClick={handleSubmit}>Create Escrow</Button>

// Loading state
<Button isLoading variant="primary">Approving...</Button>

// As a link
<Button href="/escrows/123" variant="secondary">View Details</Button>

// Danger action
<Button variant="danger" onClick={handleDelete}>Cancel Escrow</Button>

// Small button
<Button size="sm" variant="ghost">Close</Button>
```

---

### Badge

**File:** `components/ui/Badge.jsx`

Status indicator pill for escrow states, milestone statuses, reputation tiers, and KYC stages.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `status` | string | — | Status value (e.g., 'Active', 'Completed', 'TRUSTED', 'Processing') |
| `variant` | string | — | Alias for status when children override label |
| `size` | `'sm'\|'md'` | `'md'` | Badge dimensions |
| `children` | ReactNode | — | Custom label (overrides auto-generated status label) |

#### Status Mappings

**Escrow Statuses:**
- `Active` → Green (🔒)
- `Completed` → Blue (✅)
- `Disputed` → Red (⚠️)
- `Cancelled` → Gray (✕)

**Milestone Statuses:**
- `Pending` → Gray (○)
- `Submitted` → Blue (📤)
- `Approved` → Green (✓)
- `Rejected` → Red (✗)

**Reputation Tiers:**
- `NEW` → Gray
- `TRUSTED` → Blue (🔵)
- `VERIFIED` → Indigo (💜)
- `EXPERT` → Purple (⭐)
- `ELITE` → Amber (🏆)

**KYC Statuses:**
- `Init` → Blue (🔄)
- `Processing` → Amber (⏳)
- `Declined` → Red (❌)

#### Usage Examples

```jsx
// Automatic status styling
<Badge status="Active" />

// With custom label
<Badge status="Completed">Paid Out</Badge>

// Reputation badge
<Badge status="VERIFIED" />

// Generic variant
<Badge variant="success">Verified</Badge>
```

---

### Modal

**File:** `components/ui/Modal.jsx`

Accessible overlay modal with backdrop dismiss and Escape key support.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | boolean | — | Controls visibility |
| `onClose` | function | — | Called when backdrop or Escape is pressed |
| `title` | string | — | Modal heading (linked to dialog aria-labelledby) |
| `children` | ReactNode | — | Modal content |
| `size` | `'sm'\|'md'\|'lg'` | `'md'` | Modal width (max-w-sm, max-w-md, max-w-2xl) |
| `isConfirmation` | boolean | `false` | Shows confirm/cancel buttons |
| `onConfirm` | function | — | Called when confirm button clicked (when `isConfirmation=true`) |
| `confirmLabel` | string | `'Confirm'` | Confirm button text |
| `cancelLabel` | string | `'Cancel'` | Cancel button text |
| `confirmVariant` | string | `'primary'` | Confirm button variant (passed to `<Button>`) |

#### Features

- ✅ Accessible: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- ✅ Closes on Escape key or backdrop click
- ✅ Prevents body scroll while open
- ✅ Focus management (TODO: add focus trap)
- ⏳ Animation (TODO: add enter/exit scale+fade)

#### Usage Examples

```jsx
const [isOpen, setIsOpen] = useState(false);

// Content modal
<Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Dispute Details">
  <p>Reason: {dispute.reason}</p>
</Modal>

// Confirmation modal
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Confirm Cancellation"
  isConfirmation
  onConfirm={handleConfirm}
  confirmLabel="Cancel Escrow"
  confirmVariant="danger"
>
  <p>This action cannot be undone.</p>
</Modal>
```

---

### Spinner

**File:** `components/ui/Spinner.jsx`

Animated loading indicator (inline SVG).

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | string | `'w-4 h-4'` | Tailwind width/height classes |
| `className` | string | — | Additional Tailwind classes |

#### Usage Examples

```jsx
// Default spinner
<Spinner />

// Large spinner
<Spinner size="w-8 h-8" />

// Custom color
<Spinner className="text-green-500" />

// In button (handled by Button component)
<Button isLoading>Processing...</Button>
```

---

### Toast

**File:** `components/ui/Toast.jsx`

Non-blocking notification overlay (typically managed by a toast context).

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `message` | string | — | Toast text content |
| `type` | `'info'\|'success'\|'warning'\|'error'` | `'info'` | Notification type |
| `duration` | number | 3000 | Auto-dismiss timeout (ms), set to 0 for persistent |
| `action` | object | — | Optional action button: `{ label: string, onClick: function }` |
| `onClose` | function | — | Called when dismissed |

#### Usage Examples

```jsx
// Info toast
<Toast message="Profile updated" type="success" />

// With action
<Toast
  message="Upload failed"
  type="error"
  action={{ label: 'Retry', onClick: retry }}
/>
```

---

### StatCard

**File:** `components/ui/StatCard.jsx`

Dashboard metric display card.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | string | — | Metric label/title |
| `value` | string\|number | — | Primary metric value |
| `subtext` | string | — | Optional secondary text (e.g., "vs last week") |
| `icon` | ReactNode | — | Optional icon (Lucide React icon) |
| `trend` | `'up'\|'down'\|null` | null | Trend indicator |
| `className` | string | — | Additional Tailwind classes |

#### Usage Examples

```jsx
<StatCard
  label="Active Escrows"
  value={42}
  subtext="+5 this week"
  icon={<Lock />}
  trend="up"
/>
```

---

### Avatar

**File:** `components/ui/Avatar.jsx`

User profile image with fallback initials.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | string | — | Image URL |
| `alt` | string | — | Image alt text |
| `name` | string | — | User name (used for initials fallback) |
| `size` | `'sm'\|'md'\|'lg'` | `'md'` | Avatar dimensions |
| `className` | string | — | Additional Tailwind classes |

#### Usage Examples

```jsx
<Avatar src={user.avatar} alt={user.name} name={user.name} />
<Avatar name="Alice Johnson" size="lg" />
```

---

### CurrencyAmount

**File:** `components/ui/CurrencyAmount.jsx`

Displays XLM amounts with proper formatting and symbol.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `amount` | number\|string | — | Amount in stroops (smallest unit) |
| `showSymbol` | boolean | `true` | Show "XLM" symbol |
| `decimals` | number | 7 | Decimal places to display |
| `className` | string | — | Additional Tailwind classes |

#### Usage Examples

```jsx
<CurrencyAmount amount={1000000000} />  {/* 10.0 XLM */}
<CurrencyAmount amount={5500000} decimals={2} />  {/* 55.00 XLM */}
```

---

### StellarAddressInput

**File:** `components/ui/StellarAddressInput.jsx`

Validated Stellar address input with error handling.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | string | — | Current address |
| `onChange` | function | — | Called with validated address |
| `onError` | function | — | Called with error message if invalid |
| `placeholder` | string | — | Input placeholder |
| `required` | boolean | false | Validation requirement |
| `disabled` | boolean | false | Disabled state |

#### Validation

- ✅ Stellar address format: 56 alphanumeric chars starting with 'G'
- ✅ Real-time validation feedback
- ✅ Optional QR code scanner (TODO)

#### Usage Examples

```jsx
<StellarAddressInput
  value={address}
  onChange={setAddress}
  onError={setError}
  placeholder="Recipient address"
  required
/>
```

---

### ErrorBoundary

**File:** `components/ui/ErrorBoundary.jsx`

React error boundary that catches rendering errors and displays fallback UI.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | ReactNode | — | Child components |
| `fallback` | ReactNode | — | Fallback UI on error (default: generic error message) |
| `onError` | function | — | Called with error and error info |
| `isolate` | boolean | true | Isolate error to this boundary (don't propagate) |

#### Usage Examples

```jsx
<ErrorBoundary fallback={<div>Something went wrong</div>}>
  <ComplexComponent />
</ErrorBoundary>

// Page-level error boundary
<ErrorBoundary onError={(err) => logError(err)}>
  <App />
</ErrorBoundary>
```

---

### TransactionHash

**File:** `components/ui/TransactionHash.jsx`

Displays truncated Stellar transaction hash with copy button and Horizon link.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `hash` | string | — | Transaction hash (56 chars) |
| `network` | `'public'\|'testnet'` | `'public'` | Stellar network for Horizon link |
| `showCopy` | boolean | `true` | Show copy-to-clipboard button |
| `truncate` | number | 8 | Characters to show per side |

#### Usage Examples

```jsx
<TransactionHash hash="abc...xyz" />
<TransactionHash hash={tx.id} network="testnet" />
```

---

### TruncatedAddress

**File:** `components/ui/TruncatedAddress.jsx`

Displays shortened Stellar address with copy button.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `address` | string | — | Stellar public key |
| `chars` | number | 8 | Characters to show per side |
| `showCopy` | boolean | `true` | Show copy button |
| `showExplorer` | boolean | `true` | Show Stellar Expert link |

#### Usage Examples

```jsx
<TruncatedAddress address={user.publicKey} />
<TruncatedAddress address={address} chars={6} />
```

---

### Skeleton Loaders

**Files:**
- `CardSkeleton.jsx` — Placeholder for card-sized content
- `DataTableSkeleton.jsx` — Placeholder for table content
- `EscrowCardSkeleton.jsx` — Placeholder for escrow card
- `PageSkeleton.jsx` — Full-page loading state
- `Skeleton.jsx` — Generic rectangle skeleton

All skeletons use `animate-pulse` for smooth pulsing effect.

#### Usage Example

```jsx
{isLoading ? (
  <CardSkeleton />
) : (
  <Card>{content}</Card>
)}
```

---

## Component Composition Pattern

### File Structure

Each component follows this pattern:

```
components/
├── ui/
│   ├── Button.jsx          # Self-contained component
│   ├── Button.stories.jsx  # Storybook file (optional)
│   ├── Modal.jsx
│   ├── ...
├── dashboard/             # Feature-specific components
│   ├── StatDashboard.jsx
│   └── DashboardCard.jsx
├── escrow/                # Domain-specific components
│   ├── EscrowCard.jsx
│   └── MilestoneTimeline.jsx
└── layout/                # Layout components
    ├── Header.jsx
    └── Sidebar.jsx
```

### Naming Convention

- **UI Components** (reusable): `Button.jsx`, `Modal.jsx` (reusable across features)
- **Feature Components** (domain-specific): `EscrowCard.jsx`, `DisputeForm.jsx` (tied to a specific feature)
- **Page Components** (route-level): In `app/*/page.jsx` (file-based routing)

### Component Template

```jsx
/**
 * ComponentName — brief description
 *
 * Detailed explanation of purpose, when to use, and key features.
 *
 * TODO (contributor — difficulty, Issue #123): feature to add
 */

'use client'; // if interactive

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

/**
 * @param {object} props
 * @param {string} [props.prop1] — description
 * @param {function} [props.callback] — description
 */
export default function ComponentName({ prop1, callback, className }) {
  // Implementation
  return (
    <div className={cn('base-styles', className)}>
      {/* Content */}
    </div>
  );
}
```

### Best Practices

1. **Use `cn()` for className merging** — Always import and use `lib/utils.js` `cn()` to safely merge base classes with overrides:
   ```jsx
   className={cn('base-class', disabled && 'opacity-50', className)}
   ```

2. **Prefer Tailwind utilities over inline styles** — Never use `style={}` for spacing, colors, or sizing.

3. **Accessibility first** — All interactive components must include ARIA attributes:
   - Buttons: `role="button"`, `aria-label` if no text
   - Forms: `<label htmlFor>`, `aria-describedby`, `aria-required`
   - Dialogs: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`

4. **Document with JSDoc** — Every component export must have prop documentation.

5. **Use 'use client' sparingly** — Add `'use client'` only when using interactive React features (hooks, events).

6. **Avoid prop drilling** — Use React Context for deeply nested data (auth, theme, user profile).

---

## Using Design Tokens in New Components

### Method 1: Tailwind Classes (Preferred)

```jsx
// Good: use Tailwind utilities
<div className="bg-indigo-600 text-white p-4 rounded-lg">
  <h2 className="text-xl font-semibold">Title</h2>
</div>
```

### Method 2: CSS Variables

```jsx
// Less common but acceptable for semantic naming
<div style={{
  backgroundColor: 'var(--color-accent)',
  padding: 'var(--spacing-4)',
}}>
  {/* Content */}
</div>
```

### Color Usage Guide

| Scenario | Token | Tailwind | Hex |
|----------|-------|----------|-----|
| Primary button, focus ring | `--color-accent` | `indigo-600` | #4f46e5 |
| Success/positive state | `--color-success` | `emerald-500` | #10b981 |
| Warning/pending state | `--color-warning` | `amber-500` | #f59e0b |
| Error/destructive action | `--color-danger` | `red-500` | #ef4444 |

### Spacing Usage Guide

```jsx
// Always use Tailwind spacing utilities:
<div className="p-4 gap-3 mb-6">
  {/* Padding: 16px, gaps: 12px, margin-bottom: 24px */}
</div>

// Never hardcode:
<div style={{ padding: '16px', gap: '12px' }}>  {/* ❌ Wrong */}
</div>
```

---

## Storybook

Storybook is set up for component development and documentation.

### Run Storybook

```bash
cd frontend
npm run storybook
# Opens http://localhost:6006
```

### Build Storybook

```bash
npm run build-storybook
```

### Story File Format

Create a `.stories.jsx` file alongside your component:

```jsx
import Button from './Button';

export default {
  title: 'ui/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    variant: {
      options: ['primary', 'secondary', 'danger', 'ghost'],
      control: { type: 'select' },
    },
    size: {
      options: ['sm', 'md', 'lg'],
      control: { type: 'select' },
    },
    isLoading: { control: 'boolean' },
  },
};

export const Primary = {
  args: { children: 'Click me', variant: 'primary' },
};

export const Loading = {
  args: { children: 'Loading...', isLoading: true },
};
```

---

## Accessibility Checklist

When creating or modifying components, ensure:

- ✅ **Semantic HTML**: Use correct elements (`<button>` not `<div role="button">`)
- ✅ **ARIA attributes**: `role`, `aria-label`, `aria-describedby`, `aria-expanded`
- ✅ **Keyboard support**: Tab order, Enter/Space activation, Escape to close
- ✅ **Focus indicators**: High-contrast outline (Tailwind `ring-2 ring-indigo-500`)
- ✅ **Color contrast**: Text on background meets WCAG AA (4.5:1 for body text)
- ✅ **Label associations**: `<label htmlFor>` for form inputs
- ✅ **Focus management**: Trap focus in modals, return focus when closed
- ✅ **Screen reader testing**: Test with NVDA (Windows) or VoiceOver (Mac)

### Run Accessibility Scan

```bash
npm run test:a11y
npm run test:a11y:scan  # generates detailed report
```

---

## Common Patterns

### Form Input Group

```jsx
<div className="space-y-2">
  <label htmlFor="email" className="text-sm font-medium">Email Address</label>
  <input
    id="email"
    type="email"
    className="w-full px-3 py-2 border rounded-lg"
    required
  />
  {error && <p className="text-sm text-red-500">{error}</p>}
</div>
```

### Card with Header

```jsx
<div className="card">
  <div className="border-b border-gray-700 pb-4 mb-4">
    <h3 className="text-lg font-semibold">Header</h3>
  </div>
  {/* Card body */}
</div>
```

### Responsive Grid

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

### Loading State

```jsx
{isLoading ? (
  <CardSkeleton count={3} />
) : error ? (
  <ErrorAlert message={error} onRetry={refetch} />
) : data?.length ? (
  <div>{/* Content */}</div>
) : (
  <EmptyState message="No items found" />
)}
```

---

## Testing Components

### Unit Tests

```javascript
// Button.test.js
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button';

describe('Button', () => {
  it('renders with label', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('calls onClick when clicked', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  it('shows loading spinner when isLoading is true', () => {
    render(<Button isLoading>Loading</Button>);
    expect(screen.getByRole('img', { hidden: true })).toHaveClass('animate-spin');
  });
});
```

### Run Tests

```bash
npm run test:unit
npm run test:coverage
```

---

## Contributing New Components

When adding a new reusable component:

1. **Create in `components/ui/`** — Keep shared components centralized
2. **Document with JSDoc** — Props, return type, example usage
3. **Add Tailwind only** — No inline styles or CSS modules
4. **Create `.stories.jsx`** — Add Storybook story with multiple variants
5. **Write tests** — Unit tests for props, events, edge cases
6. **Update this guide** — Add component to the appropriate section
7. **Use in one place first** — Verify it works before calling it "reusable"

---

## Performance Tips

1. **Lazy load modals/popovers** — Use `dynamic()` and `'use client'`
2. **Memoize expensive renders** — Use `React.memo()` for list item components
3. **Avoid re-renders** — Use `useCallback()` for event handlers passed as props
4. **Tree-shake unused components** — Imports are automatically optimized by Next.js
5. **Profile bundle size** — Run `npm run analyze` to see component contributions

---

## Troubleshooting

### Component not appearing

- Check `'use client'` is at the top if using hooks
- Verify Tailwind classes are in `content: []` in tailwind.config.js

### Styles not applying

- Ensure using Tailwind class names, not inline styles
- Check dark mode: use `dark:` prefix for dark theme styles
- Verify CSS specificity: use `cn()` to merge classes safely

### Focus ring not visible

- All interactive elements should have `focus-visible:ring-2 focus-visible:ring-indigo-500`
- Test keyboard navigation: Tab, Shift+Tab, Enter, Space, Escape

### Component not responsive

- Use Tailwind breakpoints: `sm:`, `md:`, `lg:`, `xl:`, `2xl:`
- Test at mobile, tablet, and desktop sizes

---

## Related Documentation

- [Frontend State Management](./frontend-state-management.md)
- [Frontend Testing Guide](./frontend-testing.md)
- [Error Codes](./error-codes.md)
- [Accessibility Checklist](./smart-contract-security-checklist.md) (applies to UI too)

---

## Design System Roadmap

- 🚧 Expand color palette (Issue #31)
- 🚧 Add component animations (Issue #42)
- 🚧 Document grid system
- 🚧 Add modal focus trap
- 🚧 Create component audit tool
