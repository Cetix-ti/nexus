import { NextResponse } from "next/server";
import {
  getMonitoringConfig,
  setMonitoringConfig,
  testMonitoringConnection,
} from "@/lib/monitoring/email-sync";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = await getMonitoringConfig();
  return NextResponse.json({ config });
}

export async function PUT(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.mailbox) {
    return NextResponse.json({ error: "mailbox requis" }, { status: 422 });
  }
  await setMonitoringConfig({
    mailbox: body.mailbox,
    folders: Array.isArray(body.folders) ? body.folders : [],
    backupFolders: Array.isArray(body.backupFolders) ? body.backupFolders : [],
    securityFolders: Array.isArray(body.securityFolders) ? body.securityFolders : [],
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { mailbox } = await req.json();
  if (!mailbox) return NextResponse.json({ ok: false, error: "mailbox requis" });
  return NextResponse.json(await testMonitoringConnection(mailbox));
}
