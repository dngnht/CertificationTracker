import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    /*
     * Protect everything except:
     * - Next.js internals (_next)
     * - static files
     * - the auth API routes
     * - the login page
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|login|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};