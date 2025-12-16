import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "automationghana.com",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "automationghana.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "store.automationghana.com",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "store.automationghana.com",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "tagg2.automationghana.com",
        pathname: "/**",
      },
    ],
  },
  allowedDevOrigins: [
    "jwpai.uk",
    "*.jwpai.uk",
    "jwpai.uk:443",
    "*.jwpai.uk:443",
    "jwpai.uk:80",
    "*.jwpai.uk:80",
    "localhost:3001",
  ],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@": path.resolve(process.cwd()),
    };

    return config;
  },
};

export default nextConfig;
