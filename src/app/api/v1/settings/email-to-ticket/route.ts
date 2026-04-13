import { NextResponse } from "next/server";
import { getConfig, setConfig, testConnection } from "@/lib/email-to-ticket/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = await getConfig();
  return NextResponse.json({
    config,
    hasAzureCredentials: !!(
      process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_TENANT_ID &&
      process.env.AZURE_CLIENT_SECRET
    ),
  });
}

export async function PUT(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.mailbox) {
    return NextResponse.json({ error: "mailbox requis" }, { status: 422 });
  }
  await setConfig({
    mailbox: body.mailbox,
    folderPath: body.folderPath || "Inbox",
    defaultPriority: body.defaultPriority || "MEDIUM",
    markAsRead: body.markAsRead !== false,
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.mailbox) {
    return NextResponse.json({ ok: false, error: "mailbox requis" });
  }
  const result = await testConnection(body.mailbox);
  return NextResponse.json(result);
}
