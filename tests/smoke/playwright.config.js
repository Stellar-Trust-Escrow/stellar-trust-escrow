// @ts-check
import { defineConfig } from '@playwright/test';

/**
 * Config for the blue-green deploy smoke suite. Deliberately separate from
 * frontend/playwright.config.js (which drives full-browser e2e/visual
 * tests) — these checks are pure API `request` calls against a green
 * deployment's health/auth/data endpoints, so no browser/webServer is
 * needed and the whole suite should complete in seconds.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  fullyParallel: false, // run in order: healthz -> login -> escrows -> contracts status
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 15_000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.SMOKE_TARGET_URL || 'http://127.0.0.1:4000',
  },
});
