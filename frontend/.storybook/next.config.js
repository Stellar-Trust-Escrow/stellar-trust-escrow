/**
 * Storybook-specific Next.js config override.
 *
 * The root next.config.js throws if NEXT_PUBLIC_API_URL is not set,
 * which would crash Storybook. This file provides a safe fallback
 * config that Storybook's Next.js framework picks up instead.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { domains: [] },
};

export default nextConfig;
