import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendEmail } from "@/lib/email/send";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * POST /api/v1/users/reset-password
 *
 * Three modes:
 * 1. { userId, newPassword }         — Admin sets a new password directly
 * 2. { userId, sendEmail: true }     — Admin sends a reset link by email
 * 3. { userId, generateLink: true }  — Admin gets a reset link to copy
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ALL password reset modes require admin — this endpoint is NOT for
  // self-serve password reset (that's /request + /confirm). Otherwise
  // any authenticated user could reset another user's password.
  if (!hasMinimumRole(me.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
  }

  const body = await req.json();
  const userId = body.userId;
  if (!userId) return NextResponse.json({ error: "userId requis" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

  // Mode 1: Set password directly (admin only)
  if (body.newPassword) {
    if (!hasMinimumRole(me.role, "SUPERVISOR")) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }
    if (body.newPassword.length < 8) {
      return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères" }, { status: 400 });
    }
    const hash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    return NextResponse.json({ success: true, method: "direct" });
  }

  // Generate reset token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  // Store token in tenantSetting (simple approach)
  await prisma.tenantSetting.upsert({
    where: { key: `reset_token:${token}` },
    create: { key: `reset_token:${token}`, value: { userId: user.id, expiresAt: expiresAt.toISOString() } as any },
    update: { value: { userId: user.id, expiresAt: expiresAt.toISOString() } as any },
  });

  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  // Mode 2: Send email
  if (body.sendEmail) {
    const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <h2 style="margin:0 0 8px;">Réinitialisation de votre mot de passe</h2>
  <p style="color:#6b7280;">Bonjour ${user.firstName},</p>
  <p>Une demande de réinitialisation de mot de passe a été faite pour votre compte Nexus.</p>
  <p>Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe :</p>
  <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;font-weight:600;">Réinitialiser mon mot de passe</a>
  <p style="font-size:13px;color:#9ca3af;">Ce lien expire dans 24 heures. Si vous n'avez pas demandé cette réinitialisation, ignorez ce courriel.</p>
  <p style="font-size:12px;color:#d1d5db;margin-top:24px;">— Nexus ITSM</p>
</div>`.trim();

    const sent = await sendEmail(user.email, "Réinitialisation de mot de passe — Nexus", html);
    return NextResponse.json({ success: true, method: "email", sent });
  }

  // Mode 3: Return link for admin to copy
  return NextResponse.json({ success: true, method: "link", resetUrl });
}
