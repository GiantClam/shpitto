/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@industry/schema", "@industry/db"],
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
