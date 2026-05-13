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
  async redirects() {
    return [
      {
        source: "/dashboard/:slug/projects",
        destination: "/dashboard/:slug/tasks",
        permanent: true,
      },
      {
        source: "/dashboard/:slug/projects/:projectId",
        destination: "/dashboard/:slug/tasks/:projectId",
        permanent: true,
      },
      {
        source: "/dashboard/:slug/projects/:projectId/tasks/:taskId",
        destination: "/dashboard/:slug/tasks/:taskId",
        permanent: true,
      },
      {
        source: "/dashboard/:slug/projects/:projectId/tasks/:taskId/content/:contentTaskId",
        destination: "/dashboard/:slug/tasks/:projectId/sub/:taskId/content/:contentTaskId",
        permanent: true,
      },
      {
        source: "/dashboard/:slug/projects/:projectId/tasks/:taskId/content/:contentTaskId/:rest*",
        destination: "/dashboard/:slug/tasks/:projectId/sub/:taskId/content/:contentTaskId/:rest*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    const legacyBase = `http://localhost:${process.env.LEGACY_PORT || 18790}`;
    return {
      // Strangler Fig: only explicitly-listed paths proxy to the legacy
      // Mission Control server. Everything else Next.js doesn't handle
      // falls through to pages/404.tsx.
      fallback: [
        { source: "/mc/:path*", destination: `${legacyBase}/mc/:path*` },
        { source: "/api/pagespeed", destination: `${legacyBase}/api/pagespeed` },
        { source: "/api/metrics-collect", destination: `${legacyBase}/api/metrics-collect` },
        { source: "/api/recommendations", destination: `${legacyBase}/api/recommendations` },
      ],
    };
  },
};

export default withNextIntl(nextConfig);
