import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAsset } from "@/lib/assets/service";
import { getCurrentUser } from "@/lib/auth-utils";

const TYPE_MAP: Record<string, string> = {
  WORKSTATION: "workstation",
  LAPTOP: "laptop",
  SERVER: "server",
  NETWORK: "network",
  PRINTER: "printer",
  MOBILE: "mobile",
  SOFTWARE: "software",
  VM: "vm",
  CLOUD: "cloud",
  OTHER: "workstation",
};

const STATUS_MAP: Record<string, string> = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  MAINTENANCE: "maintenance",
  RETIRED: "retired",
};

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId") || undefined;

  const rows = await prisma.asset.findMany({
    where: orgId ? { organizationId: orgId } : undefined,
    orderBy: { name: "asc" },
    include: {
      organization: { select: { name: true } },
      site: { select: { name: true } },
    },
  });

  return NextResponse.json(
    rows.map((a) => ({
      id: a.id,
      name: a.name,
      type: TYPE_MAP[a.type] ?? "workstation",
      organization: a.organization?.name ?? "—",
      organizationId: a.organizationId,
      site: a.site?.name ?? "—",
      serial: a.serialNumber ?? "—",
      ip: a.ipAddress ?? "—",
      status: STATUS_MAP[a.status] ?? "active",
      warranty: a.warrantyExpiry
        ? a.warrantyExpiry.toISOString().slice(0, 10)
        : "—",
      manufacturer: a.manufacturer ?? "—",
      model: a.model ?? "—",
      cpuModel: (a.metadata as any)?.cpuModel ?? null,
      ramGb: (a.metadata as any)?.ramGb ?? null,
    }))
  );
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.organizationId || !body.name) {
    return NextResponse.json(
      { error: "organizationId et name requis" },
      { status: 400 }
    );
  }
  return NextResponse.json(await createAsset(body), { status: 201 });
}
