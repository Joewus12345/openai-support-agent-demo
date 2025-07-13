/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'automationghana.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'store.automationghana.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
