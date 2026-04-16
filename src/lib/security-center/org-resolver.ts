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
  /** Liste de (pattern uppercase, orgId). Match en substring insensible
   *  à la casse — pour les hostnames qui ne suivent pas CODE-XXX. */
  endpointPatterns: Array<{ pattern: string; orgId: string }>;
  loadedAt: number;
}
let cachedMaps: OrgMaps | null = null;

async function getOrgMaps(): Promise<OrgMaps> {
  if (cachedMaps && Date.now() - cachedMaps.loadedAt < ORG_CACHE_TTL_MS) {
    return cachedMaps;
  }
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      domain: true,
      domains: true,
      clientCode: true,
      endpointPatterns: true,
    },
  });
  const domainMap = new Map<string, string>();
  const clientCodeMap = new Map<string, string>();
  const endpointPatterns: Array<{ pattern: string; orgId: string }> = [];
  for (const o of orgs) {
    if (o.domain) domainMap.set(o.domain.toLowerCase(), o.id);
    for (const d of o.domains ?? []) {
      if (d) domainMap.set(d.toLowerCase(), o.id);
    }
    if (o.clientCode) clientCodeMap.set(o.clientCode.toUpperCase(), o.id);
    for (const p of o.endpointPatterns ?? []) {
      const trimmed = p.trim().toUpperCase();
      if (trimmed.length >= 2) endpointPatterns.push({ pattern: trimmed, orgId: o.id });
    }
  }
  // Tri par longueur décroissante : un pattern plus spécifique (plus long)
  // matche avant un pattern plus court ambigu.
  endpointPatterns.sort((a, b) => b.pattern.length - a.pattern.length);
  cachedMaps = {
    domainMap,
    clientCodeMap,
    endpointPatterns,
    loadedAt: Date.now(),
  };
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
 * Règle : 2–8 lettres ASCII au début du nom, suivies soit d'un séparateur
 * `-`/`_`, soit d'un chiffre (nombreux hostnames legacy écrivent direct
 * `LV36-2509L` sans underscore entre code et numéro d'unité). Casse
 * ignorée pour le match (clientCode comparé en UPPERCASE).
 *
 * Exemples :
 *   "BDU-SERVER01"  → prefix "BDU"  → org Baie-D'Urfé
 *   "mrvl_dc01"     → prefix "MRVL" → org Marieville
 *   "LV36-2509L"    → prefix "LV"   → org Louiseville (nouveau)
 *   "server01"      → null (pas de préfixe reconnu)
 *
 * Note : la regex est greedy (essaie d'abord 8 lettres, backtrack vers 2).
 * Pour "LV36", "LV" est le prefix puisque "3" est un digit qui termine
 * le groupe de lettres. Pour "SERVER01", "SERVER" serait matché mais le
 * code "SERVER" ne figure pas dans clientCodeMap donc retour null — pas
 * de faux positif.
 */
export async function resolveOrgByEndpoint(endpoint: string): Promise<string | null> {
  const clean = endpoint.trim();
  if (!clean) return null;
  const m = clean.match(/^([A-Za-z]{2,8})(?=\d|[-_])/);
  if (!m) return null;
  const code = m[1].toUpperCase();
  const maps = await getOrgMaps();
  return maps.clientCodeMap.get(code) ?? null;
}

/**
 * Résout via les `endpointPatterns` configurés sur les organisations.
 * Match en SUBSTRING insensible à la casse. Le pattern le plus long
 * gagne (ordre du cache déjà trié par longueur décroissante). Utilisé
 * comme fallback quand le hostname ne porte pas de code client à son
 * début (ex: "STATION-LAV-36" → pattern "STATION-LAV" → Hulix).
 */
export async function resolveOrgByEndpointPattern(endpoint: string): Promise<string | null> {
  const upper = endpoint.trim().toUpperCase();
  if (!upper) return null;
  const maps = await getOrgMaps();
  for (const { pattern, orgId } of maps.endpointPatterns) {
    if (upper.includes(pattern)) return orgId;
  }
  return null;
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

/**
 * Normalise une adresse MAC en supprimant les séparateurs (`:`, `-`, `.`)
 * et en passant en lowercase. Permet de comparer "AA:BB:CC:DD:EE:FF" et
 * "AA-BB-CC-DD-EE-FF" et "AABB.CCDD.EEFF" comme équivalents.
 */
function normalizeMac(mac: string): string {
  return mac.replace(/[:\-.]/g, "").toLowerCase();
}

export async function resolveOrgByHostOrIp(
  hostname?: string | null,
  ipAddress?: string | null,
  macAddress?: string | null,
): Promise<string | null> {
  const host = hostname?.trim();
  const ip = ipAddress?.trim();
  const mac = macAddress?.trim();
  if (!host && !ip && !mac) return null;

  const cacheKey = `${(host ?? "").toLowerCase()}|${ip ?? ""}|${mac ? normalizeMac(mac) : ""}`;
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
      const orgId = await resolveViaAteraApi(host, ip, mac);
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
 * Lookup Atera — scan TOUS les customers du tenant (plafonné à 200 par
 * sécurité) et matche l'agent par :
 *   1. MachineName / AgentName exact (case-insensitive)
 *   2. MachineName / AgentName substring (case-insensitive) — robuste
 *      aux variations comme "COMM-W11" vs "COMM-W11.cetix.local"
 *   3. IP exacte dans IpAddresses
 *   4. MAC exacte (avec/sans séparateurs ":-." normalisés) dans MacAddresses
 *
 * La cascade s'arrête au premier match. Cap de 200 customers évite de
 * marteler Atera sur des tenants très larges ; les résultats sont mis
 * en cache 60 s par `ateraFetch`.
 */
async function resolveViaAteraApi(
  hostname?: string,
  ip?: string,
  mac?: string,
): Promise<string | null> {
  const { listAteraCustomers, listAteraAgentsForCustomer } = await import(
    "@/lib/integrations/atera-client"
  );
  const needleName = hostname?.toLowerCase().trim();
  const needleIp = ip?.trim();
  const needleMac = mac ? normalizeMac(mac) : null;
  if (!needleName && !needleIp && !needleMac) return null;

  const customers = await listAteraCustomers();
  for (const cust of customers.slice(0, 200)) {
    let agents;
    try {
      agents = await listAteraAgentsForCustomer(cust.CustomerID);
    } catch {
      continue;
    }
    const match = agents.find((a) => {
      const machine = a.MachineName?.toLowerCase() ?? "";
      const agentName = (a.AgentName ?? "").toLowerCase();
      // 1. Exact match name (le plus fiable)
      if (needleName && (machine === needleName || agentName === needleName)) return true;
      // 2. Substring : le needle doit être contenu dans la valeur Atera
      //    (cas FQDN côté Atera). Garde-fou contre empty strings :
      //    needleName et la valeur scannée doivent toutes deux faire
      //    >=4 char pour éviter qu'un MachineName vide ou très court
      //    matche par accident (`"comm-w11".includes("")` = true sinon).
      if (needleName && needleName.length >= 4) {
        if (machine.length >= 4 && machine.includes(needleName)) return true;
        if (agentName.length >= 4 && agentName.includes(needleName)) return true;
        // Cas inverse : Atera a la version courte, Wazuh envoie le FQDN.
        // On exige que la valeur Atera fasse au moins 4 char ET soit
        // strictement plus courte que le needle (sinon l'exact match
        // l'aurait déjà attrapé).
        if (machine.length >= 4 && machine.length < needleName.length && needleName.includes(machine)) {
          return true;
        }
        if (agentName.length >= 4 && agentName.length < needleName.length && needleName.includes(agentName)) {
          return true;
        }
      }
      // 3. IP exacte
      if (needleIp && Array.isArray(a.IpAddresses) && a.IpAddresses.includes(needleIp)) {
        return true;
      }
      // 4. MAC normalisée
      if (needleMac && Array.isArray(a.MacAddresses)) {
        if (a.MacAddresses.some((m) => normalizeMac(m) === needleMac)) return true;
      }
      return false;
    });
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
    // Idem regex que resolveOrgByEndpoint : accepte digit ou séparateur.
    const hostPrefix = zabbixHost[1].match(/^([A-Za-z]{2,8})(?=\d|[-_])/);
    if (hostPrefix) {
      const code = hostPrefix[1].toUpperCase();
      if (!seen.has(code)) {
        seen.add(code);
        codes.push(code);
      }
    }
  }

  // 2) Tous les tokens type CODE(digit|sep)CHAR dans le reste du texte.
  //    Ex : "BDU-DC01", "LV36-2509L", "MRVL_LAP-33". On capture
  //    uniquement la partie lettres initiale ; le suffixe n'est là que
  //    pour s'assurer qu'on ne matche pas des mots anglais isolés.
  const re = /\b([A-Za-z]{2,8})(?:\d|[-_])[A-Za-z0-9]/g;
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
