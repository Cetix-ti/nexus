// ============================================================================
// /api/v1/organizations/[id]/hour-bank
//
// Configuration de la banque d'heures pour un client (Phase 2B + 11A).
//
// GET : retourne la config UI existante (shape complet, JSON).
// PUT : sauvegarde la config UI ET projette vers Contract.settings.hourBank
//       du contrat hour_bank actif. L'engine continue de lire
//       Contract.settings.hourBank — la projection garantit que la valeur
//       affichée dans la modale Facturation est celle vraiment appliquée.
//
// Si aucun Contract de type "hour_bank" actif n'existe pour l'org, la
// config UI est sauvegardée mais aucune projection n'est faite. La
// réponse contient un avertissement.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { userCanAccessOrg } from "@/lib/auth/org-scope";

interface Ctx {
  params: Promise<{ id: string }>;
}

interface UiHourBankConfig {
  startDate?: string;
  endDate?: string;
  totalHours?: number;
  hourlyRate?: number;
  overageRate?: number;
  carryOver?: boolean;
  includedTravelCount?: number;
  includedOnsiteHours?: number;
  extraTravelRate?: number;
  extraOnsiteRate?: number;
  consumedByWorkTypeIds?: string[];
}

/**
 * Projette le shape UI vers le shape engine attendu par contract-mapper.
 * Les champs UI-only (payments, includedEveningHours, etc.) ne sont pas
 * projetés — ils restent dans OrgHourBankConfig pour l'UI.
 */
function projectToEngineShape(
  ui: UiHourBankConfig,
  existingEngineSettings: Record<string, unknown> = {},
): Record<string, unknown> {
  // hoursConsumed : préserver la valeur existante (incrémentée par les
  // saisies de temps) — on ne la réinitialise pas en éditant la config.
  const hoursConsumed = Number(existingEngineSettings.hoursConsumed ?? 0);

  return {
    totalHoursPurchased: Number(ui.totalHours ?? existingEngineSettings.totalHoursPurchased ?? 0),
    hoursConsumed,
    eligibleTimeTypes:
      (existingEngineSettings.eligibleTimeTypes as string[] | undefined) ?? [
        "remote_work",
        "onsite_work",
        "preparation",
        "follow_up",
        "other",
      ],
    carryOverHours: ui.carryOver ?? existingEngineSettings.carryOverHours ?? false,
    allowOverage: existingEngineSettings.allowOverage ?? true,
    overageRate: Number(ui.overageRate ?? existingEngineSettings.overageRate ?? 0),
    // includesTravel/includesOnsite : si l'UI a saisi des inclusions
    // explicites > 0, le mode est "inclus dans la banque" — les saisies
    // déduisent. Sinon hors banque (mode "extra").
    includesTravel:
      (ui.includedTravelCount ?? 0) > 0 ||
      Boolean(existingEngineSettings.includesTravel ?? false),
    includesOnsite:
      (ui.includedOnsiteHours ?? 0) > 0 ||
      Boolean(existingEngineSettings.includesOnsite ?? true),
    validFrom: ui.startDate ?? existingEngineSettings.validFrom ?? new Date().toISOString(),
    validTo: ui.endDate ?? existingEngineSettings.validTo ?? "",
  };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await userCanAccessOrg(me.id, me.role, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = await prisma.orgHourBankConfig.findUnique({
    where: { organizationId: id },
  });
  return NextResponse.json({ data: row?.config ?? {} });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!(await userCanAccessOrg(me.id, me.role, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body JSON requis" }, { status: 400 });
  }
  const config = JSON.parse(JSON.stringify(body)) as UiHourBankConfig;

  // 1. Sauve la config UI complète (Phase 2B). On la stringify-parse
  //    pour la convertir en JsonValue pur compatible Prisma.
  const configJson = JSON.parse(JSON.stringify(config));
  await prisma.orgHourBankConfig.upsert({
    where: { organizationId: id },
    create: { organizationId: id, config: configJson },
    update: { config: configJson },
  });

  // 2. Projette vers Contract.settings.hourBank du contrat hour_bank
  //    actif (Phase 11A — l'engine lit cette settings, pas notre config UI).
  //    L'identification "hour_bank" se fait via la présence de settings.hourBank
  //    (l'enum ContractType n'a pas de valeur dédiée — voir contract-mapper.ts
  //    qui dérive le type depuis settings).
  const candidates = await prisma.contract.findMany({
    where: {
      organizationId: id,
      status: "ACTIVE",
    },
    select: { id: true, settings: true, startDate: true },
    orderBy: { startDate: "desc" },
  });
  const activeContract = candidates.find((c) => {
    const s = (c.settings as Record<string, unknown> | null) ?? {};
    return s.hourBank != null;
  }) ?? null;

  let projected: { contractId: string } | null = null;
  if (activeContract) {
    const existingSettings = (activeContract.settings as Record<string, unknown>) ?? {};
    const existingHourBank =
      (existingSettings.hourBank as Record<string, unknown>) ?? {};
    const newHourBank = projectToEngineShape(config, existingHourBank);
    const nextSettings = {
      ...existingSettings,
      hourBank: newHourBank,
    };
    await prisma.contract.update({
      where: { id: activeContract.id },
      data: { settings: nextSettings as never },
    });
    projected = { contractId: activeContract.id };
  }

  return NextResponse.json({
    ok: true,
    projected,
    warning: projected
      ? null
      : "Aucun contrat hour_bank actif — la config est sauvegardée mais le moteur de facturation l'ignore tant qu'un contrat n'existe pas.",
  });
}
