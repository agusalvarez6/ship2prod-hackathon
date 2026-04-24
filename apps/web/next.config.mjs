/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ship2prod/sdk", "@ship2prod/schema", "@ship2prod/errors"],
  experimental: {
    serverComponentsExternalPackages: ["pg", "ioredis"],
  },
  webpack: (config) => {
    // Allow `.js` specifiers to resolve to `.ts`/`.tsx` files (ESM-style relative imports).
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
