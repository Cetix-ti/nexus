import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { findWazuhAgentByHostname, getWazuhAgentPackages } from "@/lib/integrations/wazuh-client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { name: true },
  });

  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const agent = await findWazuhAgentByHostname(asset.name);
    if (!agent) return NextResponse.json([]);

    const packages = await getWazuhAgentPackages(agent.id);
    return NextResponse.json(
      packages.map((p) => ({
        name: p.name,
        version: p.version ?? null,
        vendor: p.vendor ?? null,
        architecture: p.architecture ?? null,
        installedDate: p.install_time ?? null,
      })),
    );
  } catch {
    return NextResponse.json([]);
  }
}
