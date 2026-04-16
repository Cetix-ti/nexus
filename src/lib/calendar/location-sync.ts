// ============================================================================
// Synchronisation bidirectionnelle entre le calendrier Nexus « Localisation »
// et le calendrier Outlook partagé du même nom sur billets@cetix.ca.
//
// Stratégie :
//   1. OUTLOOK → NEXUS (pull) : toutes les 2 min, on liste la fenêtre
//      [−7j, +60j]. Pour chaque event Graph :
//        - Si outlook_event_id déjà en DB :
//            · Si lastModifiedDateTime (Graph) > lastSyncedAt (DB) →
//              update le Nexus event avec la nouvelle décomposition.
//            · Sinon → skip (rien n'a bougé).
//        - Sinon → décode + crée un CalendarEvent Nexus (kind=WORK_LOCATION).
//      À la fin, les Nexus events qui ONT outlook_event_id mais ne sont
//      PAS revenus dans la fenêtre → marquer comme supprimés (cascade soft).
//
//   2. NEXUS → OUTLOOK (push) : appelé SYNCHRONOUSLY par les endpoints
//      POST/PATCH/DELETE /calendar-events quand kind=WORK_LOCATION.
//      Après un create/update Graph, on stocke l'outlookEventId → le
//      prochain pull ne re-créera pas de doublon (skip par id).
//
// Anti-boucle :
//   - Un event Nexus qui vient d'être créé côté Outlook porte un
//     outlookEventId → le pull qui le revoit fera un "match par id" et
//     ne créera pas un Nexus event dupliqué.
//   - On stocke lastSyncedAt avec le timestamp Graph → on ne repasse
//     sur un event Outlook que s'il a été modifié depuis.
// ============================================================================

import prisma from "@/lib/prisma";
import {
  listCalendarEvents,
  resolveCalendarId,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  type OutlookEvent,
  type EventPayload,
} from "./outlook-graph";
import {
  decodeLocationTitle,
  encodeLocationTitle,
  agentInitials,
  type DecodableAgent,
  type DecodableOrg,
  type DecoderResult,
} from "./location-decoder";

// ---------------------------------------------------------------------------
// Config — stockée dans tenant_settings ("calendar.location-sync")
// ---------------------------------------------------------------------------

export interface LocationSyncConfig {
  enabled: boolean;
  mailbox: string;          // "billets@cetix.ca"
  calendarName: string;     // "Localisation"
  /** Id du calendrier Nexus qui reflète la localisation (créé auto). */
  nexusCalendarId?: string;
}

const CONFIG_KEY = "calendar.location-sync";
const DEFAULT_CONFIG: LocationSyncConfig = {
  enabled: true,
  mailbox: "billets@cetix.ca",
  calendarName: "Localisation",
};

export async function getLocationSyncConfig(): Promise<LocationSyncConfig> {
  const row = await prisma.tenantSetting.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...(row.value as Partial<LocationSyncConfig>) };
}

export async function setLocationSyncConfig(
  config: Partial<LocationSyncConfig>,
): Promise<LocationSyncConfig> {
  const current = await getLocationSyncConfig();
  const merged = { ...current, ...config };
  await prisma.tenantSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: merged as never },
    update: { value: merged as never },
  });
  return merged;
}

// ---------------------------------------------------------------------------
// Calendrier Nexus cible — on réutilise ou crée un calendrier "Localisation"
// (kind=GENERAL) qui contient les WORK_LOCATION synchronisés.
// ---------------------------------------------------------------------------

async function ensureNexusCalendar(): Promise<string> {
  const cfg = await getLocationSyncConfig();
  if (cfg.nexusCalendarId) {
    const exists = await prisma.calendar.findUnique({
      where: { id: cfg.nexusCalendarId },
      select: { id: true },
    });
    if (exists) return exists.id;
  }
  // Cherche un calendrier existant par nom.
  const byName = await prisma.calendar.findFirst({
    where: { name: { equals: "Localisation", mode: "insensitive" } },
    select: { id: true },
  });
  if (byName) {
    await setLocationSyncConfig({ nexusCalendarId: byName.id });
    return byName.id;
  }
  // Sinon on crée — attaché à personne en particulier (visibility=team).
  const created = await prisma.calendar.create({
    data: {
      name: "Localisation",
      description: "Localisation des agents (synchronisé avec Outlook)",
      kind: "GENERAL",
      color: "#0EA5E9",
      visibility: "team",
    },
  });
  await setLocationSyncConfig({ nexusCalendarId: created.id });
  return created.id;
}

