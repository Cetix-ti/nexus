// ============================================================================
// Policies IA par feature — point unique de décision "qui peut envoyer quoi
// à quel provider". Toute nouvelle feature qui appelle l'AI doit déclarer
// sa policy ici. Interdit de créer des policies ad-hoc dans le code appelant.
//
// Principes :
//   - "sensitivity" détermine le défaut routing.
//   - "allowedProviders" peut restreindre (ex: une feature qui touche
//     des données RH → ["ollama"] uniquement, même si la sensibilité
//     globale permettrait plus).
//   - "humanApprovalRequired" est un drapeau documentaire : toute feature
//     qui écrit quelque part côté client (email envoyé, ticket fermé,
//     priorité changée) DOIT le mettre à true. Un audit peut lister les
//     invocations sans approval et vérifier qu'aucune n'a entraîné
//     d'action automatique.
//
// La structure est intentionnellement plate et lisible — pas de DSL, pas
// d'héritage. Une feature = un constant exporté.
// ============================================================================

import type { AiPolicy } from "./types";

// ---------------------------------------------------------------------------
// Legacy — usage existant à migrer (service.ts chatCompletion)
// ---------------------------------------------------------------------------
export const POLICY_LEGACY_CHAT: AiPolicy = {
  feature: "legacy_chat",
  sensitivity: "internal",
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: true, hostnames: false, clientNames: true },
  temperature: 0.3,
  maxTokens: 4096,
  humanApprovalRequired: false, // lecture seule
  // gemma3:12b @ 30 tok/s → 4096 tokens ≈ 137s. On met 180s pour marge.
  timeoutMs: 180_000,
  promptVersion: "legacy_chat-v1",
};

// ---------------------------------------------------------------------------
// Triage unifié à la création d'un ticket — remplace auto-categorize +
// auto-prioritize. Un seul call LLM produit summary, category, priority,
// type, duplicate hint, major incident hint.
// ---------------------------------------------------------------------------
export const POLICY_TRIAGE: AiPolicy = {
  feature: "triage",
  sensitivity: "client_data",
  // Anthropic préféré (Claude Haiku/Sonnet) avec prompt caching : la
  // taxonomie complète envoyée à chaque appel bénéficie du cache ephemeral
  // (5 min) → 90% d'économie sur l'input répété. Fallback OpenAI puis Ollama.
  allowedProviders: ["anthropic", "ollama", "openai"],
  scrub: { pii: true, hostnames: false, clientNames: true },
  temperature: 0.1, // décisions aussi déterministes que possible
  maxTokens: 800,
  responseFormat: "json_object",
  humanApprovalRequired: true, // auto-apply seulement si confidence ≥ seuil
  minConfidenceToShow: 0.55,
  timeoutMs: 60_000,
  cacheTtlSeconds: 600,
  // 40 chars = "Mon imprimante ne fonctionne plus" minimum viable. En
  // dessous, le LLM a très peu de contexte — skip plutôt que générer un
  // résultat faible en confiance.
  minInputChars: 40,
  // Précision > prix : Claude Sonnet/Haiku surpasse gpt-4o-mini sur les
  // taxonomies MSP profondes, et le prompt caching divise le coût effectif.
  // Fallback Ollama si Anthropic ET OpenAI down — continuité garantie.
  preferAnthropic: true,
  enablePromptCaching: true,
  // Stratégie "classer tout, corriger via feedback" : floor bas (0.3) pour
  // maximiser la couverture. Les 3 sanity checks filtrent déjà les hallucinations
  // avant ce point. Ajuster vers 0.6+ si trop de bruit observé.
  autoApplyFloor: 0.3,
  promptVersion: "triage-v4-hierarchical-path",
};

// ---------------------------------------------------------------------------
// Notes de résolution (Phase 1 #4) — note technique + note client à la fermeture
// Input = historique complet du ticket → scrub complet obligatoire.
// ---------------------------------------------------------------------------
export const POLICY_RESOLUTION_NOTES: AiPolicy = {
  feature: "resolution_notes",
  sensitivity: "client_data",
  allowedProviders: ["anthropic", "ollama", "openai"],
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.25,
  maxTokens: 1200,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 90_000,
  // Claude excelle sur la rédaction narrative tech+client dual-output.
  preferAnthropic: true,
  promptVersion: "resolution_notes-v1",
};

// ---------------------------------------------------------------------------
// Close audit (Phase 2) — vérification qualité avant fermeture d'un ticket
// + proposition de tâches de suivi préventif. Lit l'historique, pas de sortie
// publique. Internal sensitivity suffit.
// ---------------------------------------------------------------------------
export const POLICY_CLOSE_AUDIT: AiPolicy = {
  feature: "close_audit",
  sensitivity: "client_data",
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.1,
  maxTokens: 1000,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 75_000,
  promptVersion: "close_audit-v1",
};

