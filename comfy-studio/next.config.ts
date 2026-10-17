import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers(){return [{source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache, no-store, must-revalidate'},{key:'Content-Type',value:'application/javascript; charset=utf-8'},{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self'"}]}];},
  experimental: {
    agentFeedback: true,
    proxyClientMaxBodySize: '12mb',
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
