import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { useTheme } from '../../hooks/useTheme';
import { THEMES, THEME_KEY } from '../../lib/theme';

describe('useTheme', () => {
  beforeEach(() => {
    // Reset localStorage and matchMedia before each test
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  it('returns dark when localStorage has dark regardless of system preference', () => {
    localStorage.setItem(THEME_KEY, THEMES.DARK);
    window.matchMedia.mockImplementation((query) => ({
      matches: query === '(prefers-color-scheme: light)',
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.theme).toBe(THEMES.DARK);
  });

  it('toggles theme correctly', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    const initialTheme = result.current.theme;
    const expectedTheme = initialTheme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe(expectedTheme);
    expect(localStorage.getItem(THEME_KEY)).toBe(expectedTheme);
  });

  it('listens for system preference changes when no manual override is set', () => {
    let changeCallback = null;
    // Override the mock for this test to capture callback
    window.matchMedia.mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (eventName, callback) => {
        if (eventName === 'change') {
          changeCallback = callback;
        }
      },
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.theme).toBe(THEMES.LIGHT);

    act(() => {
      changeCallback({ matches: true });
    });

    expect(result.current.theme).toBe(THEMES.DARK);
  });

  it('does not change theme when system preference changes but manual override is set', () => {
    localStorage.setItem(THEME_KEY, THEMES.DARK);
    let changeCallback = null;

    window.matchMedia.mockImplementation((query) => ({
      matches: query === '(prefers-color-scheme: light)',
      media: query,
      onchange: null,
      addEventListener: (_event, callback) => {
        changeCallback = callback;
      },
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.theme).toBe(THEMES.DARK);

    act(() => {
      changeCallback({ matches: false });
    });

    expect(result.current.theme).toBe(THEMES.DARK);
  });
});
