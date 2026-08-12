import type { NextConfig } from "next";

const liveInterviewEnabled = process.env.LIVE_INTERVIEW_ENABLED === "true";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: `camera=(), microphone=${liveInterviewEnabled ? "(self)" : "()"}, geolocation=()` },
        ],
      },
    ];
  },
};

export default nextConfig;
