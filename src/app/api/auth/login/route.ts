// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * POST /api/auth/login
 * POST /api/auth/register
 *
 * Simple auth endpoint. In production, use:
 * - bcrypt for password hashing
 * - JWT or session tokens
 * - Prisma for database
 * - Rate limiting
 */

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e senha são obrigatórios" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 8 caracteres" },
        { status: 400 }
      );
    }

    // ═══ PRODUCTION CODE (uncomment when Prisma is set up) ═══
    //
    // import bcrypt from "bcryptjs";
    // import jwt from "jsonwebtoken";
    // import prisma from "@/lib/db/prisma";
    //
    // const isLogin = req.nextUrl.pathname.includes("/login");
    //
    // if (isLogin) {
    //   const user = await prisma.user.findUnique({ where: { email } });
    //   if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    //     return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    //   }
    //
    //   const token = jwt.sign(
    //     { userId: user.id, accountId: user.accountId, email: user.email },
    //     process.env.JWT_SECRET!,
    //     { expiresIn: "7d" }
    //   );
    //
    //   const cookieStore = await cookies();
    //   cookieStore.set("session", token, {
    //     httpOnly: true,
    //     secure: process.env.NODE_ENV === "production",
    //     sameSite: "lax",
    //     maxAge: 60 * 60 * 24 * 7, // 7 days
    //     path: "/",
    //   });
    //
    //   return NextResponse.json({ success: true, user: { id: user.id, email: user.email } });
    //
    // } else {
    //   // Register
    //   const existing = await prisma.user.findUnique({ where: { email } });
    //   if (existing) {
    //     return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });
    //   }
    //
    //   const passwordHash = await bcrypt.hash(password, 12);
    //
    //   const account = await prisma.account.create({
    //     data: {
    //       plan: "FREE",
    //       users: {
    //         create: {
    //           email,
    //           passwordHash,
    //           role: "OWNER",
    //         },
    //       },
    //     },
    //     include: { users: true },
    //   });
    //
    //   const user = account.users[0];
    //   const token = jwt.sign(
    //     { userId: user.id, accountId: account.id, email },
    //     process.env.JWT_SECRET!,
    //     { expiresIn: "7d" }
    //   );
    //
    //   const cookieStore = await cookies();
    //   cookieStore.set("session", token, {
    //     httpOnly: true,
    //     secure: process.env.NODE_ENV === "production",
    //     sameSite: "lax",
    //     maxAge: 60 * 60 * 24 * 7,
    //     path: "/",
    //   });
    //
    //   return NextResponse.json({ success: true, user: { id: user.id, email } }, { status: 201 });
    // }

    // ═══ DEMO MODE ═══
    // For demo/development, accept any credentials
    const cookieStore = await cookies();
    cookieStore.set("session", "demo_session_token", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return NextResponse.json({
      success: true,
      user: { id: "demo_user", email },
    });
  } catch (error: any) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error.message },
      { status: 500 }
    );
  }
}