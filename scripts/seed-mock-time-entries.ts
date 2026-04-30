// ============================================================================
// Seed mock time entries — Avril 2026 — SADB / DLSN / LV
//
// Génère des saisies de temps réalistes pour faire vivre les rapports PDF
// mensuels avec des données représentatives. INSERT direct (pas via le
// service createTimeEntry) pour éviter tout effet de bord pipeline
// (notifications, SLA, budget tracker, etc.).
//
// IDs créés loggés dans /tmp/mock-time-entries-ids.json pour rollback.
//
// Rollback :
//   npx tsx -e '
//     import prisma from "./src/lib/prisma";
//     import { readFileSync } from "fs";
//     (async () => {
//       const ids = JSON.parse(readFileSync("/tmp/mock-time-entries-ids.json","utf8"));
//       const r = await prisma.timeEntry.deleteMany({ where: { id: { in: ids } } });
//       console.log(`Deleted ${r.count}`);
//       await prisma.$disconnect();
//     })();
//   '
// ============================================================================

import { config as loadEnv } from "dotenv";
loadEnv();
import { writeFileSync } from "node:fs";
import prisma from "../src/lib/prisma";

interface OrgPlan {
  slug: string;
  entriesCount: number;
  hasFlatTrip: boolean;
  flatTripFee: number | null;
}

const PLANS: OrgPlan[] = [
  { slug: "sadb", entriesCount: 12, hasFlatTrip: true, flatTripFee: 77.25 },
  { slug: "dlsn", entriesCount: 12, hasFlatTrip: false, flatTripFee: null },
  { slug: "lv",   entriesCount: 8,  hasFlatTrip: true, flatTripFee: 155 },
];

// Taux MSP standards — utilisés quand l'org n'a pas de rate tier configuré.
// Cohérent avec les taux historiques du portfolio Cetix.
const RATES = {
  day:      125,
  evening:  140,
  weekend:  175,
  urgent:   195,
};

const DESCRIPTIONS = [
  "Investigation lenteur poste utilisateur — redémarrage Windows Update + nettoyage temp",
  "Réinitialisation mot de passe Office 365 + reconfiguration Outlook",
  "Installation imprimante HP réseau LAN, configuration drivers et test impression",
  "Vérification sauvegardes Veeam — repair des points en échec, validation rétention",
  "Téléassistance utilisateur — accès partage SharePoint et permissions",
  "Diagnostic problème VPN FortiClient, mise à jour client et test connexion",
  "Changement disque SSD poste fixe + clonage Windows et restauration profil",
  "Configuration MFA pour nouvel usager + onboarding Teams/SharePoint",
  "Audit licences M365 — désactivation comptes inactifs, optimisation coûts",
  "Maintenance préventive serveur AD — patches Windows + redémarrage",
  "Investigation alerte Bitdefender sur poste — quarantaine et analyse complète",
  "Configuration nouveau switch réseau, brassage + tests connectivité VLAN",
  "Support utilisateur — récupération fichiers via Veeam (restauration ponctuelle)",
  "Mise à jour firmware FortiGate + redémarrage + validation tunnels VPN",
  "Téléphonie IP — diagnostic ligne morte poste réception, reset PoE",
  "Configuration Exchange Online — règles antispam et politiques de transport",
  "Déploiement nouveau poste utilisateur (image standard + Office + applications)",
  "Investigation problème synchronisation OneDrive — re-link compte",
  "Migration boîte courriel — export PST + import vers nouveau tenant",
  "Surveillance proactive — vérification logs systèmes et alertes Wazuh",
];

interface Agent {
  id: string;
  name: string;
}

interface Bucket {
  type: "day" | "evening" | "weekend" | "urgent";
  isAfterHours: boolean;
  isWeekend: boolean;
  isUrgent: boolean;
  hourlyRate: number;
}

function pickBucket(rng: () => number): Bucket {
  const r = rng();
  if (r < 0.7) return { type: "day", isAfterHours: false, isWeekend: false, isUrgent: false, hourlyRate: RATES.day };
  if (r < 0.85) return { type: "evening", isAfterHours: true, isWeekend: false, isUrgent: false, hourlyRate: RATES.evening };
  if (r < 0.95) return { type: "weekend", isAfterHours: false, isWeekend: true, isUrgent: false, hourlyRate: RATES.weekend };
  return { type: "urgent", isAfterHours: false, isWeekend: false, isUrgent: true, hourlyRate: RATES.urgent };
}

/**
 * Construit un Date dans un bucket donné, à l'intérieur d'avril 2026.
 *  - day     : lun-ven, 9h-16h
 *  - evening : lun-ven, 18h-21h
 *  - weekend : sam-dim, 9h-17h
 *  - urgent  : random — utilise ses propres flags, peu importe le moment
 */
