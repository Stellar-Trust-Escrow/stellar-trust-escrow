// Ambient module declarations so that importing global stylesheets (e.g. from
// `.storybook/preview.tsx`) type-checks cleanly under `next build`. Next.js
// handles the actual CSS loading via webpack; this only satisfies the
// TypeScript compiler.
declare module '*.css';
declare module '*.scss';
declare module '*.sass';
