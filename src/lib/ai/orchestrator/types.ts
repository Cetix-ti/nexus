// ============================================================================
// Types partagés par l'AiOrchestrator — policy, tasks, providers, résultats.
// ============================================================================

/**
 * Niveau de sensibilité d'une tâche IA. Détermine quels providers sont
 * autorisés (voir AiPolicy.allowedProviders) et si le scrub est obligatoire.
 *
 *  - public     : donnée générique (réponse-type, article KB public). Cloud OK.
 *  - internal   : donnée opérationnelle Nexus (notes internes, sujets de
 *                 tickets sans PII client, métadonnées). Cloud OK après scrub.
 *  - client_data: contenu direct d'un client (corps de courriel, pièces
 *                 jointes textuelles, noms/hostnames). Scrub obligatoire
 *                 pour le cloud, ou local-only selon la policy org.
 *  - regulated  : données de santé, financières sensibles, RH. Local-only.
 */
export type AiSensitivity = "public" | "internal" | "client_data" | "regulated";

/**
 * Identifiant de provider. Le routeur (`models.ts`) résout `providerKind`
 * vers une instance `AiProvider` au runtime. Ajouter un nouveau provider =
 * ajouter un entry ici + une implémentation dans `providers/`.
 */
export type ProviderKind = "openai" | "anthropic" | "ollama" | "local";

/**
 * Configuration de scrubbing appliquée avant envoi au provider. Aligne
 * avec l'anonymizer existant (src/lib/ai/anonymizer.ts) — les options
 * sont de simples switches, la logique fine reste dans l'anonymizer.
 */
export interface ScrubConfig {
  /** Applique la pseudonymisation complète (contacts, orgs, emails, téléphones). */
  pii: boolean;
  /** Remplace les hostnames d'endpoints par des tokens (ex: MV-LAP-24 → ENDPOINT_7). */
  hostnames: boolean;
  /** Remplace les noms de clients/organisations par des tokens. */
  clientNames: boolean;
}

/**
 * Policy explicite pour une tâche. Chaque feature définit SA policy — pas
 * de defaults implicites. Si le provider choisi n'est pas autorisé, la
 * tâche est bloquée (status="blocked") avec la raison loguée.
 */