function pickDate(bucket: Bucket, rng: () => number): Date {
  const month = 3; // April (0-indexed)
  const year = 2026;
  // 1..30
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  // Filtre selon le bucket
  let candidates: number[];
  if (bucket.isWeekend) {
    candidates = days.filter((d) => {
      const dow = new Date(year, month, d).getDay();
      return dow === 0 || dow === 6;
    });
  } else if (bucket.isAfterHours || (bucket.type === "day")) {
    candidates = days.filter((d) => {
      const dow = new Date(year, month, d).getDay();
      return dow !== 0 && dow !== 6;
    });
  } else {
    candidates = days; // urgent : n'importe quand
  }
  const day = candidates[Math.floor(rng() * candidates.length)];

  let hour = 10;
  let minute = 0;
  if (bucket.type === "day") { hour = 9 + Math.floor(rng() * 7); minute = [0, 15, 30, 45][Math.floor(rng() * 4)]; }
  else if (bucket.type === "evening") { hour = 18 + Math.floor(rng() * 4); minute = [0, 15, 30, 45][Math.floor(rng() * 4)]; }
  else if (bucket.type === "weekend") { hour = 9 + Math.floor(rng() * 8); minute = [0, 15, 30, 45][Math.floor(rng() * 4)]; }
  else { hour = Math.floor(rng() * 24); minute = [0, 15, 30, 45][Math.floor(rng() * 4)]; }

  return new Date(year, month, day, hour, minute, 0, 0);
}

