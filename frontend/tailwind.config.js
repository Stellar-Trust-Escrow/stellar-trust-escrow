/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  // Mobile-first breakpoints (Issue #1444). `xs` is added for the smallest
  // phones (375px); the remaining values mirror Tailwind's defaults so that
  // existing `sm/md/lg/xl` utilities keep working.
  screens: {
    xs: '375px',
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
  },
  theme: {
    extend: {
      // Touch-target helpers: guarantees a minimum 44x44px hit area so every
      // interactive element passes Lighthouse's a11y audit on mobile.
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
      // TODO (contributor — easy, Issue #31): extend with brand colours
      colors: {
        brand: {
          50: '#eef2ff',
          500: '#6366f1',
          600: '#4f46e5',
          900: '#1e1b4b',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.25s ease-out both',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        progress: {
          from: { width: '0%' },
          to: { width: '100%' },
        },
      },
    },
  },
  plugins: [],
};
