// ============================================================================
// /api/v1/portal/approvers — gestion de la cascade d'approbateurs par
// l'administrateur du portail client de SON ORG (portalRole=ADMIN).
//
//   GET    : liste des approbateurs de l'org du contact connecté
//   POST   : ajoute un approbateur (depuis contact existant OU email manuel)
//   PATCH  : édite un approbateur (level, escalateAfterHours, scope, etc.)
//   DELETE : supprime un approbateur (?id=xxx)
//
// Sécurité : portalRole=ADMIN seulement. L'orgId est forcé à celui du
// contact connecté — impossible de toucher les approbateurs d'une autre org.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import {
  listApprovers,
  createApprover,
  updateApprover,
  deleteApprover,
} from "@/lib/approvers/service";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const me = await getCurrentPortalUser();
  if (!me) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (me.portalRole !== "ADMIN") {
    return { ok: false as const, status: 403, error: "Réservé aux administrateurs portail" };
  }
  return { ok: true as const, user: me };
}

export async function GET() {
  const r = await requireAdmin();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const approvers = await listApprovers(r.user.organizationId);
  // Renvoie aussi la liste des contacts actifs pour le sélecteur — évite
  // un round-trip supplémentaire côté UI.
  const contacts = await prisma.contact.findMany({
    where: {
      organizationId: r.user.organizationId,
      isActive: true,
    },
    select: {
      id: true, firstName: true, lastName: true, email: true, jobTitle: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });
  return NextResponse.json({
    approvers,
    contacts: contacts.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      email: c.email,
      jobTitle: c.jobTitle,
    })),
  });
}

interface CreateBody {
  contactId?: string | null;
  contactName?: string;
  contactEmail?: string;
  jobTitle?: string | null;
  level?: number;
  isPrimary?: boolean;
  scope?: string;
  scopeMinAmount?: number | null;
  escalateAfterHours?: number | null;
  notifyByEmail?: boolean;
}

export async function POST(req: Request) {
  const r = await requireAdmin();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  let body: CreateBody;
  try { body = (await req.json()) as CreateBody; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Si contactId fourni, on hydrate name/email depuis Contact (et on
  // vérifie que le contact appartient à l'org pour empêcher l'ajout
  // d'un approbateur d'une autre organisation).
  let resolvedName = body.contactName?.trim() ?? "";
  let resolvedEmail = body.contactEmail?.trim().toLowerCase() ?? "";
  let resolvedContactId: string | null = null;
  let resolvedJobTitle: string | null = body.jobTitle?.trim() || null;
  if (body.contactId) {
    const c = await prisma.contact.findUnique({
      where: { id: body.contactId },
      select: { id: true, firstName: true, lastName: true, email: true,
                jobTitle: true, organizationId: true, isActive: true },
    });
    if (!c || c.organizationId !== r.user.organizationId || !c.isActive) {
      return NextResponse.json({ error: "Contact invalide" }, { status: 400 });
    }
    resolvedContactId = c.id;
    resolvedName = `${c.firstName} ${c.lastName}`.trim();
    resolvedEmail = c.email.toLowerCase();
    if (!resolvedJobTitle) resolvedJobTitle = c.jobTitle ?? null;
  }
  if (!resolvedName || !resolvedEmail) {
    return NextResponse.json(
      { error: "name + email requis (ou contactId)" }, { status: 400 },
    );
  }

  const approver = await createApprover({
    organizationId: r.user.organizationId,
    contactId: resolvedContactId,
    contactName: resolvedName,
    contactEmail: resolvedEmail,
    jobTitle: resolvedJobTitle,
    level: typeof body.level === "number" && body.level > 0 ? Math.round(body.level) : 1,
    isPrimary: !!body.isPrimary,
    scope: body.scope ?? "all_tickets",
    scopeMinAmount: body.scopeMinAmount ?? null,
    escalateAfterHours: body.escalateAfterHours ?? null,
    notifyByEmail: body.notifyByEmail ?? true,
    addedBy: r.user.contactId,
  });
  return NextResponse.json(approver, { status: 201 });
}

interface PatchBody extends CreateBody { id?: string; isActive?: boolean; }

export async function PATCH(req: Request) {
  const r = await requireAdmin();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  // Vérifie que l'approbateur appartient bien à l'org du caller —
  // empêche un admin portail d'éditer ceux d'une autre org.
  const existing = await prisma.orgApprover.findUnique({
    where: { id: body.id }, select: { organizationId: true },
  });
  if (!existing || existing.organizationId !== r.user.organizationId) {
    return NextResponse.json({ error: "Approbateur introuvable" }, { status: 404 });
  }
  const { id, ...patch } = body;
  const updated = await updateApprover(id, patch);
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const r = await requireAdmin();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const existing = await prisma.orgApprover.findUnique({
    where: { id }, select: { organizationId: true },
  });
  if (!existing || existing.organizationId !== r.user.organizationId) {
    return NextResponse.json({ error: "Approbateur introuvable" }, { status: 404 });
  }
  await deleteApprover(id);
  return NextResponse.json({ ok: true });
}
