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

// Conservative baseline Content-Security-Policy.
//
// 'unsafe-inline' is required because Next.js injects inline bootstrap/hydration
// <script> and inline styles (Tailwind); without it the app will not run. This
// weakens protection against *inline* script injection, but the policy still
// blocks external/injected script origins, framing, <base> hijacking and off-site
// form posts. The strict upgrade is per-request nonces via middleware
// (`script-src 'nonce-<random>' 'strict-dynamic'`); that is intentionally deferred
// as over-engineering for this MVP. The platform frontend loads no third-party
// scripts/fonts/CDN and calls only the same-origin API, so this policy stays
// small and stable.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  // Enforce HTTPS at the browser. TLS terminates at the platform CloudFront
  // distribution; no preload/includeSubDomains (hard to reverse, unnecessary for
  // a *.cloudfront.net host).
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

// CSP is applied in production builds only: `next dev` (Turbopack/HMR) needs
// 'unsafe-eval' and a websocket connect-src that a locked-down CSP would break.
// Keeping it prod-only leaves local dev fast while shipping the policy where it
// matters. (X-XSS-Protection is deliberately omitted — it is legacy and removed
// from modern browsers.)
if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  });
}

const nextConfig: NextConfig = {
  // Emit a self-contained production server (.next/standalone) so the Docker
  // runtime image ships only the traced files/dependencies it needs. This is a
  // packaging option only — routing, rewrites and rendering are unchanged.
  output: "standalone",
  // Don't advertise the framework ("X-Powered-By: Next.js") on responses.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
