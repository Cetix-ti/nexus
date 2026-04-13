import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { listAteraAgentSoftware } from "@/lib/integrations/atera-client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { externalSource: true, externalId: true },
  });

  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (asset.externalSource !== "atera" || !asset.externalId) {
    return NextResponse.json([]);
  }

  // externalId may be stored as "atera_123" or just "123"
  const rawId = asset.externalId.replace(/^atera_/, "");
  const agentId = parseInt(rawId, 10);
  if (Number.isNaN(agentId)) {
    return NextResponse.json([]);
  }

  try {
    const software = await listAteraAgentSoftware(agentId);
    return NextResponse.json(
      software.map((s) => ({
        name: s.AppName,
        version: s.Version ?? null,
        publisher: s.Publisher ?? null,
        installedDate: s.InstalledDate ?? null,
      })),
    );
  } catch {
    return NextResponse.json([]);
  }
}