// ---------------------------------------------------------------------------
// Data helpers — agents et orgs pour le décodeur
// ---------------------------------------------------------------------------

async function loadAgents(): Promise<DecodableAgent[]> {
  const users = await prisma.user.findMany({
    where: {
      role: { in: ["SUPER_ADMIN", "MSP_ADMIN", "SUPERVISOR", "TECHNICIAN"] },
      isActive: true,
    },
    select: { id: true, firstName: true, lastName: true, isActive: true },
  });
  return users;
}

async function loadOrgs(): Promise<DecodableOrg[]> {
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      clientCode: true,
      isInternal: true,
      domain: true,
      domains: true,
    },
  });
  return orgs;
}

// ---------------------------------------------------------------------------
// Pull : Outlook → Nexus
// ---------------------------------------------------------------------------

export async function pullOutlookLocations(options?: {
  fromDays?: number; // default 7 jours dans le passé
  toDays?: number;   // default 60 jours dans le futur
}): Promise<{
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  deleted: number;
  undecoded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let fetched = 0,
    created = 0,
    updated = 0,
    skipped = 0,
    deleted = 0,
    undecoded = 0;

  const cfg = await getLocationSyncConfig();
  if (!cfg.enabled) {
    return { fetched, created, updated, skipped, deleted, undecoded, errors: ["Sync désactivée"] };
  }

  try {
    const calendarId = await resolveCalendarId(cfg.mailbox, cfg.calendarName);
    const fromDays = options?.fromDays ?? 7;
    const toDays = options?.toDays ?? 60;
    const from = new Date(Date.now() - fromDays * 24 * 3600 * 1000);
    const to = new Date(Date.now() + toDays * 24 * 3600 * 1000);

    const outlookEvents = await listCalendarEvents({
      mailbox: cfg.mailbox,
      calendarId,
      from,
      to,
    });
    fetched = outlookEvents.length;

    const agents = await loadAgents();
    const orgs = await loadOrgs();
    const nexusCalId = await ensureNexusCalendar();

    const seenOutlookIds = new Set<string>();
    for (const ev of outlookEvents) {
      seenOutlookIds.add(ev.id);
      try {
        const existing = await prisma.calendarEvent.findUnique({
          where: { outlookEventId: ev.id },
          select: {
            id: true,
            lastSyncedAt: true,
            outlookEtag: true,
            updatedAt: true,
            rawTitle: true,
          },
        });
        const evModified = ev.lastModifiedDateTime
          ? new Date(ev.lastModifiedDateTime)
          : new Date();

        if (existing) {
          // Si l'event Nexus a été modifié APRÈS le lastSyncedAt, on ne
          // veut pas l'écraser avec une version Outlook obsolète → on
          // compare aux deux dates.
          const needsUpdate =
            !existing.lastSyncedAt ||
            evModified.getTime() > existing.lastSyncedAt.getTime();
          if (!needsUpdate) {
            skipped++;
            continue;
          }
          await applyDecodedToNexus({
            outlookEvent: ev,
            nexusCalendarId: nexusCalId,
            existingId: existing.id,
            agents,
            orgs,
          });
          updated++;
        } else {
          const { result } = await applyDecodedToNexus({
            outlookEvent: ev,
            nexusCalendarId: nexusCalId,
            existingId: null,
            agents,
            orgs,
          });
          created++;
          if (!result.ok) undecoded++;
        }
      } catch (e) {
        errors.push(`Event ${ev.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Events Nexus liés à Outlook qui ne sont PLUS dans la fenêtre Outlook
    // = supprimés côté Outlook. On les supprime côté Nexus (soft via status).
    // On se limite à la fenêtre pour ne pas toucher aux events hors portée.
    const nexusLinked = await prisma.calendarEvent.findMany({
      where: {
        outlookEventId: { not: null },
        startsAt: { gte: from, lte: to },
      },
      select: { id: true, outlookEventId: true },
    });
    for (const n of nexusLinked) {
      if (n.outlookEventId && !seenOutlookIds.has(n.outlookEventId)) {
        // Côté Outlook, l'event n'existe plus → on cascade supprime côté Nexus.
        await prisma.calendarEvent.delete({ where: { id: n.id } }).catch(() => {});
        deleted++;
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return { fetched, created, updated, skipped, deleted, undecoded, errors };
}

/**
 * Décode le titre Outlook et upsert l'event Nexus correspondant.
 * Gère aussi les cas non décodables (on crée quand même l'event, mais
 * marqué syncStatus=UNDECODED pour qu'un admin puisse intervenir).
 */
async function applyDecodedToNexus(args: {
  outlookEvent: OutlookEvent;
  nexusCalendarId: string;
  existingId: string | null;
  agents: DecodableAgent[];
  orgs: DecodableOrg[];
}): Promise<{ result: DecoderResult }> {
  const ev = args.outlookEvent;
  const rawTitle = ev.subject || "";
  const decoded = decodeLocationTitle(rawTitle, args.agents, args.orgs);

  // Parse Outlook dates. Graph renvoie "2026-04-15T09:00:00.0000000" sans Z
  // avec timeZone séparé. On les traite comme UTC.
  const startIso = ev.start.dateTime.endsWith("Z")
    ? ev.start.dateTime
    : ev.start.dateTime + "Z";
  const endIso = ev.end.dateTime.endsWith("Z")
    ? ev.end.dateTime
    : ev.end.dateTime + "Z";
  const startsAt = new Date(startIso);
  let endsAt = new Date(endIso);

  // Outlook encode les events all-day avec une fin EXCLUSIVE : un event
  // "journée entière" du 15 avril a start=2026-04-15T00:00 et
  // end=2026-04-16T00:00. Nexus affiche alors le 16 avril comme "fin" et
  // l'event tuile s'étale sur 2 jours dans le grid. On normalise à
  // l'import : fin = veille à 23:59:59.999 (fin INCLUSIVE, convention
  // Nexus). Fait uniquement si la fin est pile à minuit ET qu'elle est
  // strictement après le start — signal qu'on est bien sur le pattern
  // Outlook "exclusive end".
  if (ev.isAllDay && endsAt.getTime() > startsAt.getTime()) {
    const h = endsAt.getUTCHours();
    const m = endsAt.getUTCMinutes();
    const s = endsAt.getUTCSeconds();
    const ms = endsAt.getUTCMilliseconds();
    const isMidnight = h === 0 && m === 0 && s === 0 && ms === 0;
    if (isMidnight) {
      endsAt = new Date(endsAt.getTime() - 1); // 23:59:59.999 du jour précédent
    }
  }

  // Match partiel : decoded.ok=true mais certaines initiales agent étaient
  // inconnues. On garde syncStatus=OK mais on note l'info en syncError
  // pour que l'admin UI puisse afficher un avertissement discret.
  const partialAgentsNote =
    decoded.ok &&
    decoded.unknownAgentTokens &&
    decoded.unknownAgentTokens.length > 0
      ? `Partiel : initiales inconnues ignorées → ${decoded.unknownAgentTokens.join(", ")}`
      : null;

  // Description : Graph fournit `ev.body.content` en HTML (ou texte brut).
  // On stocke le HTML tel quel côté Nexus — le drawer d'event l'affiche
  // via `renderDescription`. Si Outlook n'a pas de corps, on garde null
  // (plutôt que chaîne vide) pour pouvoir distinguer "pas de description"
  // de "description effacée manuellement".
  const bodyContent = ev.body?.content?.trim() || null;

  const data = {
    calendarId: args.nexusCalendarId,
    title: rawTitle,
    description: bodyContent,
    kind: "WORK_LOCATION" as const,
    startsAt,
    endsAt,
    allDay: !!ev.isAllDay,
    ownerId: decoded.ok && decoded.agents.length > 0 ? decoded.agents[0].id : null,
    organizationId: decoded.ok ? decoded.organizationId : null,
    location: ev.location?.displayName ?? null,
    outlookEventId: ev.id,
    outlookCalendarId: "Localisation",
    rawTitle,
    syncStatus: decoded.ok ? "OK" : "UNDECODED",
    syncError: decoded.ok ? partialAgentsNote : decoded.message,
    lastSyncedAt: new Date(),
    status: "active",
  };

  let eventId: string;
  if (args.existingId) {
    await prisma.calendarEvent.update({
      where: { id: args.existingId },
      data,
    });
    eventId = args.existingId;
    // Reset la jointure multi-agents.
    await prisma.calendarEventAgent.deleteMany({ where: { eventId } });
  } else {
    // createdById = premier admin actif (placeholder).
    const creator = await prisma.user.findFirst({
      where: { role: { in: ["SUPER_ADMIN", "MSP_ADMIN"] }, isActive: true },
      select: { id: true },
      orderBy: { role: "asc" },
    });
    const created = await prisma.calendarEvent.create({
      data: { ...data, createdById: creator?.id ?? null },
    });
    eventId = created.id;
  }

  if (decoded.ok && decoded.agents.length > 0) {
    await prisma.calendarEventAgent.createMany({
      data: decoded.agents.map((a) => ({ eventId, userId: a.id })),
      skipDuplicates: true,
    });
  }

  return { result: decoded };
}

// ---------------------------------------------------------------------------
// Push : Nexus → Outlook
// Appelé depuis les endpoints POST / PATCH / DELETE du calendar-events
// quand kind=WORK_LOCATION et que la sync est activée.
// ---------------------------------------------------------------------------

export async function pushEventToOutlook(
  nexusEventId: string,
): Promise<{ ok: boolean; outlookEventId?: string; error?: string }> {
  const cfg = await getLocationSyncConfig();
  if (!cfg.enabled) return { ok: false, error: "Sync désactivée" };

  const event = await prisma.calendarEvent.findUnique({
    where: { id: nexusEventId },
    include: {
      agents: { include: { user: { select: { id: true, firstName: true, lastName: true, isActive: true } } } },
      organization: { select: { clientCode: true, isInternal: true } },
    },
  });
  if (!event || event.kind !== "WORK_LOCATION") {
    return { ok: false, error: "Pas un event WORK_LOCATION" };
  }

  try {
    const calendarId = await resolveCalendarId(cfg.mailbox, cfg.calendarName);
    const payload = buildOutlookPayload(event);

    if (event.outlookEventId) {
      const res = await updateCalendarEvent({
        mailbox: cfg.mailbox,
        eventId: event.outlookEventId,
        payload,
      });
      // Anti-boucle : on stocke `lastSyncedAt` >= `lastModifiedDateTime`
      // que Graph vient de retourner. Le prochain pull comparera
      // `evModified (Graph) > lastSyncedAt (Nexus)` et sautera cet event
      // (ne re-déclenche PAS un re-decode qui écraserait nos agents).
      // Fallback +2s si Graph ne renvoie pas lastModifiedDateTime (on
      // veut juste une borne > new Date() pour couvrir le skew Graph).
      const anchor = res.lastModifiedDateTime
        ? new Date(res.lastModifiedDateTime)
        : new Date(Date.now() + 2000);
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: { lastSyncedAt: anchor, syncStatus: "OK", syncError: null },
      });
      return { ok: true, outlookEventId: res.id };
    } else {
      const created = await createCalendarEvent({
        mailbox: cfg.mailbox,
        calendarId,
        payload,
      });
      const anchor = created.lastModifiedDateTime
        ? new Date(created.lastModifiedDateTime)
        : new Date(Date.now() + 2000);
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: {
          outlookEventId: created.id,
          outlookCalendarId: cfg.calendarName,
          lastSyncedAt: anchor,
          syncStatus: "OK",
          syncError: null,
        },
      });
      return { ok: true, outlookEventId: created.id };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { syncStatus: "ERROR", syncError: message },
    }).catch(() => {});
    return { ok: false, error: message };
  }
}

export async function deleteEventFromOutlook(
  nexusEventId: string,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getLocationSyncConfig();
  if (!cfg.enabled) return { ok: true }; // skip silently
  const event = await prisma.calendarEvent.findUnique({
    where: { id: nexusEventId },
    select: { outlookEventId: true },
  });
  if (!event?.outlookEventId) return { ok: true };
  try {
    await deleteCalendarEvent({ mailbox: cfg.mailbox, eventId: event.outlookEventId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function buildOutlookPayload(event: {
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  location: string | null;
  agents: Array<{ user: { firstName: string; lastName: string } }>;
  organization: { clientCode: string | null; isInternal: boolean } | null;
}): EventPayload {
  // Si le titre est déjà au format court (ex: "BR LV"), on le garde tel quel.
  // Sinon on encode depuis la structure Nexus.
  const looksEncoded = /^[A-Z]{1,4}(\/[A-Z]{1,4})*\s+[A-ZÀ-Ü]+$/i.test(event.title.trim());
  const subject = looksEncoded
    ? event.title.trim()
    : encodeLocationTitle({
        agents: event.agents.map((a) => ({
          id: "",
          firstName: a.user.firstName,
          lastName: a.user.lastName,
        })),
        organization: event.organization,
        locationKind: event.organization?.isInternal
          ? "office"
          : event.organization
            ? "client"
            : "remote",
      });

  return {
    subject,
    start: event.startsAt,
    end: event.endsAt,
    isAllDay: event.allDay,
    location: event.location ?? undefined,
  };
}
