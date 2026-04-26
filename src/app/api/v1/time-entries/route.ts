import { NextResponse } from "next/server";
import { z } from "zod";
import { getAllowedOrgIds, userCanAccessOrg } from "@/lib/auth/org-scope";
import { writeTimeEntryAudit } from "@/lib/billing/time-entry-audit";
import {
  listTimeEntries,
  createTimeEntry,
  deleteTimeEntry,
} from "@/lib/billing/time-entries-service";
import { getCurrentUser, hasCapability, hasMinimumRole } from "@/lib/auth-utils";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

const createSchema = z.object({
  ticketId: z.string().min(1),
  organizationId: z.string().min(1),
  timeType: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional().nullable(),
  durationMinutes: z.number().int().positive().max(24 * 60),
  description: z.string().max(2000).optional(),
  isAfterHours: z.boolean().optional(),
  isWeekend: z.boolean().optional(),
  isUrgent: z.boolean().optional(),
  isOnsite: z.boolean().optional(),
  hasTravelBilled: z.boolean().optional(),
  travelDurationMinutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
  // Les 4 champs suivants restent acceptés pour compat avec la modale
  // actuelle, mais le serveur IGNORE leur valeur et recalcule tout via
  // decideBilling. Ils servent uniquement à ne pas casser la signature.
  coverageStatus: z.string().optional(),
  coverageReason: z.string().optional(),
  hourlyRate: z.number().optional().nullable(),
  amount: z.number().optional().nullable(),
  forceNonBillable: z.boolean().optional(),
  /** Type de prestation choisi (axe "quoi" — drive isOnsite/coverage). */
  workTypeId: z.string().optional().nullable(),
  /** Palier tarifaire choisi (axe "combien" — drive le taux horaire). */
  rateTierId: z.string().optional().nullable(),
  /** Saisir au nom d'un autre agent. Réservé aux SUPER_ADMIN / MSP_ADMIN /
   *  TEAM_LEAD. Si absent ou égal au caller, c'est une saisie pour soi. */
  onBehalfOfAgentId: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role.startsWith("CLIENT_")) return forbidden();

  const url = new URL(req.url);
  const ticketId = url.searchParams.get("ticketId") || undefined;
  const organizationId = url.searchParams.get("organizationId") || undefined;
  const agentId = url.searchParams.get("agentId") || undefined;
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");

  const allowedOrgIds = await getAllowedOrgIds(me.id, me.role);
  const rows = await listTimeEntries({
    ticketId,
    organizationId,
    agentId,
    from: fromStr ? new Date(fromStr) : undefined,
    to: toStr ? new Date(toStr) : undefined,
    allowedOrgIds,
  });

  // Les champs `hourlyRate` et `amount` sont sensibles (confidentialité
  // tarifaire). On les redacte pour tout utilisateur sans la capacité
  // "finances". Ils restent accessibles via /finances et /analytics pour
  // les rôles autorisés (qui appliquent leur propre gate).
  if (!hasCapability(me, "finances")) {
    return NextResponse.json(rows.map((r) => ({ ...r, hourlyRate: null, amount: null })));
  }
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!hasMinimumRole(me.role, "TECHNICIAN")) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const d = parsed.data;
  // Scoping Phase 9 : refuse de saisir sur une org hors du périmètre.
  if (!(await userCanAccessOrg(me.id, me.role, d.organizationId))) {
    return NextResponse.json(
      { error: "Vous n'avez pas accès à cette organisation." },
      { status: 403 },
    );
  }
  // Saisie au nom d'un autre agent : autorisée seulement pour SUPERVISOR+.
  // Sinon on force agentId = me.id (le serveur ignore la valeur du client).
  let effectiveAgentId = me.id;
  if (d.onBehalfOfAgentId && d.onBehalfOfAgentId !== me.id) {
    if (!hasMinimumRole(me.role, "SUPERVISOR")) {
      return NextResponse.json(
        { error: "Saisie au nom d'un autre agent réservée aux superviseurs et plus." },
        { status: 403 },
      );
    }
    // Vérifie que l'agent cible existe et est actif (sinon on saisit pour
    // un compte inexistant ou désactivé — incohérence côté reporting).
    const { default: prisma } = await import("@/lib/prisma");
    const target = await prisma.user.findUnique({
      where: { id: d.onBehalfOfAgentId },
      select: { id: true, isActive: true },
    });
    if (!target || !target.isActive) {
      return NextResponse.json(
        { error: "Agent cible introuvable ou inactif." },
        { status: 400 },
      );
    }
    effectiveAgentId = target.id;
  }
  try {
    const created = await createTimeEntry({
      ticketId: d.ticketId,
      organizationId: d.organizationId,
      agentId: effectiveAgentId,
      timeType: d.timeType,
      startedAt: new Date(d.startedAt),
      endedAt: d.endedAt ? new Date(d.endedAt) : null,
      durationMinutes: d.durationMinutes,
      description: d.description ?? "",
      isAfterHours: d.isAfterHours,
      isWeekend: d.isWeekend,
      isUrgent: d.isUrgent,
      isOnsite: d.isOnsite,
      hasTravelBilled: d.hasTravelBilled,
      travelDurationMinutes: d.travelDurationMinutes,
      forceNonBillable: d.forceNonBillable,
      workTypeId: d.workTypeId,
      rateTierId: d.rateTierId,
    });
    // Audit log — action distincte selon que c'est pour soi ou pour un
    // autre. Le agentId final ne dit pas qui a réellement saisi.
    const action = effectiveAgentId !== me.id ? "create_on_behalf_of" : "create";
    await writeTimeEntryAudit(created.id, me.id, action, {
      to: {
        agentId: effectiveAgentId,
        durationMinutes: d.durationMinutes,
        timeType: d.timeType,
        ticketId: d.ticketId,
      },
      note: action === "create_on_behalf_of" ? `Saisi au nom de ${effectiveAgentId}` : null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const isBillingLock = e instanceof Error && e.name === "BillingLockError";
    const isValidation = e instanceof Error && e.name === "TimeEntryValidationError";
    if (!isBillingLock && !isValidation) console.error("time-entry create failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de création" },
      { status: isBillingLock ? 423 : isValidation ? 400 : 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!hasMinimumRole(me.role, "TECHNICIAN")) return forbidden();
  const body = await req.json();
  const id = body.id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Ownership : un TECHNICIAN ne peut modifier QUE ses propres saisies.
  // Un SUPERVISOR+ peut modifier n'importe laquelle (correction, validation, etc.).
  const { default: prisma } = await import("@/lib/prisma");
  const entry = await prisma.timeEntry.findUnique({
    where: { id },
    select: { agentId: true, organizationId: true },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner = entry.agentId === me.id;
  const isSupervisor = hasMinimumRole(me.role, "SUPERVISOR");
  if (!isOwner && !isSupervisor) return forbidden();
  // Scoping Phase 9 : pas de modification d'une saisie hors scope.
  if (!(await userCanAccessOrg(me.id, me.role, entry.organizationId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { updateTimeEntry } = await import("@/lib/billing/time-entries-service");
    const updated = await updateTimeEntry(id, body);
    await writeTimeEntryAudit(id, me.id, "update", {
      to: {
        durationMinutes: body.durationMinutes,
        timeType: body.timeType,
        approvalStatus: body.approvalStatus,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    const isBillingLock = err instanceof Error && err.name === "BillingLockError";
    const isValidation = err instanceof Error && err.name === "TimeEntryValidationError";
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: isBillingLock ? 423 : isValidation ? 400 : 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!hasMinimumRole(me.role, "TECHNICIAN")) return forbidden();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Même règle ownership que PATCH.
  const { default: prisma } = await import("@/lib/prisma");
  const entry = await prisma.timeEntry.findUnique({
    where: { id },
    select: { agentId: true, organizationId: true },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner = entry.agentId === me.id;
  const isSupervisor = hasMinimumRole(me.role, "SUPERVISOR");
  if (!isOwner && !isSupervisor) return forbidden();
  // Scoping Phase 9 : pas de delete hors scope.
  if (!(await userCanAccessOrg(me.id, me.role, entry.organizationId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Audit AVANT delete — sinon le timeEntryId ne référence plus rien
    // mais ça reste valide (pas de FK).
    await writeTimeEntryAudit(id, me.id, "delete", {
      from: { agentId: entry.agentId, organizationId: entry.organizationId },
    });
    await deleteTimeEntry(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const isBillingLock = err instanceof Error && err.name === "BillingLockError";
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: isBillingLock ? 423 : 500 },
    );
  }
}