// PRNG seedable pour reproductibilité (utile en debug)
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const rng = mulberry32(42);
  const allCreatedIds: string[] = [];

  // 1) Charger orgs cibles + work types + billing config (pour le taux
  // de banque d'heures s'il est défini sur l'org).
  const orgs = await prisma.organization.findMany({
    where: { slug: { in: PLANS.map((p) => p.slug) } },
    select: {
      id: true,
      slug: true,
      name: true,
      orgBillingConfig: true,
      workTypes: {
        where: { isActive: true },
        select: { id: true, label: true, timeType: true },
      },
      rateTiers: {
        where: { isActive: true },
        select: { id: true, label: true, hourlyRate: true },
      },
    },
  });
  const orgBySlug = new Map(orgs.map((o) => [o.slug, o]));

  // 2) Charger staff actif
  const staff: Agent[] = (
    await prisma.user.findMany({
      where: {
        isActive: true,
        role: { notIn: ["CLIENT_ADMIN", "CLIENT_USER", "READ_ONLY"] },
      },
      select: { id: true, firstName: true, lastName: true },
    })
  ).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() }));

  console.log(`Staff disponible (${staff.length}): ${staff.map((s) => s.name).join(", ")}`);

  for (const plan of PLANS) {
    const org = orgBySlug.get(plan.slug);
    if (!org) {
      console.warn(`! Org ${plan.slug} introuvable, skip`);
      continue;
    }
    console.log(`\n=== ${org.name} (${plan.slug}) — ${plan.entriesCount} entries ===`);

    // 3) Tickets disponibles avril 2026 — on en prend 5-7 distincts
    const tickets = await prisma.ticket.findMany({
      where: {
        organizationId: org.id,
        createdAt: { gte: new Date(2026, 3, 1), lt: new Date(2026, 4, 1) },
        subject: { not: "" },
      },
      select: { id: true, number: true, subject: true },
      orderBy: { createdAt: "asc" },
    });
    if (tickets.length === 0) {
      console.warn(`  Aucun ticket dispo, skip`);
      continue;
    }
    // Choix de 5-7 tickets distincts (random sample)
    const ticketSampleSize = Math.min(7, Math.max(5, Math.ceil(plan.entriesCount / 2)), tickets.length);
    const shuffled = [...tickets].sort(() => rng() - 0.5);
    const chosenTickets = shuffled.slice(0, ticketSampleSize);
    console.log(`  Tickets choisis (${chosenTickets.length}): ${chosenTickets.map((t) => `TK-${t.number}`).join(", ")}`);

    // Préparer la rotation des agents (5 agents par org pour bonne diversité)
    const agentPool = [...staff].sort(() => rng() - 0.5).slice(0, Math.min(5, staff.length));

    // Work types
    const wtRemote = org.workTypes.find((w) => w.timeType === "remote_work");
    const wtOnsite = org.workTypes.find((w) => w.timeType === "onsite_work");
    if (!wtRemote || !wtOnsite) {
      console.warn(`  Work types manquants pour ${plan.slug}, skip`);
      continue;
    }

    let travelCount = 0;
    const travelTarget = Math.ceil(plan.entriesCount * 0.25); // ~25% des entries = onsite avec travel

    for (let i = 0; i < plan.entriesCount; i++) {
      const bucket = pickBucket(rng);
      const startedAt = pickDate(bucket, rng);
      // Durée typique : 0.25h à 3h, en multiples de 15 min
      const minutesChoices = [15, 30, 45, 60, 75, 90, 120, 150, 180];
      const durationMinutes = minutesChoices[Math.floor(rng() * minutesChoices.length)];
      const endedAt = new Date(startedAt.getTime() + durationMinutes * 60_000);

      // Onsite vs remote : ~40% onsite si on n'a pas atteint le quota travel
      const goOnsite = travelCount < travelTarget && rng() < 0.55;
      const workType = goOnsite ? wtOnsite : wtRemote;
      const hasTravelBilled = goOnsite && (plan.hasFlatTrip || rng() < 0.7); // travel facturable surtout si flat fee défini
      if (hasTravelBilled) travelCount++;
      const travelDurationMinutes = goOnsite ? [30, 45, 60, 75, 90][Math.floor(rng() * 5)] : null;

      const agent = agentPool[i % agentPool.length];
      const ticket = chosenTickets[i % chosenTickets.length];

      // Choix du taux et du coverage status — par ordre de priorité :
      //   1. Banque d'heures configurée (orgBillingConfig.hourBank.rate) →
      //      coverage="deducted_from_hour_bank" + taux banque.
      //   2. Rate tier configuré sur l'org → taux du tier (rotation).
      //   3. Sinon → taux MSP standard selon le bucket horaire,
      //      coverage="billable".
      // Le forceNonBillable et msp_overage ne sont pas simulés ici (pour
      // garder le mock simple). Les rapports verront 100% billable ou
      // 100% inclus selon la config de l'org.
      let hourlyRate = bucket.hourlyRate;
      let rateTierId: string | null = null;
      let coverageStatus: "billable" | "deducted_from_hour_bank" = "billable";
      let coverageReason = "Pas de forfait actif — taux horaire standard";
      const billingCfg = (org.orgBillingConfig ?? null) as
        | { hourBank?: { hourlyRate?: number; totalHours?: number; overageRate?: number } }
        | null;
      const hbRate = billingCfg?.hourBank?.hourlyRate;
      if (typeof hbRate === "number" && hbRate > 0) {
        hourlyRate = hbRate;
        coverageStatus = "deducted_from_hour_bank";
        coverageReason = `Banque d'heures (forfait ${billingCfg?.hourBank?.totalHours ?? "?"}h/an)`;
      } else if (org.rateTiers.length > 0) {
        const tier = org.rateTiers[i % org.rateTiers.length];
        rateTierId = tier.id;
        hourlyRate = tier.hourlyRate;
      }

      const amount = Math.round((durationMinutes / 60) * hourlyRate * 100) / 100;
      const description = DESCRIPTIONS[Math.floor(rng() * DESCRIPTIONS.length)];

      const created = await prisma.timeEntry.create({
        data: {
          ticketId: ticket.id,
          organizationId: org.id,
          agentId: agent.id,
          workTypeId: workType.id,
          rateTierId,
          timeType: workType.timeType,
          startedAt,
          endedAt,
          durationMinutes,
          description,
          isAfterHours: bucket.isAfterHours,
          isWeekend: bucket.isWeekend,
          isUrgent: bucket.isUrgent,
          isOnsite: goOnsite,
          hasTravelBilled,
          travelDurationMinutes,
          coverageStatus,
          coverageReason,
          hourlyRate,
          amount,
          // Approbation : "approved" pour que les saisies apparaissent
          // immédiatement dans les rapports (sinon EXCLUDED_APPROVAL_STATUSES
          // les filtre).
          approvalStatus: "approved",
        },
        select: { id: true },
      });
      allCreatedIds.push(created.id);

      const dateStr = startedAt.toISOString().slice(0, 16).replace("T", " ");
      console.log(
        `  [${i + 1}/${plan.entriesCount}] ${dateStr} ${agent.name.padEnd(20)} TK-${ticket.number} ${workType.timeType.padEnd(11)} ${bucket.type.padEnd(8)} ${durationMinutes}min ${amount}$${hasTravelBilled ? " 🚗" : ""}`,
      );
    }
  }

  // 4) Persister la liste des IDs créés pour rollback
  writeFileSync("/tmp/mock-time-entries-ids.json", JSON.stringify(allCreatedIds, null, 2));
  console.log(
    `\n✓ ${allCreatedIds.length} time entries créées. IDs sauvegardés dans /tmp/mock-time-entries-ids.json`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
