import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 로고·직인 그림(최대 2MB)을 올릴 수 있게
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
