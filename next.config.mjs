import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
