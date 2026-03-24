/** @type {import('next').NextConfig} */
import bundleAnalyzer from '@next/bundle-analyzer';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not defined');

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  // Outputs HTML reports to .next/analyze/
  openAnalyzer: false,
});

const nextConfig = {
  // TODO (contributor): add image domains if using next/image with external URLs
  images: {
    domains: [],
  },
  // Proxy API calls to backend in development
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
