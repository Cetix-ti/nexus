import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasCapability, hasMinimumRole } from "@/lib/auth-utils";
import { toEngineContract } from "@/lib/billing/contract-mapper";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Les contrats contiennent les tarifs horaires et les heures incluses —
  // données sensibles. Réservé aux agents MSP (pas CLIENT_*). Pour un
  // client, utiliser les endpoints `/api/v1/portal/*` qui filtrent par org.
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId") || undefined;
  // `shape=engine` : format consommable directement par decideBilling() —
  // enum lowercase + hourBank/mspPlan expandés depuis `settings` JSON. La
  // modale de saisie de temps et les re-validations serveur l'utilisent.
  const shape = url.searchParams.get("shape");
  const rows = await prisma.contract.findMany({
    where: orgId ? { organizationId: orgId } : undefined,
    include: { organization: { select: { name: true } } },
    orderBy: { startDate: "desc" },
  });
  // Phase 10A — confidentialité tarifaire. Le shape=engine reste complet
  // (utilisé par la modale de saisie qui calcule la couverture côté
  // serveur) — les valeurs ne fuient pas au navigateur car la décision
  // est ré-exécutée côté backend autoritaire. Le shape "list" (UI fiche
  // org → onglet Contrats) redacte les champs sensibles si l'agent
  // n'a pas la capability "finances", au lieu de 403 (la liste reste
  // utile pour voir les types/dates même sans tarifs).
  if (shape === "engine") {
    return NextResponse.json(rows.map((c) => toEngineContract(c, c.organization?.name)));
  }
  const canSeeMoney = hasCapability(me, "finances");
  return NextResponse.json(
    rows.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      startDate: c.startDate.toISOString(),
      endDate: c.endDate?.toISOString() || null,
      monthlyHours: canSeeMoney ? c.monthlyHours : null,
      hourlyRate: canSeeMoney ? c.hourlyRate : null,
      notes: c.notes,
      // settings contient hourBank.totalHoursPurchased/overageRate/etc. —
      // tout aussi sensible. On le redact aussi quand !canSeeMoney.
      settings: canSeeMoney ? (c.settings ?? null) : null,
    }))
  );
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Création de contrat : SUPERVISOR+ (impact tarification client).
  if (!hasMinimumRole(me.role, "SUPERVISOR") || me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  if (!body.name || !body.organizationId || !body.startDate) {
    return NextResponse.json({ error: "name, organizationId, startDate requis" }, { status: 400 });
  }
  const created = await prisma.contract.create({
    data: {
      organizationId: body.organizationId,
      name: body.name,
      type: (body.type || "SUPPORT").toUpperCase(),
      status: (body.status || "ACTIVE").toUpperCase(),
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
      monthlyHours: body.monthlyHours,
      hourlyRate: body.hourlyRate,
      notes: body.notes,
      settings: body.settings ?? undefined,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
