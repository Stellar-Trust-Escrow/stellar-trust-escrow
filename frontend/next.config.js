/** @type {import('next').NextConfig} */

const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not defined');

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

export default nextConfig;
