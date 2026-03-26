require('@testing-library/jest-dom');
const { configureAxe } = require('jest-axe');

// Configure axe for accessibility testing
const axe = configureAxe({
  globalName: 'axe',
  branding: {
    application: 'Stellar Trust Escrow',
  },
  rules: {
    'color-contrast': { enabled: false },
    'html-has-lang': { enabled: true },
    label: { enabled: true },
    'landmark-one-main': { enabled: true },
  },
});

// Make axe available globally
global.axe = axe;

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    getImageData: jest.fn(() => ({ data: [] })),
    putImageData: jest.fn(),
    createImageData: jest.fn(() => []),
    setTransform: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    fillText: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    stroke: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    transform: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn(),
  }));
}
