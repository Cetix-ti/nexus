// ============================================================================
// GET /api/v1/my-space/mileage?month=YYYY-MM
//
// Total du kilométrage et des $ rembours­és à l'agent connecté pour le mois
// indiqué (défaut : mois courant). Calcul :
//   - Déplacements = ensemble de paires (org, jour) où l'agent a au moins
//     une time entry onsite=true. Un aller-retour par jour/client, même
//     s'il y a plusieurs saisies.
//   - $ = kmRoundTrip × agentRatePerKm (OrgMileageRate). Si la config
//     n'existe pas pour une org, déplacement compté en "non configuré"
//     (affiché à part dans l'UI).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { getGlobalAgentRatePerKm } from "@/lib/billing/global-mileage";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Agent sans allocation km (JT/MG) : aucun trip à afficher. Les
  // onsite TimeEntries existent bien (pour facturation client) mais
  // ne donnent pas lieu à un remboursement personnel.
  const meFull = await prisma.user.findUnique({
    where: { id: me.id },
    select: { mileageAllocationEnabled: true },
  });
  if (meFull?.mileageAllocationEnabled === false) {
    return NextResponse.json({
      month: { from: new Date().toISOString(), to: new Date().toISOString(), label: "" },
      tripCount: 0,
      totalKm: 0,
      totalAmount: 0,
      unconfiguredCount: 0,
      trips: [],
      mileageAllocationDisabled: true,
    });
  }

  // Par défaut : mois courant.
  const monthParam = req.nextUrl.searchParams.get("month");
  const now = new Date();
  let from: Date;
  let to: Date;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    from = new Date(y, m - 1, 1);
    to = new Date(y, m, 0, 23, 59, 59, 999);
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  // Toutes les saisies onsite de l'agent sur la plage.
  const entries = await prisma.timeEntry.findMany({
    where: {
      agentId: me.id,
      isOnsite: true,
      startedAt: { gte: from, lte: to },
    },
    select: { id: true, organizationId: true, startedAt: true },
    orderBy: { startedAt: "asc" },
  });

  // Dédup par (orgId, jour local) — un AR par jour/client max.
  const seen = new Set<string>();
  const trips: Array<{ organizationId: string; date: string }> = [];
  for (const e of entries) {
    const d = new Date(e.startedAt);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const key = `${e.organizationId}|${dateKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    trips.push({ organizationId: e.organizationId, date: dateKey });
  }

  // Remap des IDs legacy Freshservice (`org_xxx`) vers leur cuid moderne
  // via slug / clientCode / nom normalisé. Défense en profondeur : la
  // migration data a résolu les 5 rows existantes, mais si un import
  // futur en ré-introduit, le calcul du km continue de fonctionner
  // sans afficher "sans barème configuré" à tort.
  const legacyIds = trips.map((t) => t.organizationId).filter((id) => /^org_[a-z0-9_]+$/i.test(id));
  if (legacyIds.length > 0) {
    const allOrgs = await prisma.organization.findMany({
      select: { id: true, slug: true, clientCode: true, name: true },
    });
    const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
    for (const legacy of new Set(legacyIds)) {
      const tail = legacy.replace(/^org_/i, "").toLowerCase();
      const match = allOrgs.find((o) =>
        (o.slug ?? "").toLowerCase() === tail ||
        (o.clientCode ?? "").toLowerCase() === tail ||
        normalize(o.name) === tail,
      );
      if (match) {
        for (const t of trips) if (t.organizationId === legacy) t.organizationId = match.id;
      }
    }
  }

  const orgIds = Array.from(new Set(trips.map((t) => t.organizationId)));
  // Le taux $/km est maintenant global (TenantSetting) — appliqué
  // uniformément à tous les clients. On ne lit plus agentRatePerKm
  // par-client ; on ne garde que kmRoundTrip et billToClient.
  const [rates, orgs, globalRate] = await Promise.all([
    orgIds.length > 0
      ? prisma.orgMileageRate.findMany({
          where: { organizationId: { in: orgIds } },
          select: { organizationId: true, kmRoundTrip: true, billToClient: true },
        })
      : Promise.resolve([]),
    orgIds.length > 0
      ? prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    getGlobalAgentRatePerKm(),
  ]);
  const rateByOrg = new Map(rates.map((r) => [r.organizationId, r]));
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  interface TripRow {
    organizationId: string;
    organizationName: string;
    date: string;
    kmRoundTrip: number | null;
    agentRatePerKm: number | null;
    amount: number | null;
    configured: boolean;
    // true = client est facturé pour ce déplacement
    // false = Cetix absorbe le coût (déplacement inclus au contrat, courtoisie…).
    // L'agent est remboursé dans les DEUX cas — ce flag concerne uniquement
    // la facturation au client.
    billToClient: boolean;
  }

  const tripRows: TripRow[] = trips.map((t) => {
    const rate = rateByOrg.get(t.organizationId);
    const amount = rate ? rate.kmRoundTrip * globalRate : null;
    return {
      organizationId: t.organizationId,
      organizationName: orgNameById.get(t.organizationId) ?? "",
      date: t.date,
      kmRoundTrip: rate?.kmRoundTrip ?? null,
      agentRatePerKm: globalRate,
      amount,
      configured: !!rate,
      billToClient: rate?.billToClient ?? true, // défaut = facturé
    };
  });

  const totalKm = tripRows.reduce((s, t) => s + (t.kmRoundTrip ?? 0), 0);
  const totalAmount = tripRows.reduce((s, t) => s + (t.amount ?? 0), 0);
  const unconfiguredCount = tripRows.filter((t) => !t.configured).length;

  return NextResponse.json({
    month: {
      from: from.toISOString(),
      to: to.toISOString(),
      label: from.toLocaleDateString("fr-CA", { month: "long", year: "numeric" }),
    },
    tripCount: tripRows.length,
    totalKm,
    totalAmount,
    unconfiguredCount,
    trips: tripRows,
  });
}
