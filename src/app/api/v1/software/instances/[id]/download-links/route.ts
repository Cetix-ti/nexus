// Génération d'un lien public signé pour télécharger un installeur.
// Body: { installerId, expiresAt?, maxDownloads?, withPin? (bool), label? }
// Par défaut : 72h, 5 téléchargements, pas de PIN.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { generateDownloadToken, generatePin, hashPin } from "@/lib/software/tokens";

const DEFAULT_EXPIRY_HOURS = 72;
const DEFAULT_MAX_DOWNLOADS = 5;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const installerId = String(body?.installerId ?? "");
  if (!installerId) return NextResponse.json({ error: "installerId requis" }, { status: 400 });

  const inst = await prisma.softwareInstance.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!inst) return NextResponse.json({ error: "Instance introuvable" }, { status: 404 });

  const installer = await prisma.softwareInstaller.findUnique({ where: { id: installerId } });
  if (!installer) return NextResponse.json({ error: "Installeur introuvable" }, { status: 404 });
  // L'installeur doit être rattaché à cette instance OU à son template.
  if (installer.softwareInstanceId !== inst.id && !installer.softwareTemplateId) {
    return NextResponse.json({ error: "Installeur non rattaché à cette instance" }, { status: 400 });
  }

  const token = generateDownloadToken();
  const expiresAt = body?.expiresAt
    ? new Date(body.expiresAt)
    : new Date(Date.now() + DEFAULT_EXPIRY_HOURS * 3600_000);
  const maxDownloads =
    typeof body?.maxDownloads === "number" && body.maxDownloads > 0
      ? body.maxDownloads
      : DEFAULT_MAX_DOWNLOADS;
  const withPin = Boolean(body?.withPin);
  const pin = withPin ? generatePin() : null;

  const link = await prisma.softwareDownloadLink.create({
    data: {
      installerId,
      organizationId: inst.organizationId,
      token,
      label: body?.label || null,
      expiresAt,
      maxDownloads,
      requirePin: withPin,
      pinHash: pin ? hashPin(pin) : null,
      createdByUserId: me.id,
    },
  });

  // PIN renvoyé UNE SEULE FOIS en clair dans la réponse — l'UI doit l'afficher à l'utilisateur.
  return NextResponse.json({
    ...link,
    pin, // ONE-TIME VALUE — stocké uniquement en hash côté DB
    url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/d/${link.token}`,
  }, { status: 201 });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const links = await prisma.softwareDownloadLink.findMany({
    where: { installer: { softwareInstanceId: id } },
    include: {
      installer: { select: { title: true, filename: true } },
      _count: { select: { audits: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(links);
}
