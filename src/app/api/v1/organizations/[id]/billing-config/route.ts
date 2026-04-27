import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/organizations/[id]/billing-config
 *
 * Retourne la config de facturation persistée d'une org. Si aucune row
 * n'existe encore, on retourne un objet vide normalisé pour que l'UI
 * puisse rendre sans crash.
 *
 * Restriction : staff (TECHNICIAN+) — la config influence directement
 * les revenus, on ne veut pas qu'un client puisse la lire.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_") || !hasMinimumRole(me.role, "TECHNICIAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const row = await prisma.orgBillingConfig.findUnique({
    where: { organizationId: id },
  });
  if (!row) {
    return NextResponse.json({
      organizationId: id,
      billingTypes: [],
      hourBank: null,
      ftig: null,
      updatedAt: null,
    });
  }
  return NextResponse.json({
    organizationId: id,
    billingTypes: row.billingTypes,
    hourBank: row.hourBank,
    ftig: row.ftig,
    updatedAt: row.updatedAt.toISOString(),
    updatedByUserId: row.updatedByUserId,
  });
}

/**
 * PATCH /api/v1/organizations/[id]/billing-config
 *
 * Mise à jour partielle de la config. Body accepte :
 *   - billingTypes : string[] (override complet)
 *   - hourBank     : object | null (override complet du JSON)
 *   - ftig         : object | null
 *
 * Upsert : crée la row si absente. Restriction : SUPERVISOR+ (les
 * techniciens peuvent voir mais pas modifier les paramètres facturation).
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_") || !hasMinimumRole(me.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {
    updatedByUserId: me.id,
  };
  if (Array.isArray(body.billingTypes)) {
    // Filtre les valeurs valides — on accepte uniquement les 3 modèles
    // connus (hour_bank, professional_services, ftig). Une saisie
    // "fantaisie" est silencieusement filtrée.
    const ALLOWED = new Set(["hour_bank", "professional_services", "ftig"]);
    data.billingTypes = (body.billingTypes as unknown[]).filter(
      (v): v is string => typeof v === "string" && ALLOWED.has(v),
    );
  }
  if (body.hourBank !== undefined) {
    // Schéma libre, on stocke tel quel. null = effacement explicite.
    data.hourBank = body.hourBank as never;
  }
  if (body.ftig !== undefined) {
    data.ftig = body.ftig as never;
  }

  const row = await prisma.orgBillingConfig.upsert({
    where: { organizationId: id },
    create: {
      organizationId: id,
      billingTypes: (data.billingTypes as string[] | undefined) ?? [],
      hourBank: (data.hourBank as never) ?? null,
      ftig: (data.ftig as never) ?? null,
      updatedByUserId: me.id,
    },
    update: data,
  });

  return NextResponse.json({
    organizationId: id,
    billingTypes: row.billingTypes,
    hourBank: row.hourBank,
    ftig: row.ftig,
    updatedAt: row.updatedAt.toISOString(),
  });
}
