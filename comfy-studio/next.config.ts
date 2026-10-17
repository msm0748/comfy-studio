import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    proxyClientMaxBodySize: '12mb',
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
