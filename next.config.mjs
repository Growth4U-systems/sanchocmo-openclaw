import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return {
      fallback: [
        // Strangler Fig: everything Next.js doesn't handle → legacy server,
        // except /dashboard/* which is fully owned by Next.js so unmatched
        // paths there fall through to pages/404.tsx instead of legacy.
        {
          source: "/:rest((?!dashboard(?:/|$)).*)",
          destination: `http://localhost:${process.env.LEGACY_PORT || 18790}/:rest`,
        },
      ],
    };
  },
};

export default withNextIntl(nextConfig);
