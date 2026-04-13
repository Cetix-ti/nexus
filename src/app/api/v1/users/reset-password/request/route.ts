import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { sendEmail } from "@/lib/email/send";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * POST /api/v1/users/reset-password/request
 * Public endpoint — user enters email, gets a reset link
 */
export async function POST(req: Request) {
  const body = await req.json();
  const email = body.email?.trim()?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Courriel requis" }, { status: 400 });

  // Find user (or contact with portal access)
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true },
  });

  // Always return success to prevent email enumeration
  if (!user) {
    return NextResponse.json({ success: true, message: "Si ce courriel est associé à un compte, un lien de réinitialisation a été envoyé." });
  }

  // Generate token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.tenantSetting.upsert({
    where: { key: `reset_token:${token}` },
    create: { key: `reset_token:${token}`, value: { userId: user.id, expiresAt: expiresAt.toISOString() } as any },
    update: { value: { userId: user.id, expiresAt: expiresAt.toISOString() } as any },
  });

  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <h2 style="margin:0 0 8px;">Réinitialisation de votre mot de passe</h2>
  <p style="color:#6b7280;">Bonjour ${user.firstName},</p>
  <p>Vous avez demandé la réinitialisation de votre mot de passe Nexus.</p>
  <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;font-weight:600;">Réinitialiser mon mot de passe</a>
  <p style="font-size:13px;color:#9ca3af;">Ce lien expire dans 24 heures. Si vous n'avez pas fait cette demande, ignorez ce courriel.</p>
  <p style="font-size:12px;color:#d1d5db;margin-top:24px;">— Nexus ITSM</p>
</div>`.trim();

  await sendEmail(user.email, "Réinitialisation de mot de passe — Nexus", html);

  return NextResponse.json({ success: true, message: "Si ce courriel est associé à un compte, un lien de réinitialisation a été envoyé." });
}