// ---------------------------------------------------------------------------
// Checklists d'intervention (Phase 2) — génère une checklist par catégorie
// à partir d'échantillons de tickets résolus. Pas de PII client dans l'output
// (checklist générique). Input scrubbed pour l'analyse.
// ---------------------------------------------------------------------------
export const POLICY_CHECKLIST_GEN: AiPolicy = {
  feature: "checklist_gen",
  sensitivity: "internal",
  // (timeout ajusté ci-dessous — 90s vu 1500 tokens @ gemma3:12b)
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.2,
  maxTokens: 1500,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 90_000,
  promptVersion: "checklist_gen-v1",
};

// ---------------------------------------------------------------------------
// Analyse risques clients (Phase 3 #8) — synthèse de tous les signaux
// (tickets, monitoring, backups, sécurité, faits AiMemory) en profil
// de risque + recommandations priorisées.
// ---------------------------------------------------------------------------
export const POLICY_RISK_ANALYSIS: AiPolicy = {
  feature: "risk_analysis",
  sensitivity: "client_data",
  allowedProviders: ["anthropic", "ollama", "openai"],
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.2,
  maxTokens: 3500,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 180_000,
  // System prompt très stable + volumineux (règles d'analyse de risque) →
  // idéal pour prompt caching. Output long + raisonnement multi-étape →
  // Claude Sonnet supérieur sur ce type de synthèse.
  preferAnthropic: true,
  enablePromptCaching: true,
  promptVersion: "risk_analysis-v1",
};

// ---------------------------------------------------------------------------
// Rapports exécutifs mensuels (Phase 3 #11) — résumé client + KPI +
// tendances + recommandations. Plus narratif que risk_analysis.
// ---------------------------------------------------------------------------
export const POLICY_MONTHLY_REPORT: AiPolicy = {
  feature: "monthly_report",
  sensitivity: "client_data",
  allowedProviders: ["anthropic", "ollama", "openai"],
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.3,
  maxTokens: 4000,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 240_000,
  // Rapport long-form client-facing = terrain de prédilection de Claude.
  // Préfixe de format (sections, ton, contraintes client) stable → caching.
  preferAnthropic: true,
  enablePromptCaching: true,
  promptVersion: "monthly_report-v2-kpi-sanity",
};

// ---------------------------------------------------------------------------
// Suggestions commerciales (Phase 3 #9) — extrait opportunités projets /
// services récurrents à partir des patterns d'incidents.
// ---------------------------------------------------------------------------
export const POLICY_SALES_SUGGEST: AiPolicy = {
  feature: "sales_suggest",
  sensitivity: "client_data",
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.3,
  maxTokens: 2500,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 150_000,
  promptVersion: "sales_suggest-v1",
};

// ---------------------------------------------------------------------------
// Réécriture tonale (#6) — reformule un message existant selon 4 tons
// (bref / détaillé / vulgarisé / exécutif). Ne génère pas from scratch —
// input = texte déjà rédigé par l'agent. Scrub désactivé car les noms /
// hostnames font partie de la substance à préserver. Le tech voit et
// édite la sortie avant envoi.
// ---------------------------------------------------------------------------
export const POLICY_TONE_REWRITE: AiPolicy = {
  feature: "tone_rewrite",
  sensitivity: "internal",
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: false, hostnames: false, clientNames: false },
  temperature: 0.4,
  maxTokens: 1200,
  humanApprovalRequired: true,
  timeoutMs: 90_000,
  promptVersion: "tone_rewrite-v1",
};

// ---------------------------------------------------------------------------
// Copilote d'escalade (#7) — prépare le brief de handoff quand un ticket
// passe à N2 ou à un spécialiste. Lit toutes les notes + changements de
// statut et produit un document propre évitant "j'ai perdu 30 min à
// comprendre ce qui a déjà été essayé".
// ---------------------------------------------------------------------------
export const POLICY_ESCALATION_BRIEF: AiPolicy = {
  feature: "escalation_brief",
  sensitivity: "client_data",
  allowedProviders: ["anthropic", "ollama", "openai"],
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.2,
  maxTokens: 2000,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 120_000,
  // Brief de handoff = synthèse narrative structurée, fort d'œuvre Claude.
  preferAnthropic: true,
  promptVersion: "escalation_brief-v1",
};

