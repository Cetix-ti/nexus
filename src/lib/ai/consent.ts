// ============================================================================
// AI CONSENT helper — lit les consents par organisation et applique les
// contraintes au flow IA. Utilisé par l'orchestrateur avant chaque appel.
//
// Cache in-memory 60s par org — trade-off volume DB vs réactivité. Un admin
// qui flip le consent verra la bascule dans la minute. Pour les features
// critiques (chat en temps réel), 60s est acceptable.
//
// Politique par défaut (si AiConsent absent) : tout autorisé.
// Cette décision permet la rétro-compat avec les orgs existantes sans rien
// faire. Pour les nouvelles orgs, le wizard d'onboarding doit créer un
// AiConsent explicite (futur — task séparée). La révocation (aiEnabled=false)
// bloque immédiatement après le flush cache.
// ============================================================================

import prisma from "@/lib/prisma";

export interface EffectiveConsent {
  aiEnabled: boolean;
  cloudProvidersAllowed: boolean;
  learningEnabled: boolean;
  clientContentEnabled: boolean;
}

const DEFAULT_CONSENT: EffectiveConsent = {
  aiEnabled: true,
  cloudProvidersAllowed: true,
  learningEnabled: true,
  clientContentEnabled: true,
};

interface CacheEntry {
  at: number;
  value: EffectiveConsent;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

/**
 * Récupère le consent d'une org. Si absent → renvoie les défauts (tout
 * autorisé). Le caller doit gérer les orgs avec aiEnabled=false en bloquant.
 */
export async function getAiConsent(
  organizationId: string | null | undefined,
): Promise<EffectiveConsent> {
  if (!organizationId) return DEFAULT_CONSENT;
  const hit = cache.get(organizationId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  try {
    const row = await prisma.aiConsent.findUnique({
      where: { organizationId },
      select: {
        aiEnabled: true,
        cloudProvidersAllowed: true,
        learningEnabled: true,
        clientContentEnabled: true,
      },
    });
    const value: EffectiveConsent = row ?? DEFAULT_CONSENT;
    cache.set(organizationId, { at: Date.now(), value });
    return value;
  } catch (err) {
    // Fail-open : en cas d'erreur DB, on applique les défauts pour ne pas
    // casser l'IA. Un check de santé devrait alerter sur les erreurs DB.
    console.warn("[ai-consent] lookup failed:", err);
    return DEFAULT_CONSENT;
  }
}

/**
 * Invalide le cache pour une org précise. Appelé après un UPDATE de consent
 * (API settings) pour que le changement soit effectif immédiatement au lieu
 * d'attendre 60s.
 */
export function invalidateConsentCache(organizationId: string): void {
  cache.delete(organizationId);
}

/**
 * Identifie les features qui produisent du contenu directement envoyé au
 * client (donc soumises à clientContentEnabled). Les autres features (triage
 * interne, copilot_chat, etc.) restent disponibles même si clientContentEnabled=false.
 */
const CLIENT_FACING_FEATURES = new Set<string>([
  "monthly_report",
  "response_assist", // brouillon client, copy-pasted ensuite
  "resolution_notes", // résumé client public
  "escalation_brief", // peut être partagé
]);

/**
 * Identifie les features qui "apprennent" depuis les données du client
 * (extraction de faits, pattern learning). Désactivables via learningEnabled.
 */
const LEARNING_FEATURES = new Set<string>([
  "facts_extract",
  "category_audit",
  "kb_audit",
]);

export function isClientFacingFeature(feature: string): boolean {
  return CLIENT_FACING_FEATURES.has(feature);
}

export function isLearningFeature(feature: string): boolean {
  return LEARNING_FEATURES.has(feature);
}
