import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

const APP_NAME = "Nexus ITSM";

/**
 * GET /api/v1/me/mfa
 * Returns MFA status for the current user.
 * If setup is requested (?action=setup), generates a new TOTP secret + QR code.
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { mfaEnabled: true, mfaSecret: true, email: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const action = req.nextUrl.searchParams.get("action");

  if (action === "setup") {
    // Generate a new TOTP secret
    const totp = new OTPAuth.TOTP({
      issuer: APP_NAME,
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: new OTPAuth.Secret({ size: 20 }),
    });

    const secretBase32 = totp.secret.base32;
    const otpauthUrl = totp.toString();

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 256,
      margin: 2,
      color: { dark: "#1E293B", light: "#FFFFFF" },
    });

    // Store the secret temporarily (not yet enabled until verified)
    await prisma.user.update({
      where: { id: me.id },
      data: { mfaSecret: secretBase32, mfaEnabled: false },
    });

    return NextResponse.json({
      success: true,
      data: {
        secretBase32,
        qrCode: qrDataUrl,
        otpauthUrl,
        mfaEnabled: false,
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      mfaEnabled: user.mfaEnabled,
      hasSecret: !!user.mfaSecret,
    },
  });
}

/**
 * POST /api/v1/me/mfa
 * Verify a TOTP code and enable/disable MFA.
 *
 * Body: { code: string, action: "enable" | "disable" | "verify" }
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { code, action } = body;

  if (!code || !action) {
    return NextResponse.json({ error: "code et action requis" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { mfaEnabled: true, mfaSecret: true, email: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (!user.mfaSecret) {
    return NextResponse.json(
      { error: "MFA non configuré. Lancez d'abord le setup." },
      { status: 400 },
    );
  }

  // Verify the TOTP code
  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    label: user.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.mfaSecret),
  });

  const delta = totp.validate({ token: code, window: 1 });
  const isValid = delta !== null;

  if (!isValid) {
    return NextResponse.json(
      { error: "Code invalide. Vérifiez votre application d'authentification." },
      { status: 403 },
    );
  }

  if (action === "enable") {
    await prisma.user.update({
      where: { id: me.id },
      data: { mfaEnabled: true, mfaVerifiedAt: new Date() },
    });
    return NextResponse.json({ success: true, mfaEnabled: true });
  }

  if (action === "disable") {
    await prisma.user.update({
      where: { id: me.id },
      data: { mfaEnabled: false, mfaSecret: null, mfaVerifiedAt: null },
    });
    return NextResponse.json({ success: true, mfaEnabled: false });
  }

  if (action === "verify") {
    await prisma.user.update({
      where: { id: me.id },
      data: { mfaVerifiedAt: new Date() },
    });
    // Clear the MFA pending cookie so proxy stops blocking
    const res = NextResponse.json({ success: true, verified: true });
    res.cookies.set("nexus-mfa-pending", "", { path: "/", maxAge: 0 });
    return res;
  }

  return NextResponse.json({ error: "Action invalide" }, { status: 400 });
}