// ---------------------------------------------------------------------------
// Détection courriel transféré (#13) — identifier le VRAI demandeur quand
// un agent MSP forward un email client. Appelé comme fallback IA quand le
// parseur heuristique échoue. Local Ollama idéal (tâche simple, rapide).
// ---------------------------------------------------------------------------
export const POLICY_FORWARDED_EMAIL: AiPolicy = {
  feature: "forwarded_email_detect",
  sensitivity: "client_data",
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: false, hostnames: false, clientNames: false }, // Les emails sont LE signal — ne pas scrubber
  // Mais si Ollama tombe et qu'on fallback OpenAI, on FORCE scrub complet.
  // Les adresses email sont strictement nécessaires à la détection, donc on
  // ne peut pas les scrubber — la seule défense Loi 25 dans ce cas est de
  // limiter le fallback cloud. cloudScrubOverride scrubbé partiellement
  // (hostnames + clientNames) limite la fuite de données contextuelles
  // tout en gardant les emails visibles pour l'IA.
  cloudScrubOverride: { pii: false, hostnames: true, clientNames: true },
  temperature: 0,
  maxTokens: 400,
  responseFormat: "json_object",
  humanApprovalRequired: false,
  timeoutMs: 15_000,
  // Cache 30 min : la détection fwd est 100% déterministe sur le texte
  // reçu. Même email reparsé (retry sync) = cache hit garanti.
  cacheTtlSeconds: 1800,
  promptVersion: "forwarded_email_detect-v1",
};

// ---------------------------------------------------------------------------
// Coaching techniciens (Phase 3 #15) — identifie besoins de formation à
// partir des données opérationnelles (escalades, délais, qualité).
// Internal — pas de PII client.
// ---------------------------------------------------------------------------
export const POLICY_TECH_COACHING: AiPolicy = {
  feature: "tech_coaching",
  sensitivity: "internal",
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: true, hostnames: false, clientNames: true },
  temperature: 0.2,
  maxTokens: 2500,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 150_000,
  promptVersion: "tech_coaching-v1",
};

// ---------------------------------------------------------------------------
// Extraction de faits (Phase 2 → fondation Phase 3) — job batch qui lit
// tickets résolus et propose des "faits" (conventions, quirks par client)
// à stocker dans AiMemory après validation admin.
// ---------------------------------------------------------------------------
export const POLICY_FACTS_EXTRACT: AiPolicy = {
  feature: "facts_extract",
  sensitivity: "client_data",
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.1,
  maxTokens: 2000,
  responseFormat: "json_object",
  humanApprovalRequired: true, // admin valide chaque fait avant activation
  timeoutMs: 120_000,
  promptVersion: "facts_extract-v1",
};

// ---------------------------------------------------------------------------
// KB auto-génération (Phase 1 #5) — transforme un ticket résolu en article
// Input = ticket + résolution → scrub avant, article vraiment publishable
// uniquement après édition humaine.
// ---------------------------------------------------------------------------
export const POLICY_KB_GEN: AiPolicy = {
  feature: "kb_gen",
  sensitivity: "client_data",
  allowedProviders: ["anthropic", "ollama", "openai"],
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.3,
  maxTokens: 2000,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 120_000,
  // Rédaction structurée KB (sections, ton pédagogique) = point fort Claude.
  preferAnthropic: true,
  promptVersion: "kb_gen-v1",
};

// ---------------------------------------------------------------------------
// Assistant de réponse (Phase 1 #3) — brouillon + diagnostic + commandes
// Contient du contenu client (descriptions, échanges) → scrub complet.
// Préfère OpenAI pour qualité de rédaction, fallback Ollama.
// ---------------------------------------------------------------------------
export const POLICY_RESPONSE_ASSIST: AiPolicy = {
  feature: "response_assist",
  sensitivity: "client_data",
  allowedProviders: ["anthropic", "ollama", "openai"],
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.3,
  maxTokens: 1500,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 90_000,
  minInputChars: 60,
  // Brouillon client + diagnostics + commandes : Claude donne des rédactions
  // plus naturelles et des diagnostics plus fins que gpt-4o-mini.
  preferAnthropic: true,
  promptVersion: "response_assist-v1",
};

// ---------------------------------------------------------------------------
// Classification (catégorie, priorité) — idéal pour Ollama (local, rapide)
// ---------------------------------------------------------------------------
export const POLICY_CATEGORY_SUGGEST: AiPolicy = {
  feature: "category_suggest",
  sensitivity: "internal",
  allowedProviders: ["anthropic", "ollama", "openai"],
  scrub: { pii: true, hostnames: false, clientNames: true },
  temperature: 0.1, // déterministe
  maxTokens: 300,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  minConfidenceToShow: 0.6,
  timeoutMs: 45_000,
  cacheTtlSeconds: 600,
  // Pas de minInputChars — un simple mot-clé ("Outlook", "VPN", "AD")
  // suffit pour la suggestion de catégorie, les prompts incluent déjà
  // la hiérarchie complète pour contexte.
  // Claude Haiku préféré : précision supérieure à gemma3 sur taxonomies
  // profondes pour un coût dérisoire (~0.1¢/call).
  preferAnthropic: true,
  promptVersion: "category_suggest-v2",
};

