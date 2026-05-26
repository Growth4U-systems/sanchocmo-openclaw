import { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role?: string;
      clientSlug?: string | null;
      allowedSlugs?: string[] | null;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role?: string;
    clientSlug?: string;
    allowedSlugs?: string[] | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    clientSlug?: string | null;
    allowedSlugs?: string[] | null;
  }
}
