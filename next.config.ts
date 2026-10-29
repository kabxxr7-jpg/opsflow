import type { NextConfig } from "next";

// Applied to every response. No CSP here on purpose: Next injects inline scripts for hydration and
// theming, so a useful policy needs per-request nonces — a larger change than this hardening pass.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Photo intake posts the image inside a Server Action request; the default 1 MB limit would
    // reject an ordinary phone photo. The browser shrinks uploads to ~1.5 MB first, and
    // lib/image.ts caps what the action accepts at 4 MB (Vercel's own ceiling is 4.5 MB).
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // The root has no page of its own. A config redirect answers before anything renders, so there's
  // nothing for instant-navigation validation to trip over (a page that only calls redirect() does).
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
