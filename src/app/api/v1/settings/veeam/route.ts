import { NextResponse } from "next/server";
import {
  getVeeamGraphConfig,
  setVeeamGraphConfig,
  testGraphConnection,
  getSecretExpiryInfo,
} from "@/lib/veeam/graph-sync";

export async function GET() {
  const config = await getVeeamGraphConfig();
  const expiry = getSecretExpiryInfo();
  return NextResponse.json({
    config,
    expiry,
    hasAzureCredentials: !!(
      process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_TENANT_ID &&
      process.env.AZURE_CLIENT_SECRET
    ),
  });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { mailbox, folderPath } = body;
  if (!mailbox) {
    return NextResponse.json(
      { error: "L'adresse de la boîte aux lettres est requise" },
      { status: 422 },
    );
  }
  await setVeeamGraphConfig({
    mailbox,
    folderPath: folderPath || "Inbox",
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  // Test connection + list folders
  const body = await req.json();
  const { mailbox } = body;
  if (!mailbox) {
    return NextResponse.json(
      { ok: false, error: "Adresse de boîte aux lettres requise" },
    );
  }
  const result = await testGraphConnection(mailbox);
  return NextResponse.json(result);
}