export const POLICY_PRIORITY_SUGGEST: AiPolicy = {
  feature: "priority_suggest",
  sensitivity: "internal",
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: true, hostnames: false, clientNames: true },
  temperature: 0.1,
  maxTokens: 200,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  minConfidenceToShow: 0.55,
  timeoutMs: 45_000,
  cacheTtlSeconds: 600,
  promptVersion: "priority_suggest-v1",
};

// ---------------------------------------------------------------------------
// Assistance meeting — génération de tickets à partir de notes
// ---------------------------------------------------------------------------
export const POLICY_MEETING_SUGGEST: AiPolicy = {
  feature: "meeting_suggest_tickets",
  sensitivity: "internal",
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: true, hostnames: false, clientNames: true },
  temperature: 0.4,
  maxTokens: 2000,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 120_000,
  promptVersion: "meeting_suggest_tickets-v1",
};

// ---------------------------------------------------------------------------
// Lookup externe (EOL) — données publiques fabricant, zéro PII
// ---------------------------------------------------------------------------
export const POLICY_ASSET_EOL: AiPolicy = {
  feature: "asset_eol",
  sensitivity: "public",
  // Ollama en premier — le MSP peut toujours fallback OpenAI si le modèle
  // local n'a pas la date EOL à jour dans son training cut-off.
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: false, hostnames: false, clientNames: false },
  temperature: 0.2,
  maxTokens: 800,
  responseFormat: "json_object",
  humanApprovalRequired: false,
  timeoutMs: 30_000,
  promptVersion: "asset_eol-v1",
};

// ---------------------------------------------------------------------------
// Audit taxonomie catégories — traite des noms de catégories, pas de PII
// ---------------------------------------------------------------------------
export const POLICY_CATEGORY_AUDIT: AiPolicy = {
  feature: "category_audit",
  sensitivity: "internal",
  // Ollama en premier — cohérent avec la stratégie self-hosted first.
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: false, hostnames: false, clientNames: false },
  temperature: 0.2,
  // 2500 tokens suffisent pour un rapport structuré avec 8 suggestions max.
  // 4000 était généreux et allongeait inutilement la génération locale.
  maxTokens: 2500,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  // gemma3:12b ~30 tok/s sur P6000 → 2500 tokens ≈ 90s. On double (180s) pour
  // absorber la latence de load du modèle (+10-15s au premier appel) et la
  // lecture du prompt.
  timeoutMs: 180_000,
  promptVersion: "category_audit-v1",
};

// ---------------------------------------------------------------------------
// AI AUDIT — un modèle OpenAI plus puissant (gpt-4o-mini/gpt-4o) audite
// les décisions du modèle local (gemma3). Alimente le feedback loop
// autonome : les suggestions répétées ≥ N fois sont appliquées
// automatiquement (SANITY_STOP étendue, mappings catégorie forcés, etc.).
// ---------------------------------------------------------------------------
export const POLICY_AI_AUDIT: AiPolicy = {
  feature: "ai_audit",
  sensitivity: "internal",
  // Le juge doit être plus intelligent que le modèle audité. Claude Sonnet
  // surclasse gpt-4o-mini sur le raisonnement structuré et le verdict nuancé
  // (agree/partial/disagree). OpenAI reste en fallback.
  allowedProviders: ["anthropic", "openai"],
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.1,
  maxTokens: 1500,
  responseFormat: "json_object",
  humanApprovalRequired: false,
  timeoutMs: 60_000,
  preferAnthropic: true,
  promptVersion: "ai_audit-v1",
};

// ---------------------------------------------------------------------------
// Audit Base de connaissances — analyse la hiérarchie + les articles et
// propose une restructuration (renommages, déplacements, tags, doublons,
// articles orphelins). Pas de PII client : les KB articles sont du contenu
// pédagogique interne (procédures, runbooks) → scrub désactivé pour
// préserver les noms techniques (vendors, produits, versions).
// ---------------------------------------------------------------------------
export const POLICY_KB_AUDIT: AiPolicy = {
  feature: "kb_audit",
  sensitivity: "internal",
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: false, hostnames: false, clientNames: false },
  temperature: 0.2,
  // 4500 tokens pour permettre 30+ suggestions articles + 10 structurelles,
  // avec leurs fields riches (reason, proposedTags, etc.).
  maxTokens: 4500,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  // Prompt peut être volumineux (60 articles × 600 chars ≈ 40 KB input) et
  // génération longue (4500 tokens). gemma3:12b ~30 tok/s → 150s output.
  // Marge large pour les KB volumineuses.
  timeoutMs: 360_000,
  promptVersion: "kb_audit-v1",
};

