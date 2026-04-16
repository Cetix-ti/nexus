// ============================================================================
// PORTAL URL RESOLVER — source unique pour construire les URLs envoyées aux
// contacts (courriels de confirmation, approbations, relances…).
//
// Lit portal-domain.json côté serveur : si un sous-domaine y est configuré,
// l'URL publique devient `https://<subdomain>.cetix.ca`. Sinon, fallback sur
// NEXT_PUBLIC_APP_URL (typiquement l'IP LAN en développement).
//
// IMPORTANT : utiliser CES helpers, pas `process.env.NEXT_PUBLIC_APP_URL` en
// dur, pour que les URLs dans les courriels suivent automatiquement quand
// l'admin change le sous-domaine dans Paramètres → Portail.
// ============================================================================

import { getDomainConfig } from "./storage";

const ROOT_DOMAIN = "cetix.ca";

/**
 * Retourne l'URL publique racine pour les liens destinés aux contacts.
 * Priorité :
 *   1. `portal-domain.json` avec `dnsConfigured=true` → https://{sub}.cetix.ca
 *   2. `NEXT_PUBLIC_APP_URL` (typiquement http://IP:3000 en dev)
 *   3. http://localhost:3000 en dernier recours
 */
export async function getPortalBaseUrl(): Promise<string> {
  try {
    const cfg = await getDomainConfig();
    // On n'exige pas dnsConfigured=true : si un sous-domaine est renseigné,
    // on l'utilise. L'admin qui a saisi le sous-domaine s'attend à ce qu'il
    // soit utilisé ; la case dnsConfigured est plutôt un indicateur de
    // l'état côté Cloudflare, pas un gate pour l'émission des URLs.
    if (cfg.subdomain && cfg.subdomain.trim()) {
      const scheme = cfg.forceHttps === false ? "http" : "https";
      return `${scheme}://${cfg.subdomain.trim()}.${ROOT_DOMAIN}`;
    }
  } catch {
    /* fall through to env fallback */
  }
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  return "http://localhost:3000";
}

/**
 * URL directe vers la vue portail d'un ticket — pour les courriels envoyés
 * aux contacts (demandeur, approbateurs). Utilise l'id interne, pas le
 * numéro formaté, pour éviter les soucis d'encodage.
 */
export async function getPortalTicketUrl(ticketId: string): Promise<string> {
  const base = await getPortalBaseUrl();
  return `${base}/portal/tickets/${ticketId}`;
}

/**
 * URL de la vue agent (équipe Cetix) d'un ticket — pour les courriels
 * internes envoyés aux agents. Privilégie le format court /TK-NNNN
 * (rewriten par le proxy vers /tickets/TK-NNNN). Si on n'a pas le numéro
 * formaté, fallback sur l'ancien /tickets/{cuid}.
 */
export async function getAgentTicketUrl(
  ticketIdOrSlug: string,
): Promise<string> {
  const base = await getPortalBaseUrl();
  // Slug "TK-1234" / "INT-1234" → URL courte au root.
  if (/^(TK|INT)-\d+$/i.test(ticketIdOrSlug)) {
    return `${base}/${ticketIdOrSlug.toUpperCase()}`;
  }
  return `${base}/tickets/${ticketIdOrSlug}`;
}
