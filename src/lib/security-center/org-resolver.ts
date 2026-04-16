// ============================================================================
// SECURITY CENTER — résolution d'organisation
//
// Cascade alignée sur le dashboard « Alertes monitoring »
// (cf. src/lib/monitoring/email-sync.ts) pour que les mêmes préfixes
// d'hôtes matchent sur les deux pages. La résolution part des données les
// plus fiables vers les plus approximatives :
//
//   1. Domaine expéditeur        → Organization.domain ou `domains[]`
//   2. Nom d'endpoint            → préfixe CODE- → Organization.clientCode
//   3. Texte complet (sujet+body)→ scan de TOUS les tokens CODE-XXX et
//                                  premier match sur clientCode
//
// L'appelant (décodeur Wazuh / Bitdefender / …) peut combiner les
// helpers selon ce qu'il a en main.
// ============================================================================

import prisma from "@/lib/prisma";

// --- Cache léger ------------------------------------------------------
// Les orgs changent rarement ; on évite de re-requêter à chaque email.
// TTL court pour voir les changements rapidement côté admin.
const ORG_CACHE_TTL_MS = 60_000;
interface OrgMaps {
  domainMap: Map<string, string>; // domain lowercase → orgId
  clientCodeMap: Map<string, string>; // CODE uppercase → orgId
  loadedAt: number;
}
let cachedMaps: OrgMaps | null = null;

async function getOrgMaps(): Promise<OrgMaps> {
  if (cachedMaps && Date.now() - cachedMaps.loadedAt < ORG_CACHE_TTL_MS) {
    return cachedMaps;
  }
  const orgs = await prisma.organization.findMany({
    select: { id: true, domain: true, domains: true, clientCode: true },
  });
  const domainMap = new Map<string, string>();
  const clientCodeMap = new Map<string, string>();
  for (const o of orgs) {
    if (o.domain) domainMap.set(o.domain.toLowerCase(), o.id);
    for (const d of o.domains ?? []) {
      if (d) domainMap.set(d.toLowerCase(), o.id);
    }
    if (o.clientCode) clientCodeMap.set(o.clientCode.toUpperCase(), o.id);
  }
  cachedMaps = { domainMap, clientCodeMap, loadedAt: Date.now() };
  return cachedMaps;
}

export function invalidateOrgResolverCache() {
  cachedMaps = null;
}

// --- API publique -----------------------------------------------------

/**
 * Résout l'organisation à partir d'un domaine d'expéditeur.
 * Ex: "alerts@cetix.ca" → matche Organization.domain = "cetix.ca".
 */
export async function resolveOrgByDomain(domain: string): Promise<string | null> {
  const needle = domain.trim().toLowerCase();
  if (!needle) return null;
  const maps = await getOrgMaps();
  return maps.domainMap.get(needle) ?? null;
}

/**
 * Extrait le préfixe client d'un nom d'endpoint (hostname Wazuh, computer
 * name AD, etc.) et le matche sur Organization.clientCode.
 *
 * Règle identique à monitoring : on prend 2–8 lettres ASCII au début du
 * nom, suivies d'un `-` ou `_`. Casse ignorée pour le match (clientCode
 * comparé en UPPERCASE).
 *
 * Exemples :
 *   "BDU-SERVER01"  → prefix "BDU"  → org Baie-D'Urfé
 *   "mrvl_dc01"     → prefix "MRVL" → org Marieville (si clientCode=MRVL)
 *   "server01"      → null (pas de préfixe type CODE-)
 */
export async function resolveOrgByEndpoint(endpoint: string): Promise<string | null> {
  const clean = endpoint.trim();
  if (!clean) return null;
  const m = clean.match(/^([A-Za-z]{2,8})[-_]/);
  if (!m) return null;
  const code = m[1].toUpperCase();
  const maps = await getOrgMaps();
  return maps.clientCodeMap.get(code) ?? null;
}

/**
 * Scanne un texte libre (sujet + body) à la recherche de tokens
 * "CODE-XXX" et renvoie le PREMIER clientCode matchant une organisation
 * existante. Pattern identique à `extractAllClientCodePrefixes` de
 * monitoring — on couvre le cas où le hostname apparaît dans une ligne
 * du body (ex: "Host: BDU-DC01\n...") même si `endpoint` n'a pas été
 * extrait proprement par le décodeur.
 *
 * On tronque le body à 2000 caractères pour limiter le coût regex sur
 * les longs emails.
 */
/**
 * Dernier recours quand le hostname ne porte pas de préfixe client code :
 * on interroge les assets RMM (Atera principalement) pour trouver à quel
 * client appartient cette machine ou cette IP.
 *
 * Ordre des tentatives :
 *   1. Table Asset locale (assets Atera déjà synchronisés) — match par
 *      nom EXACT insensible casse, fallback match par IP.
 *   2. Atera API directe — si ATERA_API_KEY est présent et que l'asset
 *      n'est pas encore synchronisé localement. Résultat mis en cache pour
 *      éviter de marteler l'API sur des alertes répétitives.
 *
 * Retourne null si aucun match sur les deux canaux.
 */
const rmmCache = new Map<string, string | null>();

