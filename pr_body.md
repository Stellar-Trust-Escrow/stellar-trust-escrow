## Description

Implements Issue #316: Conduct a comprehensive mobile responsiveness audit and fix all issues across the frontend.

## Features
- Added a mobile-friendly hamburger menu for seamless navigation on small screens
- Refactored the dashboard and landing page grids to use responsive column stacking
- Optimized the milestone creation form with mobile-first flexbox layouts
- Ensured touch targets are appropriately sized and action buttons span the full width on mobile devices
- Made the Dispute modal and Explorer filters properly wrapped to prevent horizontal overflow

## Tech Stack
- Next.js and React
- Tailwind CSS for mobile-first utility classes and responsive breakpoints
- Vanilla React state for the mobile menu toggle logic
- Responsive flexbox and CSS grids (`flex-col sm:flex-row`, `grid-cols-1 sm:grid-cols-3`)

## Testing
1. Clone branch `feature/issue-316-mobile-responsive-audit`
2. `cd frontend && npm install`
3. Configure `.env` from `.env.example`
4. `npm run dev` and test on mobile viewports (e.g., using Chrome DevTools Device Mode)

Closes #205
