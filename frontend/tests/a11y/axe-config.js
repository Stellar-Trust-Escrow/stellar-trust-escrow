/**
 * aXe Accessibility Test Configuration
 *
 * This configuration sets up automated accessibility testing using jest-axe.
 * Tests validate WCAG compliance and catch accessibility regressions.
 *
 * Run accessibility tests with: npm run test:a11y
 */

module.exports = {
  // WCAG compliance levels to test
  wcagVersion: '2.1',

  // Run against these accessibility standards
  standards: {
    wcag21A: true,
    wcag21AA: true,
    section508: false, // US Section 508
  },

  // Tags for filtering tests
  tags: ['wcag2a', 'wcag21a', 'wcag21aa', 'best-practice'],

  // Common rules to run
  rules: [
    'color-contrast',
    'html-has-lang',
    'label',
    'landmark-one-main',
    'region',
    'focusable-semantics',
    'scrollable-region-focusable',
  ],

  // Rules to ignore (project-specific exceptions)
  ignoreRules: [],
};
