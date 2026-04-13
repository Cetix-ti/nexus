import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { listAteraAvailablePatches } from "@/lib/integrations/atera-client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { externalSource: true, metadata: true },
  });

  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (asset.externalSource !== "atera") {
    return NextResponse.json([]);
  }

  const deviceGuid = (asset.metadata as any)?.deviceGuid;
  if (!deviceGuid) {
    return NextResponse.json([]);
  }

  try {
    const patches = await listAteraAvailablePatches(deviceGuid);
    return NextResponse.json(
      patches.map((p) => ({
        name: p.name,
        category: p.class ?? null,
        kbId: p.kbId ?? null,
        status: p.status ?? null,
      })),
    );
  } catch {
    return NextResponse.json([]);
  }
}
