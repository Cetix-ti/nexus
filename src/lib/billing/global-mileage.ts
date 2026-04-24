// ============================================================================
// Taux $/km global pour tous les agents — stocké dans TenantSetting pour
// être partagé entre tous les clients. Remplace l'ancien champ per-org
// `OrgMileageRate.agentRatePerKm` qui reste en DB mais n'est plus lu.
//
// Lecture centralisée : toute route qui calcule un remboursement agent
// (travel-audit, my-space mileage) passe par `getGlobalAgentRatePerKm()`.
// ============================================================================

import prisma from "@/lib/prisma";

const KEY = "mileage.agentRatePerKm";
const DEFAULT_RATE = 0.55;

let cache: { value: number; loadedAt: number } | null = null;
const CACHE_TTL = 60_000; // 60 s — amortit les lectures sur hot paths

export async function getGlobalAgentRatePerKm(): Promise<number> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL) {
    return cache.value;
  }
  try {
    const row = await prisma.tenantSetting.findUnique({
      where: { key: KEY },
      select: { value: true },
    });
    const raw = (row?.value as any)?.rate;
    const n = Number(raw);
    const value = Number.isFinite(n) && n > 0 ? n : DEFAULT_RATE;
    cache = { value, loadedAt: Date.now() };
    return value;
  } catch {
    return DEFAULT_RATE;
  }
}

export async function setGlobalAgentRatePerKm(rate: number): Promise<number> {
  const value = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_RATE;
  await prisma.tenantSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: { rate: value } },
    update: { value: { rate: value } },
  });
  cache = { value, loadedAt: Date.now() };
  return value;
}
