// ============================================================================
// LIB PARTAGÉE — Maintenance Atera (purge des actifs inactifs)
// ============================================================================
// Logique métier réutilisée par :
//   - le script CLI (scripts/atera-purge-inactive.ts)
//   - les routes API (/api/v1/integrations/atera/...)
//   - l'UI Settings → Intégrations → Atera → Maintenance
//
// Toute modification de la logique de filtrage / purge doit se faire ici.

import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import {
  listAllAteraAgents,
  deleteAteraAgent,
  invalidateAteraAgentsCache,
  type AteraAgent,
} from "@/lib/integrations/atera-client";

// ----------------------------------------------------------------------------
// Types publics
// ----------------------------------------------------------------------------

export type LinkedAssetAction = "archive" | "keep" | "delete" | "none";

export interface InactiveAgentLinkedAsset {
  id: string;
  name: string;
  status: string;
  ticketCount: number;
  noteCount: number;
  licenseCount: number;
  /// True si la suppression de l'asset Nexus est bloquée à cause de
  /// liens existants (tickets / notes / licences). Bloque seulement
  /// l'option "delete", pas "archive" ni "keep".
  hasBlockingLinks: boolean;
}

export interface InactiveAgent {
  agentId: number;
  deviceGuid?: string;
  machineName: string;
  customerId: number;
  customerName: string;
  osType: string;
  online: boolean;
  /// Dernière activité connue (max de LastSeen / Modified / LastRebootTime)
  lastActivityAt: string | null;
  /// Champ Atera utilisé pour `lastActivityAt` (utile pour audit/debug)
  lastActivityField: string;
  daysSinceLastSeen: number | null;
  /// Snapshot de l'exclusion active si l'agent est whitelisté
  excluded:
    | null
    | {
        reason: string;
        expiresAt: string | null;
        addedAt: string;
        addedById: string;
      };
  linkedAsset: InactiveAgentLinkedAsset | null;
}

export interface FindInactiveOptions {
  /// Seuil d'inactivité en jours (default 365)
  days?: number;
  /// Filtre par CustomerID Atera
  customerIds?: number[];
  /// Filtre par OSType (matching insensible à la casse, sous-chaîne)
  osTypes?: string[];
  /// Inclure aussi les agents en ligne (default false). Utile pour audit/debug.
  includeOnline?: boolean;
  /// Inclure aussi les agents exclus (whitelist) dans la liste retournée,
  /// avec leur snapshot d'exclusion. Default true (l'UI les affiche
  /// barrés/grisés). Mettre à false pour la CLI/exécution.
  includeExcluded?: boolean;
  /// Callback de progression du téléchargement Atera (paginé)
  onPage?: (page: number, totalPages: number) => void;
}

export interface PurgeResult {
  batchId: string;
  totalRequested: number;
  okCount: number;
  errorCount: number;
  skippedCount: number;
  errors: { agentId: number; error: string }[];
  skipped: { agentId: number; reason: string }[];
}

export interface PurgeOptions {
  agentIds: number[];
  actorUserId: string;
  reason?: string;
  /// Action sur l'asset Nexus lié (default "archive")
  linkedAssetAction?: LinkedAssetAction;
  ipAddress?: string;
  userAgent?: string;
  /// Délai entre chaque DELETE Atera (ms). Default 250 (≈4/s, sous le quota).
  rateLimitMs?: number;
  /// Callback appelé après chaque agent (pour barre de progression)
  onProgress?: (done: number, total: number) => void;
}

// ----------------------------------------------------------------------------
// Helpers internes
// ----------------------------------------------------------------------------

function getLastActivity(a: AteraAgent): { date: Date | null; field: string } {
  const candidates: { field: string; raw?: string }[] = [
    { field: "LastSeen", raw: a.LastSeen },
    { field: "Modified", raw: a.Modified },
    { field: "LastRebootTime", raw: a.LastRebootTime },
  ];
  let best: { date: Date; field: string } | null = null;
  for (const c of candidates) {
    if (!c.raw) continue;
    const d = new Date(c.raw);
    if (Number.isNaN(d.getTime())) continue;
    if (!best || d > best.date) best = { date: d, field: c.field };
  }
  return best ? { date: best.date, field: best.field } : { date: null, field: "—" };
}

