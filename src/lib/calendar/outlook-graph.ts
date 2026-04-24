// ============================================================================
// Client Microsoft Graph pour le calendrier partagé "Localisation" sur
// la boîte billets@cetix.ca. Responsable de :
//   - résoudre l'id du calendrier partagé
//   - lister les événements d'une fenêtre [from, to]
//   - créer / mettre à jour / supprimer un événement
//
// Réutilise le même app registration Azure que l'ingestion email + Veeam.
// ============================================================================

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

export interface OutlookEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  location?: { displayName?: string };
  categories?: string[];
  lastModifiedDateTime?: string;
  "@odata.etag"?: string;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET requis");
  }
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  if (!res.ok) throw new Error(`OAuth2 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

async function graphFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const url = path.startsWith("http") ? path : `${GRAPH_ROOT}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph ${res.status}: ${text || res.statusText}`);
  }
  // DELETE → 204 no-content
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------------------------------------------------------------------------
// Calendar resolution
// ---------------------------------------------------------------------------

interface GraphCalendar {
  id: string;
  name: string;
  owner?: { name: string; address: string };
  canEdit?: boolean;
}

/**
 * Retourne l'id du calendrier `displayName` pour la mailbox donnée.
 * Inclut les calendriers partagés (Graph les remonte via /calendars).
 * Cache en mémoire 10 min pour éviter un lookup à chaque sync.
 */
const calendarIdCache = new Map<string, { id: string; at: number }>();
const CAL_CACHE_TTL = 10 * 60 * 1000;

export async function resolveCalendarId(
  mailbox: string,
  displayName: string,
): Promise<string> {
  const key = `${mailbox}::${displayName.toLowerCase()}`;
  const cached = calendarIdCache.get(key);
  if (cached && Date.now() - cached.at < CAL_CACHE_TTL) return cached.id;

  const data = await graphFetch<{ value: GraphCalendar[] }>(
    `/users/${encodeURIComponent(mailbox)}/calendars?$top=100`,
  );
  const match = data.value.find(
    (c) => c.name && c.name.toLowerCase() === displayName.toLowerCase(),
  );
  if (!match) {
    const names = data.value.map((c) => c.name).join(", ");
    throw new Error(
      `Calendrier "${displayName}" introuvable sur ${mailbox}. Disponibles : ${names}`,
    );
  }
  calendarIdCache.set(key, { id: match.id, at: Date.now() });
  return match.id;
}

/**
 * Vide le cache — appelé après un test de connexion ou une reconfiguration.
 */
export function invalidateCalendarIdCache(): void {
  calendarIdCache.clear();
}

// ---------------------------------------------------------------------------
// List / get / create / update / delete events
// ---------------------------------------------------------------------------

export async function listCalendarEvents(args: {
  mailbox: string;
  calendarId: string;
  from: Date;
  to: Date;
}): Promise<OutlookEvent[]> {
  const { mailbox, calendarId, from, to } = args;
  // `calendarView` expanse les récurrences automatiquement entre startDateTime
  // et endDateTime. On utilise ça plutôt que /events pour coller à ce que
  // l'utilisateur voit dans Outlook.
  const qs = new URLSearchParams({
    startDateTime: from.toISOString(),
    endDateTime: to.toISOString(),
    $top: "200",
    $select: "id,subject,body,bodyPreview,start,end,isAllDay,location,categories,lastModifiedDateTime",
    $orderby: "start/dateTime asc",
  });
  const out: OutlookEvent[] = [];
  let url: string | null =
    `/users/${encodeURIComponent(mailbox)}/calendars/${calendarId}/calendarView?${qs.toString()}`;
  while (url) {
    // Prefer: outlook.timezone="UTC" force Graph à renvoyer start/end
    // en UTC plutôt que dans le TZ par défaut de la boîte. Ça élimine
    // l'ambiguïté côté parsing (dateTime sans Z) et rend le sync
    // indépendant de la config TZ de la mailbox.
    const page: { value: OutlookEvent[]; "@odata.nextLink"?: string } =
      await graphFetch(url, {
        headers: { Prefer: 'outlook.timezone="UTC"' },
      });
    out.push(...page.value);
    url = page["@odata.nextLink"]
      ? page["@odata.nextLink"].replace("https://graph.microsoft.com/v1.0", "")
      : null;
  }
  return out;
}

export interface EventPayload {
  subject: string;
  start: Date;
  end: Date;
  isAllDay?: boolean;
  timeZone?: string; // default America/Montreal
  bodyHtml?: string;
  location?: string;
}

function buildPayload(p: EventPayload): Record<string, unknown> {
  const tz = p.timeZone ?? "America/Montreal";
  return {
    subject: p.subject,
    isAllDay: p.isAllDay ?? false,
    start: { dateTime: p.start.toISOString().replace("Z", ""), timeZone: tz },
    end: { dateTime: p.end.toISOString().replace("Z", ""), timeZone: tz },
    body: p.bodyHtml
      ? { contentType: "HTML", content: p.bodyHtml }
      : { contentType: "Text", content: "" },
    ...(p.location ? { location: { displayName: p.location } } : {}),
  };
}

export async function createCalendarEvent(args: {
  mailbox: string;
  calendarId: string;
  payload: EventPayload;
}): Promise<OutlookEvent> {
  return graphFetch<OutlookEvent>(
    `/users/${encodeURIComponent(args.mailbox)}/calendars/${args.calendarId}/events`,
    { method: "POST", body: JSON.stringify(buildPayload(args.payload)) },
  );
}

export async function updateCalendarEvent(args: {
  mailbox: string;
  eventId: string;
  payload: Partial<EventPayload>;
}): Promise<OutlookEvent> {
  const patch: Record<string, unknown> = {};
  if (args.payload.subject !== undefined) patch.subject = args.payload.subject;
  if (args.payload.isAllDay !== undefined) patch.isAllDay = args.payload.isAllDay;
  if (args.payload.start) {
    patch.start = {
      dateTime: args.payload.start.toISOString().replace("Z", ""),
      timeZone: args.payload.timeZone ?? "America/Montreal",
    };
  }
  if (args.payload.end) {
    patch.end = {
      dateTime: args.payload.end.toISOString().replace("Z", ""),
      timeZone: args.payload.timeZone ?? "America/Montreal",
    };
  }
  if (args.payload.bodyHtml !== undefined) {
    patch.body = { contentType: "HTML", content: args.payload.bodyHtml };
  }
  if (args.payload.location !== undefined) {
    patch.location = { displayName: args.payload.location };
  }
  return graphFetch<OutlookEvent>(
    `/users/${encodeURIComponent(args.mailbox)}/events/${args.eventId}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export async function deleteCalendarEvent(args: {
  mailbox: string;
  eventId: string;
}): Promise<void> {
  await graphFetch<void>(
    `/users/${encodeURIComponent(args.mailbox)}/events/${args.eventId}`,
    { method: "DELETE" },
  );
}

/**
 * Smoke-test : vérifie le token + résout le calendrier.
 */
export async function testOutlookConnection(
  mailbox: string,
  calendarName: string,
): Promise<{ ok: boolean; calendarId?: string; error?: string }> {
  try {
    const id = await resolveCalendarId(mailbox, calendarName);
    return { ok: true, calendarId: id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
