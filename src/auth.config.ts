import type { NextAuthConfig } from "next-auth";

/**
 * Cấu hình dùng chung cho cả Edge (middleware) và Node (server).
 * KHÔNG import Prisma / bcrypt ở đây — middleware chạy trên Edge runtime.
 */
export const authConfig = {
  pages: {
    signIn: "/dang-nhap",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.teacherId = user.teacherId ?? null;
        token.studentId = user.studentId ?? null;
        token.fullName = user.fullName;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role;
        session.user.teacherId = token.teacherId ?? null;
        session.user.studentId = token.studentId ?? null;
        session.user.fullName = token.fullName;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
