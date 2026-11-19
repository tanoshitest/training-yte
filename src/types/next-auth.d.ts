import type { Role } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: Role;
    fullName: string;
    teacherId?: string | null;
    studentId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      fullName: string;
      teacherId: string | null;
      studentId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    fullName: string;
    teacherId?: string | null;
    studentId?: string | null;
  }
}

// NextAuth v5 re-export JWT từ @auth/core — cần khai báo cả hai module
// thì callback `jwt`/`session` mới nhận đúng kiểu.
declare module "@auth/core/jwt" {
  interface JWT {
    role: Role;
    fullName: string;
    teacherId?: string | null;
    studentId?: string | null;
  }
}

export {};
