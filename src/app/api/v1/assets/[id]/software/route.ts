import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { findWazuhAgent, getWazuhAgentPackages } from "@/lib/integrations/wazuh-client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { name: true, ipAddress: true, macAddress: true },
  });

  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    console.log("[software] Looking up asset:", { name: asset.name, ip: asset.ipAddress, mac: asset.macAddress });
    const match = await findWazuhAgent(asset.name, asset.ipAddress, asset.macAddress);
    console.log("[software] Match result:", match ? { id: match.agent.id, name: match.agent.name, matchedBy: match.matchedBy } : "NOT FOUND");
    if (!match) {
      return NextResponse.json({ agentFound: false, packages: [] });
    }

    const packages = await getWazuhAgentPackages(match.agent.id);
    console.log("[software] Packages count:", packages.length);
    return NextResponse.json({
      agentFound: true,
      matchedBy: match.matchedBy,
      wazuhAgentName: match.agent.name,
      packages: packages.map((p) => ({
        name: p.name,
        version: p.version ?? null,
        vendor: p.vendor ?? null,
        architecture: p.architecture ?? null,
        installedDate: p.install_time ?? null,
      })),
    });
  } catch (err) {
    console.error("[software] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ agentFound: false, packages: [] });
  }
}
