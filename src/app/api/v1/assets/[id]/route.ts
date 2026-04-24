import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { updateAsset, deleteAsset } from "@/lib/assets/service";
import { getCurrentUser } from "@/lib/auth-utils";

const TYPE_LABEL: Record<string, string> = {
  WORKSTATION: "Poste de travail",
  LAPTOP: "Portable",
  SERVER: "Serveur",
  NETWORK: "Équipement réseau",
  PRINTER: "Imprimante",
  MOBILE: "Mobile",
  SOFTWARE: "Logiciel",
  VM: "Machine virtuelle",
  CLOUD: "Cloud",
  OTHER: "Autre",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  MAINTENANCE: "Maintenance",
  RETIRED: "Retiré",
};

const STATUS_TONE: Record<string, "success" | "default" | "warning" | "danger"> = {
  ACTIVE: "success",
  INACTIVE: "default",
  MAINTENANCE: "warning",
  RETIRED: "danger",
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      site: { select: { id: true, name: true } },
      assignedContact: { select: { id: true, firstName: true, lastName: true, email: true } },
      assetNotes: {
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { firstName: true, lastName: true } },
          contact: { select: { firstName: true, lastName: true } },
        },
      },
      tickets: {
        include: {
          ticket: { select: { id: true, number: true, subject: true, status: true } },
        },
      },
    },
  });
  if (!asset) return NextResponse.json({ error: "Actif introuvable" }, { status: 404 });

  const dto = {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    typeLabel: TYPE_LABEL[asset.type] ?? asset.type,
    status: asset.status,
    statusLabel: STATUS_LABEL[asset.status] ?? asset.status,
    statusTone: STATUS_TONE[asset.status] ?? "default",
    manufacturer: asset.manufacturer,
    model: asset.model,
    serial: asset.serialNumber,
    purchaseDate: asset.purchaseDate ? asset.purchaseDate.toISOString() : null,
    warranty: asset.warrantyExpiry ? asset.warrantyExpiry.toISOString() : null,
    ip: asset.ipAddress,
    mac: asset.macAddress,
    notes: asset.notes,
    organization: asset.organization
      ? { id: asset.organization.id, name: asset.organization.name }
      : null,
    site: asset.site ? { id: asset.site.id, name: asset.site.name } : null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    relatedTickets: asset.tickets
      .map((ta) => ta.ticket)
      .filter((t): t is NonNullable<typeof t> => t != null)
      .map((t) => ({ id: t.id, number: t.number, subject: t.subject, status: t.status })),
  };
  return NextResponse.json(dto);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await updateAsset(id, await req.json()));
  } catch (err) {
    console.error("[assets PATCH]", err);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await deleteAsset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[assets DELETE]", err);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
