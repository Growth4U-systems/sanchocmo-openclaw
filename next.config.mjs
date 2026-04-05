import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      fallback: [
        // Strangler Fig: everything Next.js doesn't handle → legacy server
        {
          source: "/:path*",
          destination: `http://localhost:${process.env.LEGACY_PORT || 18790}/:path*`,
        },
      ],
    };
  },
};

export default withNextIntl(nextConfig);