/**
 * Charge les exclusions actives (non expirées) sous forme de Map indexée par agentId.
 */
async function loadActiveExclusions(): Promise<Map<number, {
  reason: string;
  expiresAt: Date | null;
  addedAt: Date;
  addedById: string;
}>> {
  const now = new Date();
  const rows = await prisma.ateraExclusion.findMany({
    where: {
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  const map = new Map<number, {
    reason: string;
    expiresAt: Date | null;
    addedAt: Date;
    addedById: string;
  }>();
  for (const r of rows) {
    map.set(r.agentId, {
      reason: r.reason,
      expiresAt: r.expiresAt,
      addedAt: r.createdAt,
      addedById: r.addedById,
    });
  }
  return map;
}

/**
 * Pour une liste d'AgentID Atera, retourne la map AgentID -> asset Nexus lié
 * (incl. décompte de tickets/notes/licences pour décider si on peut deleter).
 */
async function loadLinkedAssets(
  agentIds: number[]
): Promise<Map<number, InactiveAgentLinkedAsset>> {
  if (agentIds.length === 0) return new Map();

  // L'externalId est stocké en string ; le code historique utilisait `atera_<id>`
  // ou juste `<id>` (cf. cleanup-atera-duplicates.ts). On essaie les deux pour
  // tomber sur les rows qui auraient échappé au cleanup.
  const idStrings = agentIds.flatMap((id) => [String(id), `atera_${id}`]);

  const assets = await prisma.asset.findMany({
    where: {
      externalSource: "atera",
      externalId: { in: idStrings },
    },
    select: {
      id: true,
      name: true,
      status: true,
      externalId: true,
      _count: {
        select: {
          tickets: true,
          assetNotes: true,
          softwareLicenses: true,
        },
      },
    },
  });

  const map = new Map<number, InactiveAgentLinkedAsset>();
  for (const a of assets) {
    if (!a.externalId) continue;
    const parsedId = Number(a.externalId.replace(/^atera_/, ""));
    if (!Number.isFinite(parsedId)) continue;
    const ticketCount = a._count.tickets;
    const noteCount = a._count.assetNotes;
    const licenseCount = a._count.softwareLicenses;
    map.set(parsedId, {
      id: a.id,
      name: a.name,
      status: a.status,
      ticketCount,
      noteCount,
      licenseCount,
      hasBlockingLinks: ticketCount + noteCount + licenseCount > 0,
    });
  }
  return map;
}

// ----------------------------------------------------------------------------
// API publique — Découverte des agents inactifs
// ----------------------------------------------------------------------------

/**
 * Récupère TOUS les agents Atera, croise avec les exclusions Nexus + assets
 * liés, puis filtre selon le seuil d'inactivité.
 */
export async function findInactiveAgents(
  opts: FindInactiveOptions = {}
): Promise<InactiveAgent[]> {
  const days = opts.days ?? 365;
  const includeOnline = !!opts.includeOnline;
  const includeExcluded = opts.includeExcluded !== false; // default true
  const customerIds = opts.customerIds && opts.customerIds.length > 0
    ? new Set(opts.customerIds)
    : null;
  const osTypes = opts.osTypes && opts.osTypes.length > 0
    ? opts.osTypes.map((t) => t.toLowerCase())
    : null;

  const [agents, exclusions] = await Promise.all([
    listAllAteraAgents({ onPage: opts.onPage }),
    loadActiveExclusions(),
  ]);

  const now = Date.now();
  const thresholdMs = days * 24 * 60 * 60 * 1000;

  const filtered: AteraAgent[] = agents.filter((a) => {
    if (customerIds && !customerIds.has(a.CustomerID)) return false;
    if (osTypes) {
      const os = (a.OSType || "").toLowerCase();
      if (!osTypes.some((t) => os.includes(t))) return false;
    }
    if (!includeOnline && a.Online) return false;
    return true;
  });

  // Crée une projection préliminaire pour calculer les agentIds à inspecter
  // côté Nexus (linked assets).
  const preliminary = filtered.map((a) => {
    const { date, field } = getLastActivity(a);
    const daysSince = date ? Math.floor((now - date.getTime()) / 86_400_000) : null;
    const isOld = date ? now - date.getTime() > thresholdMs : false;
    const excluded = exclusions.get(a.AgentID) ?? null;
    return { a, date, field, daysSince, isOld, excluded };
  });

  // Sélection finale : seuil d'inactivité + filtre exclusions
  const candidates = preliminary.filter((p) => {
    if (!includeOnline && p.a.Online) return false;
    if (!p.isOld) return false;
    if (!includeExcluded && p.excluded) return false;
    return true;
  });

  const linkedAssets = await loadLinkedAssets(candidates.map((c) => c.a.AgentID));

  return candidates.map<InactiveAgent>((c) => ({
    agentId: c.a.AgentID,
    deviceGuid: c.a.DeviceGuid,
    machineName: c.a.MachineName || c.a.AgentName || `Agent-${c.a.AgentID}`,
    customerId: c.a.CustomerID,
    customerName: c.a.CustomerName || `Customer ${c.a.CustomerID}`,
    osType: c.a.OSType || "—",
    online: !!c.a.Online,
    lastActivityAt: c.date ? c.date.toISOString() : null,
    lastActivityField: c.field,
    daysSinceLastSeen: c.daysSince,
    excluded: c.excluded
      ? {
          reason: c.excluded.reason,
          expiresAt: c.excluded.expiresAt?.toISOString() ?? null,
          addedAt: c.excluded.addedAt.toISOString(),
          addedById: c.excluded.addedById,
        }
      : null,
    linkedAsset: linkedAssets.get(c.a.AgentID) ?? null,
  }));
}

// ----------------------------------------------------------------------------
// Verrou anti-purges concurrentes (Postgres advisory lock)
// ----------------------------------------------------------------------------
// Clé arbitraire stable de 64 bits — différente de tout autre lock applicatif.
// Le lock est session-scoped : si le process Node crashe, Postgres le libère
// automatiquement à la fermeture de la connexion.
// Construit via BigInt() plutôt que littéral `123n` car le target TS du projet
// est < ES2020 et n'accepte pas la syntaxe littérale.
const ATERA_PURGE_LOCK_KEY = BigInt("7382749001");

/**
 * Erreur levée quand une autre purge est déjà en cours dans une autre
 * session/instance Nexus. L'API doit la traduire en HTTP 409.
 */
export class AteraPurgeAlreadyRunningError extends Error {
  constructor() {
    super("Une autre purge Atera est déjà en cours.");
    this.name = "AteraPurgeAlreadyRunningError";
  }
}

async function acquirePurgeLock(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT pg_try_advisory_lock(${ATERA_PURGE_LOCK_KEY}) AS ok
  `;
  return rows[0]?.ok === true;
}

async function releasePurgeLock(): Promise<void> {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${ATERA_PURGE_LOCK_KEY})`;
}

// ----------------------------------------------------------------------------
// API publique — Purge
// ----------------------------------------------------------------------------

/**
 * Supprime une liste d'agents Atera et applique l'action choisie sur les
 * assets Nexus liés. Crée un AteraPurgeLog par agent (ok ou erreur), tous
 * partageant le même batchId.
 *
 * Sécurités appliquées :
 *  - Skip auto des agents whitelistés (même si présents dans agentIds)
 *  - Skip + log "blocked_by_links" si linkedAssetAction='delete' ET
 *    l'asset Nexus a des tickets/notes/licences
 *  - Pause `rateLimitMs` entre chaque DELETE Atera
 *  - Erreur 404 traitée comme `already_deleted` (succès idempotent)
 */
export async function purgeAgents(opts: PurgeOptions): Promise<PurgeResult> {
  const action: LinkedAssetAction = opts.linkedAssetAction ?? "archive";
  const rateLimitMs = opts.rateLimitMs ?? 250;
  const batchId = randomUUID();

  // Verrou : refuse si une autre purge tourne déjà.
  const acquired = await acquirePurgeLock();
  if (!acquired) {
    throw new AteraPurgeAlreadyRunningError();
  }

  try {
    return await runPurge({ ...opts, batchId, action, rateLimitMs });
  } finally {
    await releasePurgeLock().catch(() => undefined);
  }
}

/**
 * Cœur de la purge — tout le code qui suit était inline dans `purgeAgents`.
 * Extrait pour pouvoir l'envelopper dans le verrou advisory.
 */
async function runPurge(
  opts: PurgeOptions & {
    batchId: string;
    action: LinkedAssetAction;
    rateLimitMs: number;
  }
): Promise<PurgeResult> {
  const { batchId, action, rateLimitMs } = opts;
  const agentIds = [...new Set(opts.agentIds)]; // dédup
  const exclusions = await loadActiveExclusions();
  const linkedAssets = await loadLinkedAssets(agentIds);

  // Pour chaque agent on a besoin de quelques infos snapshot. On refait un
  // listAll pour disposer des champs (machineName, customerName, lastSeen).
  // Coût acceptable car la purge est une opé manuelle peu fréquente.
  const allAgents = await listAllAteraAgents();
  const agentMap = new Map(allAgents.map((a) => [a.AgentID, a]));

  const result: PurgeResult = {
    batchId,
    totalRequested: agentIds.length,
    okCount: 0,
    errorCount: 0,
    skippedCount: 0,
    errors: [],
    skipped: [],
  };

  for (let i = 0; i < agentIds.length; i++) {
    const agentId = agentIds[i];
    const sample = agentMap.get(agentId);
    const linked = linkedAssets.get(agentId) ?? null;

    // 1) Skip si exclusion active
    if (exclusions.has(agentId)) {
      result.skippedCount++;
      result.skipped.push({ agentId, reason: "excluded_by_whitelist" });
      await prisma.ateraPurgeLog.create({
        data: {
          batchId,
          agentId,
          deviceGuid: sample?.DeviceGuid,
          machineName: sample?.MachineName ?? sample?.AgentName,
          customerName: sample?.CustomerName,
          osType: sample?.OSType,
          lastSeenAt: sample ? getLastActivity(sample).date : null,
          daysSinceLastSeen: null,
          purgedById: opts.actorUserId,
          reason: opts.reason,
          ipAddress: opts.ipAddress,
          userAgent: opts.userAgent,
          linkedAssetId: linked?.id,
          linkedAssetAction: "none",
          status: "skipped_excluded",
        },
      });
      opts.onProgress?.(i + 1, agentIds.length);
      continue;
    }

    // 2) Skip si action=delete demandée mais asset a des liens bloquants
    if (action === "delete" && linked && linked.hasBlockingLinks) {
      result.skippedCount++;
      result.skipped.push({ agentId, reason: "asset_has_blocking_links" });
      await prisma.ateraPurgeLog.create({
        data: {
          batchId,
          agentId,
          deviceGuid: sample?.DeviceGuid,
          machineName: sample?.MachineName ?? sample?.AgentName,
          customerName: sample?.CustomerName,
          osType: sample?.OSType,
          lastSeenAt: sample ? getLastActivity(sample).date : null,
          purgedById: opts.actorUserId,
          reason: opts.reason,
          ipAddress: opts.ipAddress,
          userAgent: opts.userAgent,
          linkedAssetId: linked.id,
          linkedAssetAction: "none",
          status: "skipped_blocked_by_links",
        },
      });
      opts.onProgress?.(i + 1, agentIds.length);
      continue;
    }

    // 3) DELETE côté Atera
    let status: string = "ok";
    let errorMessage: string | undefined;
    try {
      await deleteAteraAgent(agentId);
      result.okCount++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 404 = déjà supprimé → idempotent OK
      if (/\b404\b/.test(msg)) {
        status = "already_deleted";
        result.okCount++;
      } else {
        status = "error";
        errorMessage = msg;
        result.errorCount++;
        result.errors.push({ agentId, error: msg });
      }
    }

    // 4) Action sur asset Nexus (uniquement si DELETE Atera a réussi)
    let appliedAction: LinkedAssetAction = "none";
    if (status !== "error" && linked) {
      try {
        if (action === "archive") {
          // Marque "status" comme overridden : si Atera réassignait un jour le
          // même AgentID à un autre device, atera-sync respecterait notre
          // RETIRED au lieu de le flipper en ACTIVE/INACTIVE.
          await prisma.asset.update({
            where: { id: linked.id },
            data: {
              status: "RETIRED",
              fieldOverrides: { push: "status" },
            },
          });
          appliedAction = "archive";
        } else if (action === "delete" && !linked.hasBlockingLinks) {
          await prisma.asset.delete({ where: { id: linked.id } });
          appliedAction = "delete";
        } else if (action === "keep") {
          appliedAction = "keep";
        }
      } catch (assetErr) {
        // L'agent Atera est déjà supprimé — on ne refuse pas le batch pour
        // autant. On marque l'action comme "none" et on log l'erreur.
        const m = assetErr instanceof Error ? assetErr.message : String(assetErr);
        errorMessage = errorMessage
          ? `${errorMessage} | asset: ${m}`
          : `asset: ${m}`;
      }
    }

    // 5) Trace audit
    const lastActivity = sample ? getLastActivity(sample) : { date: null, field: "—" };
    const days = lastActivity.date
      ? Math.floor((Date.now() - lastActivity.date.getTime()) / 86_400_000)
      : null;
    await prisma.ateraPurgeLog.create({
      data: {
        batchId,
        agentId,
        deviceGuid: sample?.DeviceGuid,
        machineName: sample?.MachineName ?? sample?.AgentName,
        customerName: sample?.CustomerName,
        osType: sample?.OSType,
        lastSeenAt: lastActivity.date,
        daysSinceLastSeen: days,
        purgedById: opts.actorUserId,
        reason: opts.reason,
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
        linkedAssetId: linked?.id,
        linkedAssetAction: appliedAction,
        status,
        errorMessage,
      },
    });

    opts.onProgress?.(i + 1, agentIds.length);

    // 6) Rate-limit anti quota Atera (sauf sur le dernier)
    if (i < agentIds.length - 1) {
      await new Promise((r) => setTimeout(r, rateLimitMs));
    }
  }

  // Invalider le cache : les agents supprimés ne doivent plus apparaître
  // au prochain listAllAteraAgents (ex: re-Analyser juste après la purge).
  invalidateAteraAgentsCache();

  return result;
}

// ----------------------------------------------------------------------------
// API publique — Exclusions
// ----------------------------------------------------------------------------

export interface ExclusionInput {
  agentId: number;
  machineName?: string;
  customerName?: string;
  reason: string;
  expiresAt?: Date | null;
  addedById: string;
}

export async function listExclusions() {
  return prisma.ateraExclusion.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      addedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
}

export async function addExclusion(input: ExclusionInput) {
  return prisma.ateraExclusion.upsert({
    where: { agentId: input.agentId },
    create: {
      agentId: input.agentId,
      machineName: input.machineName,
      customerName: input.customerName,
      reason: input.reason,
      expiresAt: input.expiresAt ?? null,
      addedById: input.addedById,
    },
    update: {
      machineName: input.machineName,
      customerName: input.customerName,
      reason: input.reason,
      expiresAt: input.expiresAt ?? null,
      addedById: input.addedById,
    },
  });
}

export async function removeExclusion(agentId: number) {
  return prisma.ateraExclusion
    .delete({ where: { agentId } })
    .catch(() => null);
}

// ----------------------------------------------------------------------------
// API publique — Destinataires des alertes
// ----------------------------------------------------------------------------

export async function listAlertRecipients() {
  return prisma.ateraAlertRecipient.findMany({
    where: { enabled: true },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Résout la liste effective d'emails à notifier après une purge.
 * Combine :
 *  - les destinataires explicites (table atera_alert_recipients)
 *  - les super-admins par défaut si aucun destinataire n'est configuré
 */
export async function resolveAlertEmails(): Promise<string[]> {
  const explicit = await prisma.ateraAlertRecipient.findMany({
    where: { enabled: true },
    include: { user: { select: { email: true } } },
  });
  const emails = new Set<string>();
  for (const r of explicit) {
    if (r.email) emails.add(r.email);
    if (r.user?.email) emails.add(r.user.email);
  }
  if (emails.size === 0) {
    // Fallback : super-admins
    const supers = await prisma.user.findMany({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { email: true },
    });
    for (const u of supers) if (u.email) emails.add(u.email);
  }
  return [...emails];
}
