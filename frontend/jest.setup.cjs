require('@testing-library/jest-dom');
const { configureAxe } = require('jest-axe');

// Mock window.matchMedia (not implemented in jsdom)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Configure axe for accessibility testing
const axe = configureAxe({
  globalName: 'axe',
  branding: {
    application: 'Stellar Trust Escrow',
  },
  rules: [
    // Disable specific rules that may be too strict for this project
    { id: 'color-contrast', enabled: true },
    { id: 'html-has-lang', enabled: true },
    { id: 'label', enabled: true },
    { id: 'landmark-one-main', enabled: true },
  ],
});

// Make axe available globally
global.axe = axe;
