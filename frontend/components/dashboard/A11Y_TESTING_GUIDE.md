# Dashboard Accessibility Testing Guide

This guide explains how to test and verify the accessibility features of the dashboard component.

## Quick Accessibility Audit

### 1. Automated Testing with jest-axe

```bash
npm run test:a11y
```

This runs all accessibility tests using jest-axe and axe-core. Tests must pass with zero critical failures.

### 2. Manual Testing with Screen Reader

#### Using NVDA (Windows)
1. Download and install NVDA from https://www.nvaccess.org/
2. Open the dashboard page
3. Press `Insert + H` to open Element List
4. Verify all major sections are announced: "Statistics", "Activity Feed", "Active Escrows"
5. Navigate with Tab and arrow keys to verify logical flow
6. Check that dynamic content is announced via aria-live regions

#### Using JAWS (Windows/Mac)
1. Open the dashboard
2. Press `Insert + Space` to open Virtual Cursor mode
3. Use arrow keys to navigate through content
4. Verify headings are announced with `H` key
5. Verify landmarks with `;` key

#### Using VoiceOver (Mac/iOS)
1. Enable VoiceOver: `Cmd + F5`
2. Navigate with `VO + Right Arrow` (next item)
3. Use Web Rotor: `VO + U` to see all headings and regions
4. Test with keyboard-only navigation: `Tab` and `Shift + Tab`

### 3. Focus Indicators Verification

- Tab through all interactive elements
- Each element should show a clear indigo ring: `ring-2 ring-indigo-500`
- No elements should have focus trapped or skip unexpectedly
- Use browser dev tools: `F12 → Inspect → Tab through elements`

### 4. Color Contrast Verification

Use WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/

- Stat widget values on dark background: 13.25:1 ✓
- Timeline text: 7.2:1 ✓
- Error messages: 6.8:1 ✓

### 5. Keyboard Navigation Testing

- **Tab**: Move forward through interactive elements
- **Shift + Tab**: Move backward
- **Enter/Space**: Activate buttons and links
- **Arrow Keys**: Navigate within lists and select options

All elements should be reachable without a mouse.

## Dynamic Content Testing

### Testing aria-live Regions

Dynamic updates should be announced automatically:

1. **Quorum Progress** (aria-live="polite")
   - Vote counts update
   - Listen for announcement: "450000 votes"

2. **Activity Timeline** (aria-live="polite")
   - New items appear
   - Announcement: "Escrow #123 Active, just now"

3. **Reputation Badge** (aria-live="polite")
   - Score updates
   - Announcement: "Your reputation score: 87"

## Data Table Verification

All charts and visualizations include visually hidden tables:

```html
<table class="sr-only" aria-label="Success rate data">
  <tbody>
    <tr>
      <td>Success Rate</td>
      <td>87%</td>
    </tr>
  </tbody>
</table>
```

Screen reader users can access this data with Table Navigation:
- NVDA: `T` to jump between tables
- JAWS: `T` for next table, `Shift + T` for previous
- VoiceOver: Use Web Rotor to navigate tables

## Common Issues and Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Content not announced | Missing aria-live | Add `aria-live="polite" aria-atomic="true"` |
| Focus indicator missing | No focus-visible state | Use `:focus-visible` and high-contrast ring |
| Chart not accessible | No data table | Add sr-only table with chart data |
| Confusing navigation | Wrong tab order | Use semantic HTML or set tabindex |
| Color-only information | Red/green dots | Add icons or text labels |

## Browser DevTools Tips

### Lighthouse Accessibility Audit
1. Open DevTools: `F12`
2. Lighthouse tab → Check "Accessibility"
3. Run audit
4. Target: 90+ score with zero critical/serious issues

### Accessibility Inspector (Firefox)
1. DevTools → Accessibility tab
2. View accessibility tree
3. Check for missing labels, roles, and landmarks

### Color Vision Deficiency Simulator (Chrome)
1. DevTools → Rendering
2. Emulate vision deficiencies
3. Verify contrast and visual clarity

## Automated Testing Example

```javascript
// Test file: components/dashboard/StatWidgets.test.jsx
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('StatWidgets has no accessibility violations', async () => {
  const { container } = render(
    <StatWidgets address="GTEST..." />
  );
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});

test('Stats are announced with aria-live', () => {
  render(<StatWidgets address="GTEST..." />);
  const stat = screen.getByLabelText('Total Escrows metric');
  expect(stat).toHaveAttribute('aria-live', 'polite');
});
```

## Checklist for Release

- [ ] All automated tests pass: `npm run test:a11y`
- [ ] Keyboard navigation works without mouse
- [ ] Screen reader announces all major sections
- [ ] Dynamic updates trigger aria-live announcements
- [ ] Focus indicators visible on all interactive elements
- [ ] Contrast ratios meet WCAG AA standard (4.5:1 minimum)
- [ ] Form fields have associated labels
- [ ] Images/icons have aria-hidden or alt text
- [ ] Data tables provided for charts
- [ ] No color-only information conveyance
- [ ] Error messages use role="alert"
- [ ] Loading states properly announced
