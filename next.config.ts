import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las imágenes de Instagram vienen de subdominios CDN dinámicos.
  // Permitimos cualquier subdominio de cdninstagram.com.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
    ],
  },
};

export default nextConfig;
