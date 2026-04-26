// ============================================================================
// /api/v1/time-entries/[id]/transition
//
// Workflow d'approbation des saisies de temps. Avant ce route, le champ
// `approvalStatus` existait sur TimeEntry mais aucune API ne pouvait le
// transitionner — toutes les saisies restaient en "draft" indéfiniment,
// pas de gel possible avant facturation, modification rétroactive sans
// trace.
//
// Transitions permises :
//   draft     → submitted      (propriétaire OU supervisor+)
//   submitted → approved       (supervisor+)
//   submitted → rejected       (supervisor+, note recommandée)
//   rejected  → draft          (propriétaire, pour resoumettre)
//   approved  → invoiced       (MSP_ADMIN+)
//   invoiced  → (aucune sortie — verrouillé)
//
// Périodes verrouillées (BillingPeriodLock) : aucune transition permise
// vers "draft" (resoumission) ni "rejected" (reset). Les entries d'un
// mois verrouillé ne peuvent que progresser vers "invoiced".
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { checkBillingLock } from "@/lib/billing/period-lock";

const ALLOWED_STATUSES = ["draft", "submitted", "approved", "rejected", "invoiced"] as const;
type Status = (typeof ALLOWED_STATUSES)[number];

const bodySchema = z.object({
  to: z.enum(ALLOWED_STATUSES),
  note: z.string().max(2000).optional().nullable(),
});

interface TransitionContext {
  isOwner: boolean;
  isSupervisor: boolean;
  isAdmin: boolean;
  startedAt: Date;
}

function transitionAllowed(
  from: Status,
  to: Status,
  ctx: TransitionContext,
): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: "Statut déjà appliqué." };
  switch (from) {
    case "draft":
      if (to === "submitted") {
        if (ctx.isOwner || ctx.isSupervisor) return { ok: true };
        return { ok: false, reason: "Seul le propriétaire ou un superviseur peut soumettre cette saisie." };
      }
      break;
    case "submitted":
      if (to === "approved" || to === "rejected") {
        if (ctx.isSupervisor) return { ok: true };
        return { ok: false, reason: "Seul un superviseur (ou plus) peut approuver/rejeter." };
      }
      if (to === "draft") {
        if (ctx.isOwner) return { ok: true };
        return { ok: false, reason: "Seul le propriétaire peut remettre en brouillon." };
      }
      break;
    case "rejected":
      if (to === "draft") {
        if (ctx.isOwner || ctx.isSupervisor) return { ok: true };
        return { ok: false, reason: "Seul le propriétaire ou un superviseur peut resoumettre." };
      }
      break;
    case "approved":
      if (to === "invoiced") {
        if (ctx.isAdmin) return { ok: true };
        return { ok: false, reason: "Seul un admin MSP peut marquer comme facturé." };
      }
      // Annulation d'approbation autorisée à un superviseur (avant facturation).
      if (to === "submitted" && ctx.isSupervisor) return { ok: true };
      break;
    case "invoiced":
      return { ok: false, reason: "Saisie déjà facturée — verrouillée." };
  }
  return { ok: false, reason: `Transition ${from} → ${to} non permise.` };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { to, note } = parsed.data;

  const entry = await prisma.timeEntry.findUnique({
    where: { id },
    select: { id: true, agentId: true, approvalStatus: true, startedAt: true },
  });
  if (!entry) {
    return NextResponse.json({ error: "Saisie introuvable" }, { status: 404 });
  }

  const from = (entry.approvalStatus as Status) || "draft";
  const ctx: TransitionContext = {
    isOwner: entry.agentId === me.id,
    isSupervisor: hasMinimumRole(me.role, "SUPERVISOR"),
    isAdmin: hasMinimumRole(me.role, "MSP_ADMIN"),
    startedAt: entry.startedAt,
  };
  const check = transitionAllowed(from, to, ctx);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 403 });
  }

  // Verrou de période : on empêche les transitions régressives sur un
  // mois verrouillé. Une saisie verrouillée ne peut que progresser vers
  // "invoiced" (final).
  const lockMsg = await checkBillingLock(entry.startedAt);
  if (lockMsg && to !== "invoiced" && to !== "approved") {
    return NextResponse.json(
      { error: `Période verrouillée : ${lockMsg}` },
      { status: 409 },
    );
  }

  await prisma.timeEntry.update({
    where: { id },
    data: {
      approvalStatus: to,
      // On stocke la note de rejet (ou autre commentaire de transition)
      // dans coverageReason — pas idéal sémantiquement mais évite une
      // nouvelle table. À migrer vers un model TimeEntryAuditLog si on
      // veut un historique complet.
      ...(note ? { coverageReason: note } : {}),
    },
  });

  return NextResponse.json({
    id,
    from,
    to,
    note: note ?? null,
  });
}