// ---------------------------------------------------------------------------
// Reformulation d'article KB — reformule un article existant pour le rendre
// plus professionnel, structuré, cohérent. Ne change PAS le fond technique :
// uniquement la forme (ton, structure, titres de section, listes).
// ---------------------------------------------------------------------------
export const POLICY_KB_REWRITE: AiPolicy = {
  feature: "kb_rewrite",
  sensitivity: "internal",
  allowedProviders: ["ollama", "openai"],
  scrub: { pii: false, hostnames: false, clientNames: false },
  temperature: 0.3,
  maxTokens: 4000,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 180_000,
  promptVersion: "kb_rewrite-v1",
};

// ---------------------------------------------------------------------------
// Chat copilot global (widget) — anonymisation activée par défaut
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Triage d'incident de sécurité — classification MITRE ATT&CK, sévérité
// suggérée, probabilité de faux positif, actions recommandées. Auto-applicable
// si confidence ≥ seuil. Préfère Anthropic (meilleur raisonnement structuré
// sur chaînes d'attaque) et active prompt caching car le system prompt
// (règles MITRE, format de sortie) est stable et volumineux.
// ---------------------------------------------------------------------------
export const POLICY_SECURITY_INCIDENT_TRIAGE: AiPolicy = {
  feature: "security_incident_triage",
  sensitivity: "client_data",
  allowedProviders: ["anthropic", "ollama", "openai"],
  // Scrub complet : les incidents contiennent hostnames, usernames, IPs —
  // tout ça sort vers le cloud SAUF si Ollama local dispo.
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.1, // décisions aussi déterministes que possible
  maxTokens: 1200,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  minConfidenceToShow: 0.6,
  timeoutMs: 60_000,
  cacheTtlSeconds: 600,
  preferAnthropic: true,
  enablePromptCaching: true,
  promptVersion: "security_incident_triage-v1",
};

// ---------------------------------------------------------------------------
// Synthèse narrative d'incident — remplace "résume-moi ces 40 lignes de log".
// Produit un narratif structuré : quoi/quand/qui/impact + timeline reconstituée
// + hypothèses + prochaines étapes. Claude excellent sur la narration
// sécurité, prompt caching sur le format+règles (stable) pour économiser
// sur les syntheses répétées du même incident (refresh après nouvelles
// alertes).
// ---------------------------------------------------------------------------
export const POLICY_SECURITY_INCIDENT_SYNTHESIS: AiPolicy = {
  feature: "security_incident_synthesis",
  sensitivity: "client_data",
  allowedProviders: ["anthropic", "ollama", "openai"],
  scrub: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.25,
  maxTokens: 2500,
  responseFormat: "json_object",
  humanApprovalRequired: true,
  timeoutMs: 180_000,
  preferAnthropic: true,
  enablePromptCaching: true,
  promptVersion: "security_incident_synthesis-v1",
};

export const POLICY_COPILOT_CHAT: AiPolicy = {
  feature: "copilot_chat",
  sensitivity: "client_data",
  // Self-hosted first (Ollama) — les données client peuvent rester on-prem.
  // Anthropic ajouté comme option cloud pour les tickets riches où Claude
  // Sonnet raisonne mieux sur l'historique long.
  allowedProviders: ["ollama", "anthropic", "openai"],
  // Sur Ollama LOCAL : clientNames non scrubbés — le tech a besoin que l'IA
  // sache de quel client elle parle (sinon elle hallucine un nom). Les
  // données restent on-prem, pas d'enjeu Loi 25.
  scrub: { pii: true, hostnames: true, clientNames: false },
  // Sur CLOUD (fallback si Ollama down) : scrub complet y compris clientNames.
  // L'IA citera des pseudonymes (ORG_1, ...), le deanonymizer les remplace à
  // la sortie. Perte de qualité acceptée vs exfiltration de noms clients.
  cloudScrubOverride: { pii: true, hostnames: true, clientNames: true },
  temperature: 0.3,
  maxTokens: 2000,
  humanApprovalRequired: false,
  timeoutMs: 120_000,
  promptVersion: "copilot_chat-v2-rag",
};
