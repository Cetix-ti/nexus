import { NextResponse } from "next/server";
import {
  getVeeamImapConfig,
  setVeeamImapConfig,
  testImapConnection,
} from "@/lib/veeam/imap-sync";

export async function GET() {
  const config = await getVeeamImapConfig();
  if (!config) return NextResponse.json(null);
  // Never return the password to the client
  return NextResponse.json({ ...config, pass: config.pass ? "••••••••" : "" });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { host, port, secure, user, pass, folder } = body;
  if (!host || !user) {
    return NextResponse.json({ error: "host et user requis" }, { status: 422 });
  }

  // If pass is masked, keep the existing one
  let realPass = pass;
  if (pass === "••••••••") {
    const existing = await getVeeamImapConfig();
    realPass = existing?.pass ?? "";
  }

  const config = {
    host,
    port: Number(port) || 993,
    secure: secure !== false,
    user,
    pass: realPass,
    folder: folder || "INBOX",
  };
  await setVeeamImapConfig(config);
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  // Test connection + list folders
  const body = await req.json();
  const { host, port, secure, user, pass } = body;

  let realPass = pass;
  if (pass === "••••••••") {
    const existing = await getVeeamImapConfig();
    realPass = existing?.pass ?? "";
  }

  const config = {
    host,
    port: Number(port) || 993,
    secure: secure !== false,
    user,
    pass: realPass,
    folder: "INBOX",
  };

  const result = await testImapConnection(config);
  return NextResponse.json(result);
}
