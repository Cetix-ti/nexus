import { NextResponse } from "next/server";
import {
  getMonitoringConfig,
  setMonitoringConfig,
  testMonitoringConnection,
} from "@/lib/monitoring/email-sync";

export async function GET() {
  const config = await getMonitoringConfig();
  return NextResponse.json({ config });
}

export async function PUT(req: Request) {
  const body = await req.json();
  if (!body.mailbox) {
    return NextResponse.json({ error: "mailbox requis" }, { status: 422 });
  }
  await setMonitoringConfig({
    mailbox: body.mailbox,
    folders: Array.isArray(body.folders) ? body.folders : [],
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const { mailbox } = await req.json();
  if (!mailbox) return NextResponse.json({ ok: false, error: "mailbox requis" });
  return NextResponse.json(await testMonitoringConnection(mailbox));
}
