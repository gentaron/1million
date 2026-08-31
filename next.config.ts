import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow the sandbox preview proxy to load _next resources without warnings.
  allowedDevOrigins: ["*.space-z.ai", "*.chatglm.cn"],
};

export default nextConfig;
