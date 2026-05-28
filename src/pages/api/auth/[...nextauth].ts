import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { loadClientsData } from "@/lib/data/clients";
import { getSlugsForEmail } from "@/lib/data/client-access";
import { isAdminDomainEmail } from "@/lib/data/admin-domain";

const googleClientId =
  process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
const googleClientSecret =
  process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const googleAuthConfigured = Boolean(googleClientId) && Boolean(googleClientSecret);

/**
 * NextAuth.js configuration
 * - Google OAuth for team (ADMIN_EMAIL_DOMAIN → admin) and clients
 * - Credentials provider for legacy token auth (coexistence)
 */
export const authOptions: NextAuthOptions = {
  providers: [
    ...(googleAuthConfigured
      ? [
          GoogleProvider({
            clientId: googleClientId as string,
            clientSecret: googleClientSecret as string,
          }),
        ]
      : []),
    // Legacy token provider for coexistence with mc-server.js
    CredentialsProvider({
      id: "legacy-token",
      name: "Legacy Token",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.token) return null;
        const data = loadClientsData();
        const adminToken = data.adminToken || process.env.MC_ADMIN_TOKEN || null;

        // Check admin token
        if (adminToken && credentials.token === adminToken) {
          return {
            id: "admin",
            name: "Admin",
            email: process.env.ADMIN_IDENTITY_EMAIL || "admin@localhost",
            role: "admin",
          };
        }

        // Check client token
        if (credentials.token.length >= 16) {
          const client = (data.clients || []).find(
            (c: { mcToken?: string }) => c.mcToken === credentials.token
          );
          if (client) {
            return {
              id: `client-${client.slug}`,
              name: client.name,
              email: `${client.slug}@portal`,
              role: "client",
              clientSlug: client.slug,
            };
          }
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        // On first sign-in, determine role
        if (account?.provider === "google") {
          const email = (user.email || "").toLowerCase();
          const data = loadClientsData();
          const adminEmails = (data.adminEmails || []).map((e) => e.toLowerCase());
          const isAdmin =
            isAdminDomainEmail(email) || adminEmails.includes(email);
          token.role = isAdmin ? "admin" : "client";
          token.clientSlug = null;
          token.allowedSlugs = null;
          if (token.role === "client") {
            // Multi-client team member: explicit email → slugs mapping wins.
            const allowed = getSlugsForEmail(email);
            if (allowed.length > 0) {
              token.allowedSlugs = allowed;
            } else {
              // Legacy single-client portal by email/url match.
              const client = (data.clients || []).find(
                (c: { url?: string; email?: string }) =>
                  c.email === email || c.url?.includes(email.split("@")[0])
              );
              token.clientSlug = client?.slug || null;
            }
          }
        } else {
          // Legacy token provider
          token.role = (user as { role?: string }).role || "client";
          token.clientSlug = (user as { clientSlug?: string }).clientSlug || null;
          token.allowedSlugs = null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { clientSlug?: string | null }).clientSlug =
          token.clientSlug as string | null;
        (session.user as { allowedSlugs?: string[] | null }).allowedSlugs =
          (token.allowedSlugs as string[] | null) ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || "mc-dev-secret-change-me",
};

export default NextAuth(authOptions);
