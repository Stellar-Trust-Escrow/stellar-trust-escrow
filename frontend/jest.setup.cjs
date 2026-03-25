require('@testing-library/jest-dom');
const { configureAxe } = require('jest-axe');

// Configure axe for accessibility testing
const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: true },
    'html-has-lang': { enabled: true },
    label: { enabled: true },
    'landmark-one-main': { enabled: true },
  },
});

// Make axe available globally
global.axe = axe;
