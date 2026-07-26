module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm --prefix frontend run start',
      startServerReadyPattern: 'ready on|started server on|Ready in',
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/dashboard',
        'http://localhost:3000/escrow/create',
      ],
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.85 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 3500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
        'uses-optimized-images': ['error'],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
