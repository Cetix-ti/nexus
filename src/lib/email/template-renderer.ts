// ============================================================================
// EMAIL TEMPLATE RENDERER
//
// Pont entre la DB des templates (`email_templates`) et le chrome Cetix
// (`buildNexusEmail` dans nexus-template.ts). Pipeline :
//
//   1. Charger le row `EmailTemplate` pour `eventKey` (cache 60s)
//   2. Si trouvé + enabled : substituer les `{{variables}}` du payload
//      dans subject + body
//   3. Wrapper le body dans `buildNexusEmail` pour avoir le chrome
//      (logo, footer, lien préférences) intact
//   4. Si pas trouvé OU disabled : retomber sur les valeurs hardcodées
//      passées en `fallback` — c'est le filet de sécurité pour ne jamais
//      bloquer un envoi à cause d'un template manquant
//
// Le moteur de substitution est un Mustache léger : `{{key}}` → payload[key].
// Supporte les chemins imbriqués (`{{user.firstName}}`). Une variable
// inconnue est remplacée par une chaîne vide, avec un log warning pour
// aider le debug pendant la phase de mise en place.
// ============================================================================

import prisma from "@/lib/prisma";
import { buildNexusEmail, type NexusEmailOptions } from "./nexus-template";

/** Cache mémoire : eventKey → row + timestamp. TTL 60s. */
type CacheEntry = {
  template: { subject: string; body: string; enabled: boolean } | null;
  loadedAt: number;
};
const CACHE_TTL = 60 * 1000;
const cache = new Map<string, CacheEntry>();

/** Reset du cache (exporté pour les tests + après un PATCH côté UI admin). */
export function invalidateTemplateCache(eventKey?: string) {
  if (eventKey) cache.delete(eventKey);
  else cache.clear();
}

async function loadTemplate(eventKey: string) {
  const cached = cache.get(eventKey);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) return cached.template;
  const row = await prisma.emailTemplate.findUnique({
    where: { eventKey },
    select: { subject: true, body: true, enabled: true },
  });
  cache.set(eventKey, { template: row, loadedAt: Date.now() });
  return row;
}

/** Lookup `{{a.b.c}}` dans payload. */
function resolvePath(payload: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = payload;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Substitue les `{{variables}}` dans `template`. Inconnu → "" + warn. */
function substitute(template: string, payload: Record<string, unknown>, eventKey: string): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => {
    const v = resolvePath(payload, key);
    if (v === undefined || v === null) {
      console.warn(`[email-template] ${eventKey}: variable inconnue \`${key}\` (remplacée par "")`);
      return "";
    }
    return String(v);
  });
}

export interface RenderTemplateOptions {
  /** Payload des variables — clé/valeur, supporte les chemins imbriqués. */
  payload: Record<string, unknown>;
  /**
   * Valeurs hardcodées de fallback. Si le template DB n'existe pas ou est
   * désactivé, on rend `buildNexusEmail(fallback)` directement — c'est
   * le filet de sécurité qui garantit qu'un envoi ne casse jamais à
   * cause d'un template manquant.
   */
  fallback: NexusEmailOptions;
  /** URL de désabonnement (commun à tous les templates). */
  prefsUrl?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  /** "db" si rendu depuis le template DB, "fallback" sinon. */
  source: "db" | "fallback";
}

/**
 * Charge le template DB pour `eventKey`, substitue les variables, et
 * retourne `{ subject, html }`. Si pas de template (ou disabled), tombe
 * sur les valeurs hardcodées passées en `fallback`.
 *
 * Note : le chrome (logo, palette, footer) vient TOUJOURS de
 * `buildNexusEmail()`. Ce qui est customisable via le template DB :
 *   - Le subject de l'email
 *   - Le contenu HTML inséré dans la zone `body` du chrome
 *   - Le `intro` text (one-liner sous le titre) — passé via `{{__intro}}`
 *     dans le template (rare ; la plupart du temps on laisse le fallback)
 */
export async function renderTemplateForEvent(
  eventKey: string,
  options: RenderTemplateOptions,
): Promise<RenderedEmail> {
  const template = await loadTemplate(eventKey);
  if (!template || !template.enabled) {
    const html = buildNexusEmail({
      ...options.fallback,
      event: eventKey,
      prefsUrl: options.prefsUrl,
    });
    return {
      subject: options.fallback.title ?? eventKey,
      html,
      source: "fallback",
    };
  }

  const subject = substitute(template.subject, options.payload, eventKey);
  const body = substitute(template.body, options.payload, eventKey);

  // On wrappe le body custom dans le chrome standard. On garde le `title`
  // et `intro` du fallback comme entête (c'est le contenu structurel de
  // la carte) ; le `body` rendu remplace celui du fallback.
  const html = buildNexusEmail({
    ...options.fallback,
    event: eventKey,
    body,
    prefsUrl: options.prefsUrl,
  });

  return { subject, html, source: "db" };
}
