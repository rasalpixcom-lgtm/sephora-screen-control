import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ] },
    // The read-only wall can be embedded in an OnSign WebView/SoC player.
    // All other pages retain framing protection. Its data still requires access.
    { source: "/((?!monitor$).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    { source: "/monitor", headers: [{ key: "Cache-Control", value: "no-store" }] }];
  },
};

export default nextConfig;