export async function resolveOrgByHostOrIp(
  hostname?: string | null,
  ipAddress?: string | null,
): Promise<string | null> {
  const host = hostname?.trim();
  const ip = ipAddress?.trim();
  if (!host && !ip) return null;

  const cacheKey = `${(host ?? "").toLowerCase()}|${ip ?? ""}`;
  if (rmmCache.has(cacheKey)) return rmmCache.get(cacheKey) ?? null;

  // 1) Local Asset table — match hostname, puis IP.
  //    On privilégie les assets Atera mais tous les sources fonctionnent.
  try {
    if (host) {
      const byName = await prisma.asset.findFirst({
        where: { name: { equals: host, mode: "insensitive" } },
        select: { organizationId: true },
      });
      if (byName) {
        rmmCache.set(cacheKey, byName.organizationId);
        return byName.organizationId;
      }
    }
    if (ip) {
      const byIp = await prisma.asset.findFirst({
        where: { ipAddress: ip },
        select: { organizationId: true },
      });
      if (byIp) {
        rmmCache.set(cacheKey, byIp.organizationId);
        return byIp.organizationId;
      }
    }
  } catch (e) {
    console.warn("[org-resolver] asset lookup failed:", e);
  }

  // 2) Atera API — si la clé est configurée ET que l'asset n'est pas encore
  //    synchronisé localement. On liste les agents via Atera, on matche
  //    par MachineName ou IP, puis on résout le CustomerID → Organization
  //    via la table `IntegrationMapping` (peuplée par la sync Atera
  //    existante) ou en tentant de matcher par Customer.Name.
  if (process.env.ATERA_API_KEY) {
    try {
      const orgId = await resolveViaAteraApi(host, ip);
      rmmCache.set(cacheKey, orgId);
      return orgId;
    } catch (e) {
      console.warn("[org-resolver] Atera API fallback failed:", e);
    }
  }

  rmmCache.set(cacheKey, null);
  return null;
}

/**
 * Lookup Atera — on évite de lister tous les agents du tenant (peut être
 * très large). Stratégie : si on a un hostname, on liste un échantillon
 * d'agents et on filtre côté client. Pour une implémentation plus
 * efficace future, Atera supporte `?searchOnly=...` sur certains endpoints.
 */
async function resolveViaAteraApi(
  hostname?: string,
  ip?: string,
): Promise<string | null> {
  const { listAteraCustomers, listAteraAgentsForCustomer } = await import(
    "@/lib/integrations/atera-client"
  );
  const needleName = hostname?.toLowerCase();
  const needleIp = ip;
  if (!needleName && !needleIp) return null;

  const customers = await listAteraCustomers();
  // On ne scanne pas TOUS les customers (peut être 50+ avec 100+ agents
  // chacun). On plafonne à 30 customers — suffisant pour les tenants MSP
  // Cetix. Si besoin, remplacer par une vraie API de recherche quand
  // Atera l'expose.
  for (const cust of customers.slice(0, 30)) {
    let agents;
    try {
      agents = await listAteraAgentsForCustomer(cust.CustomerID);
    } catch {
      continue;
    }
    const match = agents.find(
      (a) =>
        (needleName && a.MachineName?.toLowerCase() === needleName) ||
        (needleName && (a.AgentName ?? "").toLowerCase() === needleName) ||
        (needleIp && Array.isArray(a.IpAddresses) && a.IpAddresses.includes(needleIp)),
    );
    if (!match) continue;

    // Resolve Atera CustomerID → Nexus Organization via OrgIntegrationMapping
    // (table peuplée par l'admin ou par la sync automatique Atera).
    const mapping = await prisma.orgIntegrationMapping.findFirst({
      where: {
        provider: "atera",
        externalId: String(cust.CustomerID),
      },
      select: { organizationId: true },
    });
    if (mapping?.organizationId) return mapping.organizationId;

    // Fallback : matcher par nom d'org normalisé.
    const byName = await prisma.organization.findFirst({
      where: { name: { equals: cust.CustomerName, mode: "insensitive" } },
      select: { id: true },
    });
    if (byName) return byName.id;
  }
  return null;
}

export async function resolveOrgByText(
  subject: string,
  body: string,
): Promise<string | null> {
  const text = `${subject}\n${body.slice(0, 2000)}`;
  const seen = new Set<string>();
  const codes: string[] = [];

  // 1) Priorité : ligne "Host: XYZ" (templates Zabbix/Wazuh l'utilisent
  //    souvent comme source de vérité du hostname).
  const zabbixHost = body.match(/^\s*Host:\s*([A-Za-z][A-Za-z0-9_\-\.]+)\s*$/im);
  if (zabbixHost) {
    const hostPrefix = zabbixHost[1].match(/^([A-Za-z]{2,8})[-_]/);
    if (hostPrefix) {
      const code = hostPrefix[1].toUpperCase();
      if (!seen.has(code)) {
        seen.add(code);
        codes.push(code);
      }
    }
  }

  // 2) Tous les tokens CODE-XXX dans le reste du texte.
  const re = /\b([A-Za-z]{2,8})[-_][A-Za-z0-9]{1,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const code = m[1].toUpperCase();
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }

  if (codes.length === 0) return null;
  const maps = await getOrgMaps();
  for (const code of codes) {
    const orgId = maps.clientCodeMap.get(code);
    if (orgId) return orgId;
  }
  return null;
}
