/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@industry/schema"],
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
