import { NextResponse } from "next/server";
import { loadSmtpConfig, saveSmtpConfig, isConfigured } from "@/lib/smtp/storage";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cfg = await loadSmtpConfig();
  // Don't leak the password to the client
  return NextResponse.json({
    ...cfg,
    password: cfg.password ? "••••••••" : "",
    isConfigured: isConfigured(cfg),
  });
}

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const current = await loadSmtpConfig();
  // Don't overwrite password if client sends the masked placeholder
  const next = {
    ...current,
    ...body,
    password:
      body.password && body.password !== "••••••••"
        ? body.password
        : current.password,
  };
  await saveSmtpConfig(next);
  return NextResponse.json({ ok: true, isConfigured: isConfigured(next) });
}
