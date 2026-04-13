import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * POST /api/v1/users/reset-password/confirm
 * Public endpoint — validates a reset token and sets a new password
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { token, newPassword } = body;

  if (!token || !newPassword) {
    return NextResponse.json({ error: "Token et mot de passe requis" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères" }, { status: 400 });
  }

  // Find token
  const key = `reset_token:${token}`;
  const row = await prisma.tenantSetting.findUnique({ where: { key } });
  if (!row) {
    return NextResponse.json({ error: "Lien de réinitialisation invalide ou expiré" }, { status: 400 });
  }

  const data = row.value as any;
  const expiresAt = new Date(data.expiresAt);
  if (expiresAt < new Date()) {
    await prisma.tenantSetting.delete({ where: { key } });
    return NextResponse.json({ error: "Ce lien a expiré. Veuillez en demander un nouveau." }, { status: 400 });
  }

  // Set new password
  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: data.userId },
    data: { passwordHash: hash },
  });

  // Delete used token
  await prisma.tenantSetting.delete({ where: { key } });

  return NextResponse.json({ success: true });
}
