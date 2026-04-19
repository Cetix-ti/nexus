// ============================================================================
// SEASONALITY DETECTOR — apprend les rythmes temporels d'apparition des
// tickets par client × catégorie.
//
// Chaque ticket atterrit à une heure / jour-semaine / jour-mois donné. Au
// fil du temps, des patterns émergent :
//   - "Lundi matin = pic d'AD lockouts chez VDSA"
//   - "Fin de mois = vague de tickets paie chez X"
//   - "1er du mois 8h-10h = tickets VPN chez tous les clients"
//
// L'algorithme compte les tickets dans une grille (org × category × jour
// × tranche 3h) sur 90 jours. Un ratio (observé_local / moyenne_globale)
// ≥ SEASONAL_BOOST indique un créneau "chaud".
//
// Exploitation aval :
//   - Volume anomaly detector : utilise ce baseline au lieu d'un moyen fixe
//   - Triage à la création : ajuste la priorité si le ticket arrive dans
//     un créneau hot (escalade plus probable)
//   - Rapports : "Tendances temporelles" dans les rapports client
// ============================================================================

import prisma from "@/lib/prisma";

const WINDOW_DAYS = 90;
const MIN_OCCURRENCES = 4; // en dessous, trop peu de data pour parler de pattern
const SEASONAL_BOOST = 2.0; // ratio 2× vs baseline = créneau hot

interface TimeSlot {
  dow: number;       // 0 (dim) → 6 (sam)
  hourBand: number;  // 0 (00h-03h), 1 (03h-06h), … 7 (21h-24h)
}

interface SeasonalPattern {
  orgId: string;
  categoryId: string | null;
  slots: Array<TimeSlot & { count: number; ratio: number }>;
  totalTickets: number;
}

function hourBandOf(d: Date): number {
  return Math.floor(d.getHours() / 3); // 0..7
}

export async function detectSeasonalityPatterns(): Promise<{
  orgs: number;
  patternsWritten: number;
  hotSlots: number;
}> {
  const stats = { orgs: 0, patternsWritten: 0, hotSlots: 0 };
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600_000);

  const orgs = await prisma.organization.findMany({
    where: { isActive: true, isInternal: false },
    select: { id: true },
  });

  for (const org of orgs) {
    stats.orgs++;
    const tickets = await prisma.ticket.findMany({
      where: {
        organizationId: org.id,
        createdAt: { gte: since },
        source: { notIn: ["MONITORING", "AUTOMATION"] },
      },
      select: { categoryId: true, createdAt: true },
    });
    if (tickets.length < MIN_OCCURRENCES) continue;

    // Groupe par catégorie, puis compte par (dow, hourBand)
    const byCategory = new Map<string | null, Map<string, number>>();
    const orgTotalByCat = new Map<string | null, number>();
    for (const t of tickets) {
      const dow = t.createdAt.getDay();
      const hb = hourBandOf(t.createdAt);
      const slotKey = `${dow}:${hb}`;
      const catId = t.categoryId;
      const cm = byCategory.get(catId) ?? new Map<string, number>();
      cm.set(slotKey, (cm.get(slotKey) ?? 0) + 1);
      byCategory.set(catId, cm);
      orgTotalByCat.set(catId, (orgTotalByCat.get(catId) ?? 0) + 1);
    }

    // Pour chaque catégorie, calcule la moyenne attendue par slot et
    // identifie les "hot slots" (count ≥ SEASONAL_BOOST × moyenne).
    //
    // 7 jours × 8 bandes = 56 slots. Moyenne attendue = total / 56.
    // Un slot avec 2× cette moyenne EST inhabituellement concentré.
    for (const [catId, slotMap] of byCategory) {
      const total = orgTotalByCat.get(catId) ?? 0;
      if (total < MIN_OCCURRENCES) continue;
      const meanPerSlot = total / 56;
      const threshold = Math.max(2, meanPerSlot * SEASONAL_BOOST);

      const hotSlots: SeasonalPattern["slots"] = [];
      for (const [key, count] of slotMap) {
        if (count < threshold) continue;
        const [dow, hb] = key.split(":").map(Number);
        hotSlots.push({
          dow,
          hourBand: hb,
          count,
          ratio: count / Math.max(0.1, meanPerSlot),
        });
      }

      if (hotSlots.length === 0) continue;
      hotSlots.sort((a, b) => b.ratio - a.ratio);

      try {
        await prisma.aiPattern.upsert({
          where: {
            scope_kind_key: {
              scope: `seasonality:${org.id}`,
              kind: "time_pattern",
              key: catId ?? "__all__",
            },
          },
          create: {
            scope: `seasonality:${org.id}`,
            kind: "time_pattern",
            key: catId ?? "__all__",
            value: {
              categoryId: catId,
              slots: hotSlots.slice(0, 10),
              totalTickets: total,
              meanPerSlot: Math.round(meanPerSlot * 100) / 100,
            } as never,
            sampleCount: total,
            confidence: Math.min(1, total / 30),
          },
          update: {
            value: {
              categoryId: catId,
              slots: hotSlots.slice(0, 10),
              totalTickets: total,
              meanPerSlot: Math.round(meanPerSlot * 100) / 100,
            } as never,
            sampleCount: total,
            confidence: Math.min(1, total / 30),
          },
        });
        stats.patternsWritten++;
        stats.hotSlots += hotSlots.length;
      } catch (err) {
        console.warn(`[seasonality] upsert failed for org ${org.id}:`, err);
      }
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Helper : le slot courant est-il "hot" pour cette combo org × category ?
// Utilisé par le triage pour ajuster la priorité/urgence.
// ---------------------------------------------------------------------------

export async function isHotSlot(
  orgId: string,
  categoryId: string | null,
  when: Date = new Date(),
): Promise<{ isHot: boolean; ratio: number } | null> {
  const dow = when.getDay();
  const hb = hourBandOf(when);
  const pattern = await prisma.aiPattern.findUnique({
    where: {
      scope_kind_key: {
        scope: `seasonality:${orgId}`,
        kind: "time_pattern",
        key: categoryId ?? "__all__",
      },
    },
    select: { value: true },
  });
  if (!pattern) return null;
  const v = pattern.value as { slots?: Array<{ dow: number; hourBand: number; ratio: number }> } | null;
  if (!v || !Array.isArray(v.slots)) return null;
  const match = v.slots.find((s) => s.dow === dow && s.hourBand === hb);
  if (!match) return { isHot: false, ratio: 1 };
  return { isHot: true, ratio: match.ratio };
}
