/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@industry/schema"],
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  outputFileTracingExcludes: {
    "*": [
      "next.config.mjs",
      ".tmp/**/*",
      "../.cache/**/*",
      "../../.cache/**/*",
    ],
  },
};

export default nextConfig;
