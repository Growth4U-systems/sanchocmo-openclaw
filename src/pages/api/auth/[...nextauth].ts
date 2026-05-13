import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { loadClientsData } from "@/lib/data/clients";

/**
 * NextAuth.js configuration
 * - Google OAuth for team (@growth4u.io → admin) and clients
 * - Credentials provider for legacy token auth (coexistence)
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
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

        // Check admin token
        if (data.adminToken && credentials.token === data.adminToken) {
          return {
            id: "admin",
            name: "Admin",
            email: "admin@growth4u.io",
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
            email.endsWith("@growth4u.io") || adminEmails.includes(email);
          token.role = isAdmin ? "admin" : "client";
          if (token.role === "client") {
            const client = (data.clients || []).find(
              (c: { url?: string; email?: string }) =>
                c.email === email || c.url?.includes(email.split("@")[0])
            );
            token.clientSlug = client?.slug || null;
          }
        } else {
          // Legacy token provider
          token.role = (user as { role?: string }).role || "client";
          token.clientSlug = (user as { clientSlug?: string }).clientSlug || null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { clientSlug?: string | null }).clientSlug =
          token.clientSlug as string | null;
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
