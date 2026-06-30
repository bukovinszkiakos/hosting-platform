import type { NextConfig } from "next";

// In local development the browser talks only to the Next dev server (:3000),
// which proxies /api/* to the backend. This mirrors production, where the ALB
// ingress routes /api to the backend service and / to the frontend, so the app
// always uses same-origin relative "/api" URLs and no CORS is required.
//
// BACKEND_ORIGIN overrides the target (defaults to the backend's local dev URL,
// see backend Properties/launchSettings.json). In production /api is handled by
// the ingress before it reaches Next, so this rewrite is not exercised there.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:5165";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