export interface AiPolicy {
  /** Nom de la feature appelante — log + métriques. Ex: "triage", "kb_gen". */
  feature: string;
  sensitivity: AiSensitivity;
  allowedProviders: ProviderKind[];
  scrub: ScrubConfig;
  /** Température LLM. Défaut 0.3 (réponses cohérentes). */
  temperature?: number;
  /** Limite tokens de sortie. */
  maxTokens?: number;
  /** Format de réponse imposé : "text" (défaut) ou "json_object" pour structuré. */
  responseFormat?: "text" | "json_object";
  /** Si true, la feature garantit qu'aucun write automatique n'est fait
   *  avant clic humain explicite. Tous les features écrivants doivent
   *  déclarer true — c'est auto-documenté dans AiInvocation. */
  humanApprovalRequired: boolean;
  /** Budget max par appel (estimation). null = illimité. */
  costBudgetCents?: number;
  /** Confiance minimale pour afficher une suggestion. < seuil = cachée. */
  minConfidenceToShow?: number;
  /** Timeout en ms — coupe l'appel au-delà. Défaut 30s. */
  timeoutMs?: number;
  /**
   * TTL du cache de réponses en secondes. Activé seulement pour les features
   * déterministes (temperature basse). Un appel identique (même hash de
   * prompt + même modèle) dans ce délai retourne la réponse cachée sans
   * re-invoquer le provider. 0 ou undefined = pas de cache.
   *
   * Valeurs typiques :
   *   - 0 : toujours recalculer (chat, generation créative)
   *   - 300 (5 min) : features de classification / extraction stables
   *   - 900 (15 min) : audits / reports qui ne changent pas en quelques minutes
   */
  cacheTtlSeconds?: number;
  /**
   * Longueur MINIMUM du prompt user (chars) pour que l'appel soit envoyé au
   * provider. En-dessous, on retourne ok:false sans consommer de tokens ni
   * de temps de compute. Exemple : triage avec un sujet de 5 chars et une
   * description vide ne donne rien d'utile — mieux vaut skip.
   * 0 ou undefined = pas de minimum.
   */
  minInputChars?: number;
  /**
   * Override par-feature de la préférence de provider. Quand true, on
   * essaie OpenAI en premier (si autorisé), avec fallback Ollama.
   * Utile pour les features où la précision > self-hosted (triage auto
   * à la création, category audit, etc.).
   * Remplace la logique globale `AI_PREFER_CLOUD=1` uniquement pour cette
   * feature — les autres restent sur la préférence globale.
   */
  preferOpenAI?: boolean;
  /**
   * Préfère Anthropic Claude en premier (si autorisé), fallback Ollama
   * puis OpenAI. Utile pour les features narratives longues (resolution
   * notes, monthly report, escalation brief) où Claude excelle, et pour
   * les features à system prompt volumineux stable (triage avec
   * taxonomie, risk_analysis avec contexte org) qui bénéficient du
   * prompt caching natif (-90% coût sur l'input répété dans 5 min).
   * Mutuellement exclusif avec `preferOpenAI` — si les deux sont true,
   * Anthropic gagne.
   */
  preferAnthropic?: boolean;
  /**
   * Active le prompt caching côté Anthropic sur le system prompt. Requiert
   * un system prompt d'au moins ~5000 chars sinon Anthropic rejette. À
   * activer pour les features qui envoient systématiquement un préfixe
   * stable volumineux (taxonomie complète, contexte org complet, règles
   * métier étendues). Sans effet sur les autres providers.
   */
  enablePromptCaching?: boolean;
  /**
   * Override de `scrub` à appliquer UNIQUEMENT quand le provider retenu est
   * cloud (anthropic, openai). Si undefined, la politique `scrub` standard
   * s'applique à tous les providers.
   *
   * Cas d'usage typique : features qui tolèrent un scrub léger sur Ollama
   * local (ex: copilot_chat garde `clientNames: false` pour que l'IA sache
   * de quel client elle parle), mais qui doivent ÉVITER de leaker ces noms
   * vers le cloud si Ollama tombe. Avec `cloudScrubOverride: { pii: true,
   * hostnames: true, clientNames: true }`, le fallback cloud force un scrub
   * complet — assume Loi 25 même sans changer la policy par défaut.
   */
  cloudScrubOverride?: ScrubConfig;
  /**
   * Seuil de confidence minimum pour qu'une suggestion soit auto-appliquée
   * côté code appelant (ex: applyTriageIfConfident). Les sanity checks filtrent
   * déjà les hallucinations — ce floor est un garde-fou final. Valeurs
   * typiques :
   *   - 0.3 : "classer tout, corriger via feedback" (stratégie actuelle triage)
   *   - 0.6 : conservateur, ne classe que les cas évidents
   *   - 0.85 : quasi-manuel, IA en pur copilote
   * Peut être ajusté au runtime via AiFeatureConfig (non implémenté encore —
   * futur settings > intelligence).
   */
  autoApplyFloor?: number;
  /**
   * Version du prompt courant de la feature. Permet de grouper les invocations
   * par version dans le dashboard et d'identifier des régressions quand un
   * changement de prompt fait chuter le taux d'acceptation. Convention :
   * "<feature>-v<semver>" ou hash SHA256 court. Mise à jour manuelle lors
   * d'un changement significatif du prompt système.
   */
  promptVersion?: string;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Contexte optionnel pour l'audit — permet de relier l'invocation à une
 * entité Nexus pour cascade de suppression (Loi 25) et analyses.
 */
export interface AiTaskContext {
  userId?: string;
  ticketId?: string;
  organizationId?: string;
}

/**
 * Tâche IA soumise à l'orchestrateur.
 */
export interface AiTask {
  policy: AiPolicy;
  messages: AiMessage[];
  context?: AiTaskContext;
  /** Hint sur le type de tâche — utilisé pour les métriques + le router
   *  de modèle (ex: "classification" → on préfère Ollama si dispo). */
  taskKind?:
    | "classification"
    | "generation"
    | "summarization"
    | "extraction"
    | "embedding"
    | "chat";
  /** Force un modèle spécifique (override du routing). Rarement utilisé. */
  forceModel?: string;
  /**
   * Validateur optionnel de la réponse IA. Si retourne `false`, la réponse
   * est considérée comme *parse_failure* (JSON invalide, schéma manqué, etc.)
   * et l'orchestrateur tente automatiquement UN retry avec un autre provider
   * autorisé. Exemple d'usage pour les features qui exigent JSON strict :
   *   responseValidator: (c) => { try { JSON.parse(c); return true; } catch { return false; } }
   *
   * Sans validateur, seuls les échecs provider (timeout, 5xx, network) sont
   * retriés. Les features qui parsent leur réponse et échouent silencieusement
   * (schema violation) passent en statut `ok` alors que le résultat est
   * inexploitable — grave angle mort côté dashboard. Le validateur permet
   * de distinguer proprement.
   */
  responseValidator?: (content: string) => boolean;
}

/**
 * Réponse de l'orchestrateur. `ok=true` → content utilisable. `ok=false`
 * → blocked/error : le caller doit afficher un message et/ou fallback.
 */
export interface AiResult {
  ok: boolean;
  content?: string;
  /**
   * Provider qui a servi la réponse. "cache" est une valeur spéciale
   * renvoyée quand la réponse vient du cache en mémoire (aucun appel LLM
   * effectué). Les autres valeurs correspondent aux ProviderKind standards.
   */
  provider?: ProviderKind | "cache";
  modelName?: string;
  promptTokens?: number;
  responseTokens?: number;
  costCents?: number;
  latencyMs: number;
  /** ID AiInvocation — utilisé par l'UI pour remonter l'action humaine
   *  (accept/edit/reject) via AiOrchestrator.recordHumanAction(). */
  invocationId?: string;
  /** Si ok=false, raison du blocage ou erreur.
   *  - blocked : policy-level refus (provider absent, input trop court)
   *  - provider_error : 4xx/5xx provider ou erreur réseau
   *  - timeout : dépassement du timeoutMs policy
   *  - budget : budget cost dépassé (non utilisé actuellement)
   *  - parse_failure : réponse reçue mais rejetée par responseValidator
   *    (JSON invalide, schéma non conforme, etc.) */
  error?: {
    kind: "blocked" | "provider_error" | "timeout" | "budget" | "parse_failure";
    reason: string;
  };
}

/**
 * Contrat d'un provider IA. Une implémentation = un modèle ou famille.
 * Les providers ne gèrent PAS le scrub ni l'audit — c'est l'orchestrateur
 * qui s'en charge. Un provider reçoit des messages déjà nettoyés et
 * renvoie juste le texte brut.
 */
export interface AiProvider {
  readonly kind: ProviderKind;
  /** Vérifie que le provider est accessible (ping, auth). Appelé au démarrage
   *  ou par /api/v1/ai/health. */
  isAvailable(): Promise<boolean>;
  /** Exécute un appel de type chat. */
  chat(args: {
    messages: AiMessage[];
    model: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: "text" | "json_object";
    timeoutMs?: number;
    /** Signal optionnel au provider d'activer le prompt caching (Anthropic
     *  uniquement pour l'instant). Ignoré par les providers qui ne le
     *  supportent pas. */
    enablePromptCaching?: boolean;
  }): Promise<ProviderResponse>;
  /** Tarification — renvoie le coût estimé en cents pour des tokens
   *  donnés (basé sur les tarifs officiels du provider). 0 pour les
   *  providers gratuits (Ollama). */
  estimateCostCents(promptTokens: number, responseTokens: number, model: string): number;
}

export interface ProviderResponse {
  content: string;
  modelName: string;
  promptTokens?: number;
  responseTokens?: number;
}
