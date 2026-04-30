// ============================================================================
// AI TRIAGE — Phase 1 #1 du copilote Nexus.
//
// Analyse un ticket tout juste créé pour produire en UN seul appel LLM :
//   - un résumé d'une ligne
//   - suggestion de catégorie (chemin hiérarchique)
//   - suggestion de priorité avec confiance
//   - suggestion de type (incident / service_request / problem / change)
//   - détection de doublon probable (parmi les tickets ouverts récents)
//   - hint d'incident majeur (plusieurs billets similaires en peu de temps)
//
// Le résultat est logué dans AiInvocation (auditable). Les champs à forte
// confiance peuvent être auto-appliqués au ticket (catégorie absente,
// priorité LOW-DEFAULT à remonter). Tout le reste reste en suggestion
// visible à l'agent qui accepte / édite / rejette.
//
// Remplace les anciens auto-categorize / auto-prioritize en un seul call —
// économise un appel IA par ticket et donne à l'IA un contexte plus riche
// (candidats doublons + catégories disponibles) pour de meilleures décisions.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_TRIAGE } from "@/lib/ai/orchestrator/policies";
import {
  SANITIZE_SYSTEM_INSTRUCTION,
  sanitizeAndWrap,
} from "@/lib/ai/sanitize";
import {
  getOrgContextFacts,
  formatFactsForPrompt,
  type OrgContextFact,
} from "./org-context";

export interface TriageResult {
  /** Résumé d'une ligne lisible par un agent pressé. */
  summary: string;
  /** Type suggéré (matche l'enum TicketType). */
  suggestedType?: "INCIDENT" | "SERVICE_REQUEST" | "PROBLEM" | "CHANGE";
  /** Chemin de catégorie suggéré — tableau de noms du root vers la feuille. */
  categoryPath?: string[];
  /** ID résolu de la catégorie la plus profonde qui matche. Null si aucun match. */
  categoryId?: string | null;
  categoryConfidence?: number;
  /** Priorité suggérée + confiance textuelle. */
  priority?: "low" | "medium" | "high" | "critical";
  priorityConfidence?: "low" | "medium" | "high";
  priorityReasoning?: string;
  /** Si l'IA estime qu'un ticket ouvert récent est probablement le même problème. */
  possibleDuplicateOfId?: string | null;
  possibleDuplicateReason?: string;
  /** Signalement d'incident majeur : plusieurs billets similaires < 30 min. */
  majorIncidentHint?: {
    detected: boolean;
    reason?: string;
    relatedTicketIds: string[];
  };
}

// ---------------------------------------------------------------------------
// Candidats doublons — recherche textuelle simple (sans embeddings) pour
// alimenter le contexte IA. L'IA choisit ensuite lequel, si tout, est un
// vrai doublon. Scope : mêmes organisation + tickets ouverts des 2 dernières
// heures, max 10 candidats.
// ---------------------------------------------------------------------------
interface SimilarCandidate {
  id: string;
  number: number;
  subject: string;
  createdAt: Date;
  status: string;
}

export async function findSimilarOpenTickets(
  organizationId: string,
  subject: string,
  excludeTicketId: string,
  sinceMinutes = 120,
): Promise<SimilarCandidate[]> {
  if (!subject.trim()) return [];
  const since = new Date(Date.now() - sinceMinutes * 60_000);
  // Extraction de mots-clés simples : tokens de 4+ chars qui ne sont pas
  // des stopwords. Passe-partout pour matcher "printer" / "VPN" / "outlook"
  // sans avoir à monter un index full-text PostgreSQL.
  const stop = new Set([
    "avec", "sans", "dans", "pour", "mais", "plus", "tous", "tout",
    "avoir", "faire", "bien", "autre", "autres", "notre", "notre",
    "there", "with", "from", "have", "this", "that", "they", "them",
  ]);
  const tokens = subject
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôöùûüÿç\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !stop.has(t))
    .slice(0, 5);
  if (tokens.length === 0) return [];

  const rows = await prisma.ticket.findMany({
    where: {
      organizationId,
      id: { not: excludeTicketId },
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
      createdAt: { gte: since },
      OR: tokens.map((t) => ({ subject: { contains: t, mode: "insensitive" as const } })),
    },
    select: { id: true, number: true, subject: true, createdAt: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Catégories disponibles — récupère l'arborescence pour que le prompt
// contienne les catégories réellement présentes en DB (évite les
// hallucinations de noms qui n'existent pas). Scope global + de l'org.
// ---------------------------------------------------------------------------
interface CategoryNode {
  id: string;
  name: string;
  path: string[]; // chemin complet du root vers ce node
}

async function listCategoryPaths(
  organizationId: string,
  isInternal: boolean,
): Promise<CategoryNode[]> {
  // Filtrage par scope : un ticket interne ne doit voir que les catégories
  // INTERNAL ; un ticket client uniquement les CLIENT. L'IA reçoit donc
  // une liste plus focalisée → meilleure précision et moins de fausses
  // assignations entre univers.
  const cats = await prisma.category.findMany({
    where: {
      isActive: true,
      scope: isInternal ? "INTERNAL" : "CLIENT",
      OR: [{ organizationId: null }, { organizationId }],
    },
    select: { id: true, name: true, parentId: true },
    take: 500,
  });
  const byId = new Map(cats.map((c) => [c.id, c]));
  function pathFor(id: string): string[] {
    const out: string[] = [];
    let cur: { id: string; name: string; parentId: string | null } | undefined =
      byId.get(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return out;
  }
  return cats.map((c) => ({ id: c.id, name: c.name, path: pathFor(c.id) }));
}

// ---------------------------------------------------------------------------
// Prompt + parsing JSON IA
// ---------------------------------------------------------------------------

interface TicketContext {
  subject: string;
  description: string;
  senderEmail?: string | null;
  orgName?: string | null;
}

function buildTriagePrompt(args: {
  ticket: TicketContext;
  categories: CategoryNode[];
  similar: SimilarCandidate[];
  orgFacts: OrgContextFact[];
  /** Vocabulaire technique spécifique à ce client (hostnames, apps custom,
   *  acronymes métier) extrait par le job `client-vocabulary-extractor`. */
  orgVocabulary?: string[];
  semanticSuggestions?: Array<{
    categoryId: string;
    path: string;
    similarity: number;
    sampleCount: number;
  }>;
  learnedGuidance?: string;
}): { system: string; user: string } {
  // On passe l'arborescence sous forme de liste compacte de chemins.
  // Limite élevée (250 lignes) : gemma3:12b a 128K de contexte, le coût
  // de 500 tokens supplémentaires est négligeable vs la perte de
  // précision quand la bonne catégorie n'est pas dans les 80 premières.
  const catLines = args.categories
    .filter((c) => c.path.length >= 1)
    .slice(0, 250)
    .map((c) => `- [${c.id}] ${c.path.join(" > ")}`)
    .join("\n");

  const similarLines =
    args.similar.length === 0
      ? "(aucun billet ouvert similaire dans les 2 dernières heures)"
      : args.similar
          .map(
            (s) =>
              `- [${s.id}] #${s.number} (${s.status}, ${timeAgo(s.createdAt)}) : ${s.subject.slice(0, 120)}`,
          )
          .join("\n");

  const system = `Tu es un triage officer MSP. Tu analyses un billet technique qui vient d'arriver et tu produis une proposition structurée à un technicien humain qui validera.

Réponds EXCLUSIVEMENT en JSON valide, sans markdown, format strict :
{
  "summary": "résumé d'une ligne (max 120 char), factuel, en français",
  "suggestedType": "INCIDENT" | "SERVICE_REQUEST" | "PROBLEM" | "CHANGE",
  "categoryId": "<id exact tiré de la liste fournie — doit pointer la FEUILLE la plus profonde qui correspond>" | null,
  "categoryPath": ["Niveau 1", "Niveau 2", "Niveau 3"],
  "categoryConfidence": 0.0-1.0,
  "categoryReasoning": "1 phrase : quel est le sujet principal du billet, et pourquoi cette catégorie correspond (ou null)",
  "priority": "low" | "medium" | "high" | "critical",
  "priorityConfidence": "low" | "medium" | "high",
  "priorityReasoning": "courte raison (1 phrase)",
  "possibleDuplicateOfId": "<id exact>" | null,
  "possibleDuplicateReason": "raison si duplicate détecté" | null,
  "majorIncidentHint": { "detected": bool, "reason": "...", "relatedTicketIds": ["id1", "id2"] }
}

---- CATÉGORISATION — PROCESSUS RIGOUREUX ----

Avant de choisir une catégorie, identifie MENTALEMENT le SUJET PRINCIPAL du billet en 1-3 mots (le produit/service/problème concret évoqué : "WordPress", "Outlook", "imprimante", "VPN", "Active Directory", "sauvegarde Veeam", ...).

Ensuite, CHERCHE dans la liste fournie une catégorie dont le chemin contient LITTÉRALEMENT ce sujet ou un synonyme direct (même technologie / même domaine).

PRÉFÉRENCE POUR LA PROFONDEUR — TRÈS IMPORTANT :
- La liste contient des catégories à 1, 2 ou 3 niveaux. Tu DOIS TOUJOURS choisir la FEUILLE la plus spécifique qui correspond au sujet.
- Si "Infrastructure > Serveurs > Active Directory" existe ET correspond, c'est CELLE-CI qu'il faut retourner — pas "Infrastructure" ni "Infrastructure > Serveurs".
- Ne retourne un niveau 1 ou 2 QUE si aucun enfant plus spécifique ne correspond vraiment.
- categoryPath reflète le chemin EXACT (noms tels qu'ils apparaissent dans la liste) du parent racine vers la feuille choisie. Si tu choisis niveau 3, categoryPath a 3 éléments. Si niveau 2, 2 éléments. Si niveau 1, 1 élément.
- categoryId et categoryPath doivent TOUJOURS être cohérents : categoryId = l'ID de la catégorie au bout du chemin categoryPath.

RÈGLES ABSOLUES :
1. Si AUCUNE catégorie ne correspond littéralement au sujet principal → categoryId = null, categoryPath = [], categoryConfidence ≤ 0.3.
2. Ne FORCE JAMAIS une catégorie sur une connexion INDIRECTE :
   - ❌ "Ticket sur site web WordPress → je classe dans Outlook parce qu'on utilise Outlook pour se communiquer"
   - ❌ "Ticket sur imprimante → je classe dans Réseau parce qu'une imprimante est connectée au réseau"
   - ❌ "Ticket sur Veeam → je classe dans Sauvegardes parce que les sauvegardes protègent les données, même si le client parle du software Veeam précisément"
3. Les mots "courriel", "email", "mail", "outlook", "office", "compte" sont TROP génériques seuls. Tu NE dois PAS baser une catégorisation sur UNIQUEMENT un de ces mots partagé. Exemples d'erreurs à éviter :
   - ❌ "Un utilisateur a reçu un courriel de phishing → je classe dans 'Exchange Online → Synchronisation' parce que le mot courriel y apparaît" — NON, c'est un problème de SÉCURITÉ (Phishing/Hameçonnage), pas de synchronisation.
   - ❌ "Compte Outlook bloqué après tentatives de login → je classe dans 'Logiciels → Outlook'" — souvent plus juste dans 'Sécurité → Compte verrouillé' ou 'Microsoft 365 → MFA'.
   - ❌ "Message d'erreur qui apparaît au démarrage → Windows" — le mot 'message' ne dit rien sur le sujet réel.
4. DÉSAMBIGUÏSATION spam/phishing/courriel indésirable : un ticket sur un courriel SUSPECT, INDÉSIRABLE, FRAUDULEUX, HAMEÇONNAGE ou PHISHING doit aller dans une catégorie de SÉCURITÉ (chemin contenant "Phishing", "Hameçonnage", "Sécurité", "Anti-spam"), PAS dans une catégorie Outlook/Exchange/Email.
5. Un match "faible mais plausible" (parent correct, pas de feuille spécifique) → catégorie racine + confidence 0.4-0.6.
6. Confidence ≥ 0.75 SEULEMENT si le chemin de catégorie contient un mot-clé DISCRIMINANT présent dans le sujet ou la description (pas "courriel" ou "outlook" seuls — un mot plus spécifique comme "phishing", "wordpress", "vpn", "fortigate", "kerberos", "bitlocker", nom d'application, nom de serveur, code d'erreur).
7. categoryReasoning DOIT citer le mot-clé DISCRIMINANT matché entre le billet et le chemin. Si le seul mot commun est générique (courriel, email, outlook, office, compte, message, système, windows) → categoryId = null ou categoryConfidence < 0.5.

---- AUTRES CHAMPS ----

- priority : "critical" seulement si impact massif ou client bloqué. "high" si plusieurs utilisateurs ou service clé. "medium" par défaut. "low" si demande simple, non urgente.
- type : INCIDENT si ça ne fonctionne plus. SERVICE_REQUEST si demande d'ajout / modification / info. PROBLEM si erreur récurrente sans cause identifiée. CHANGE si changement planifié.
- possibleDuplicateOfId : uniquement si un billet de la liste décrit VRAISEMBLABLEMENT le même problème (pas juste un thème similaire).
- majorIncidentHint.detected=true : si ≥ 3 billets similaires dans la liste ciblent manifestement le même service en panne.

${SANITIZE_SYSTEM_INSTRUCTION}${args.learnedGuidance ? `\n${args.learnedGuidance}` : ""}`;

  const senderLine = args.ticket.senderEmail
    ? `Expéditeur : ${args.ticket.senderEmail}\n`
    : "";
  const orgLine = args.ticket.orgName ? `Client : ${args.ticket.orgName}\n` : "";

  const factsBlock = formatFactsForPrompt(args.orgFacts);
  const factsSection = factsBlock ? `\n\n---\n\n${factsBlock}` : "";

  // Vocabulaire client — aide le LLM à interpréter le jargon local. Sans
  // ce contexte, un ticket qui mentionne "problème sur SRV-FS02" pourrait
  // être classé générique alors que SRV-FS02 est un serveur de fichiers
  // connu du client → signal fort pour la catégorisation.
  const vocabularySection =
    args.orgVocabulary && args.orgVocabulary.length > 0
      ? `\n\n---\n\nVOCABULAIRE TECHNIQUE DE CE CLIENT (appris des tickets passés) — interprète ces termes comme des entités réelles, pas des mots génériques :
${args.orgVocabulary
  .slice(0, 12)
  .map((v) => `- ${v}`)
  .join("\n")}`
      : "";

  // Wrapping anti-injection sur sujet + description (peuvent venir d'emails
  // externes via email-to-ticket — source non-fiable).
  const wrappedSubject = sanitizeAndWrap(args.ticket.subject, "triage");
  const wrappedDescription = sanitizeAndWrap(
    args.ticket.description.slice(0, 3000),
    "triage",
  );

  const user = `${senderLine}${orgLine}Sujet : ${wrappedSubject}

Description :
${wrappedDescription}

---

Catégories disponibles (id + chemin) :
${catLines || "(aucune)"}
${
  args.semanticSuggestions && args.semanticSuggestions.length > 0
    ? `\n---\n\nSUGGESTIONS SÉMANTIQUES (vecteurs d'embeddings comparés aux tickets historiques de chaque catégorie) — ORDRE DE PROBABILITÉ :
${args.semanticSuggestions
  .map(
    (s, i) =>
      `${i + 1}. [${s.categoryId}] ${s.path} — similarité ${Math.round(s.similarity * 100)}% (${s.sampleCount} tickets passés)`,
  )
  .join("\n")}

Ces suggestions sont BASÉES SUR DES DONNÉES RÉELLES : la similarité représente à quel point ce ticket ressemble sémantiquement aux tickets passés de la catégorie. Une similarité ≥ 75% est un signal FORT. Si ta catégorisation diverge du top-3 sans raison claire, revois-la.`
    : ""
}

---

Billets ouverts similaires (2 dernières heures, même client) :
${similarLines}${factsSection}${vocabularySection}`;

  return { system, user };
}

/**
 * Tokenisation compacte pour la sanity check catégorie. Mot ≥ 4 chars,
 * normalisé (lowercase + accents retirés). Set pour test d'intersection.
 */
const SANITY_STOP = new Set([
  "avec", "sans", "dans", "pour", "mais", "plus", "tous", "tout",
  "avoir", "faire", "bien", "autre", "autres", "cette", "cela",
  "with", "from", "have", "this", "that", "they", "them", "there",
  // Noms génériques de catégories — ne comptent pas comme overlap
  "logiciels", "applications", "materiel", "informatique", "support",
  "utilisateur", "reseau", "connectivite", "securite", "infrastructure",
  "serveur", "cloud", "telephonie", "communication", "surveillance",
  "monitoring", "sauvegardes", "restauration", "facturation",
  "administration", "projets", "changements", "rappel",
  // Mots techniques TROP génériques — présents dans 80%+ des tickets ET
  // des catégories, donc un match sur eux seul est un faux signal. Exemple
  // classique : ticket "courriel de phishing reçu" matché sur "Outlook ›
  // Synchronisation" uniquement parce que le mot "courriel" est dans
  // les deux. Ces mots DOIVENT être accompagnés d'un autre mot discriminant.
  "courriel", "courriels", "email", "emails", "mail", "mails", "message",
  "messages", "outlook", "office", "microsoft", "compte", "comptes",
  "boite", "boites", "utilisateurs", "systeme", "systemes", "probleme",
  "problemes", "erreur", "erreurs", "windows",
]);
function tokenize(text: string): Set<string> {
  return tokenizeWith(text, SANITY_STOP);
}

/**
 * Tokenize avec une liste de stop-words injectée — permet d'étendre
 * SANITY_STOP avec les mots appris dynamiquement par le job d'audit.
 */
function tokenizeWith(text: string, stop: Set<string>): Set<string> {
  const normalized = (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  const out = new Set<string>();
  for (const tok of normalized.split(/\s+/)) {
    if (tok.length < 4) continue;
    if (/^\d+$/.test(tok)) continue;
    if (stop.has(tok)) continue;
    out.add(tok);
  }
  return out;
}

function timeAgo(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  return `il y a ${Math.floor(mins / 60)} h`;
}

/**
 * Résolution du chemin hiérarchique (`categoryPath`) vers l'ID de la feuille
 * la plus profonde qui matche réellement l'arbre. Fait aussi de la tolérance
 * aux petites divergences LLM (casse, accents, espaces).
 *
 * Pourquoi : le LLM a tendance à retourner un `categoryId` de niveau 1 quand
 * il hésite, même s'il visualise clairement un chemin hiérarchique. Utiliser
 * le chemin (noms) comme source de vérité et résoudre côté serveur donne un
 * ID final plus profond et plus fiable.
 *
 * Algorithme :
 *   - Normalise chaque nom (lower, NFD, trim).
 *   - Pour chaque niveau du chemin : cherche un noeud dont parentId == précédent
 *     et dont le nom normalisé matche. Si plusieurs candidats, prend le premier.
 *   - Dès qu'un niveau ne matche plus, on s'arrête : retourne l'ID du
 *     dernier niveau matché (= le plus profond trouvé).
 *
 * Retourne null si aucun niveau ne matche.
 */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ChildNode {
  id: string;
  name: string;
  normalized: string;
}

// Exporté pour les tests unitaires (vitest). Usage interne uniquement — cette
// logique est un détail d'implémentation du triage.
export function _test_resolveDeepestCategoryFromPath(
  path: string[],
  categories: CategoryNode[],
  rawById: Map<string, { id: string; name: string; parentId: string | null }>,
): string | null {
  return resolveDeepestCategoryFromPath(path, categories, rawById);
}

export function _test_normalizeName(s: string): string {
  return normalizeName(s);
}

function resolveDeepestCategoryFromPath(
  path: string[],
  categories: CategoryNode[],
  rawById: Map<string, { id: string; name: string; parentId: string | null }>,
): string | null {
  if (!Array.isArray(path) || path.length === 0) return null;
  // Construit un index parent → enfants normalisés pour descente rapide.
  const childrenByParent = new Map<string | null, ChildNode[]>();
  for (const c of rawById.values()) {
    const key = c.parentId;
    const arr: ChildNode[] = childrenByParent.get(key) ?? [];
    arr.push({ id: c.id, name: c.name, normalized: normalizeName(c.name) });
    childrenByParent.set(key, arr);
  }

  let currentParent: string | null = null;
  let deepestId: string | null = null;
  for (const raw of path) {
    const target = normalizeName(raw);
    if (!target) break;
    const candidates: ChildNode[] = childrenByParent.get(currentParent) ?? [];
    // Match exact d'abord, puis match en "contient" si pas de match exact
    // (tolère "Active Directory" vs "AD" → pas de match ; vs "Active Directory (AD)" → contient).
    let hit: ChildNode | undefined = candidates.find(
      (c) => c.normalized === target,
    );
    if (!hit) {
      hit = candidates.find(
        (c) => c.normalized.includes(target) || target.includes(c.normalized),
      );
    }
    if (!hit) break;
    deepestId = hit.id;
    currentParent = hit.id;
  }
  // Sanity : vérifie que l'ID existe bien dans availableCategoryIds (sinon
  // c'est un bug quelque part — ne pas retourner un ID orphelin).
  if (deepestId && categories.some((c) => c.id === deepestId)) {
    return deepestId;
  }
  return null;
}

function depthOf(
  id: string,
  rawById: Map<string, { id: string; name: string; parentId: string | null }>,
): number {
  let d = 0;
  let cur: { parentId: string | null } | undefined = rawById.get(id);
  const seen = new Set<string>();
  while (cur && cur.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    d++;
    cur = rawById.get(cur.parentId);
  }
  return d;
}

function parseTriageJson(
  raw: string,
  availableCategoryIds: Set<string>,
  availableTicketIds: Set<string>,
  categoryNodes: CategoryNode[] = [],
): TriageResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Tente d'extraire un bloc {...} même si l'IA a enveloppé en prose.
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;

  const summary =
    typeof o.summary === "string" ? o.summary.trim().slice(0, 200) : "";
  if (!summary) return null;

  const typeRaw = String(o.suggestedType ?? "").toUpperCase();
  const suggestedType =
    typeRaw === "INCIDENT" ||
    typeRaw === "SERVICE_REQUEST" ||
    typeRaw === "PROBLEM" ||
    typeRaw === "CHANGE"
      ? (typeRaw as TriageResult["suggestedType"])
      : undefined;

  // On accepte BOTH categoryId (rétro-compat) ET categoryPath (nouveau champ
  // plus fiable). Si les deux sont fournis, on RÉSOUT le path côté serveur
  // et on choisit la source la plus PROFONDE des deux — le LLM peut retourner
  // un categoryId de niveau 1 par défaut même s'il a produit un path plus
  // profond dans categoryPath. Cette stratégie maximise la spécificité du
  // mapping.
  const rawCategoryId =
    typeof o.categoryId === "string" && availableCategoryIds.has(o.categoryId)
      ? o.categoryId
      : null;
  const rawCategoryPath = Array.isArray(o.categoryPath)
    ? (o.categoryPath as unknown[])
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .slice(0, 4)
    : [];

  // Résolution hiérarchique : reconstruit l'ID le plus profond à partir des
  // noms de chemin, en descendant l'arbre des catégories disponibles.
  const rawById = new Map<
    string,
    { id: string; name: string; parentId: string | null }
  >();
  // categoryNodes est passé depuis le caller ; on reconstitue parentId en
  // parcourant la path[] (qui a le chemin ordonné root→feuille).
  // Note : CategoryNode n'a pas `parentId` exposé ici. On reconstruit en
  // croisant les path[] : un node dont path[-2] == le name d'un autre node
  // est son parent.
  if (categoryNodes.length > 0) {
    // Construction d'un index path→id pour retrouver le parent d'un node.
    const idByPathKey = new Map<string, string>();
    for (const c of categoryNodes) {
      idByPathKey.set(c.path.map(normalizeName).join(" > "), c.id);
    }
    for (const c of categoryNodes) {
      const parentPath = c.path.slice(0, -1).map(normalizeName).join(" > ");
      const parentId = parentPath ? idByPathKey.get(parentPath) ?? null : null;
      rawById.set(c.id, { id: c.id, name: c.name, parentId });
    }
  }
  const resolvedFromPath =
    rawCategoryPath.length > 0 && rawById.size > 0
      ? resolveDeepestCategoryFromPath(rawCategoryPath, categoryNodes, rawById)
      : null;

  // Stratégie de fusion : on retient l'ID qui a la PROFONDEUR maximale.
  // Si le path résout à un niveau 3 mais que categoryId est un niveau 1,
  // le path gagne. Si les deux sont équivalents, le LLM a été cohérent.
  let categoryId: string | null = rawCategoryId;
  if (resolvedFromPath && rawById.size > 0) {
    const depthFromPath = depthOf(resolvedFromPath, rawById);
    const depthFromId = rawCategoryId ? depthOf(rawCategoryId, rawById) : -1;
    if (depthFromPath > depthFromId) {
      categoryId = resolvedFromPath;
    }
  } else if (!rawCategoryId && resolvedFromPath) {
    categoryId = resolvedFromPath;
  }
  const categoryConfidence =
    typeof o.categoryConfidence === "number"
      ? Math.max(0, Math.min(1, o.categoryConfidence))
      : undefined;

  const priorityRaw = String(o.priority ?? "").toLowerCase();
  const priority =
    priorityRaw === "low" ||
    priorityRaw === "medium" ||
    priorityRaw === "high" ||
    priorityRaw === "critical"
      ? (priorityRaw as TriageResult["priority"])
      : undefined;
  const priorityConfidence =
    o.priorityConfidence === "low" ||
    o.priorityConfidence === "medium" ||
    o.priorityConfidence === "high"
      ? (o.priorityConfidence as TriageResult["priorityConfidence"])
      : undefined;
  const priorityReasoning =
    typeof o.priorityReasoning === "string"
      ? o.priorityReasoning.slice(0, 300)
      : undefined;

  const possibleDuplicateOfId =
    typeof o.possibleDuplicateOfId === "string" &&
    availableTicketIds.has(o.possibleDuplicateOfId)
      ? o.possibleDuplicateOfId
      : null;
  const possibleDuplicateReason =
    typeof o.possibleDuplicateReason === "string"
      ? o.possibleDuplicateReason.slice(0, 300)
      : undefined;

  let majorIncidentHint: TriageResult["majorIncidentHint"] | undefined;
  if (o.majorIncidentHint && typeof o.majorIncidentHint === "object") {
    const m = o.majorIncidentHint as Record<string, unknown>;
    const related = Array.isArray(m.relatedTicketIds)
      ? (m.relatedTicketIds as unknown[])
          .filter((x): x is string => typeof x === "string")
          .filter((x) => availableTicketIds.has(x))
      : [];
    majorIncidentHint = {
      detected: !!m.detected,
      reason: typeof m.reason === "string" ? m.reason.slice(0, 300) : undefined,
      relatedTicketIds: related,
    };
  }

  // Calcul du categoryPath final (reflète le categoryId résolu, pas le path
  // brut du LLM qui peut être incomplet). Si on a descendu de 3 niveaux, le
  // chemin retourné fait 3 éléments.
  let finalCategoryPath: string[] | undefined;
  if (categoryId && categoryNodes.length > 0) {
    const node = categoryNodes.find((c) => c.id === categoryId);
    if (node) finalCategoryPath = node.path;
  } else if (rawCategoryPath.length > 0) {
    finalCategoryPath = rawCategoryPath;
  }

  return {
    summary,
    suggestedType,
    categoryId,
    categoryPath: finalCategoryPath,
    categoryConfidence,
    priority,
    priorityConfidence,
    priorityReasoning,
    possibleDuplicateOfId,
    possibleDuplicateReason,
    majorIncidentHint,
  };
}

// ---------------------------------------------------------------------------
// Main — lance le triage sur un ticket. Non bloquant (retourne null en cas
// d'erreur). Logué dans AiInvocation via l'orchestrateur.
// ---------------------------------------------------------------------------
/**
 * Fenêtre de protection contre les triages concurrents. Si un triage `ok` a
 * été loggé pour ce ticket dans les N dernières secondes, on retourne la
 * réponse existante au lieu de ré-appeler le LLM.
 *
 * Protège contre :
 *   - Double trigger à la création (webhook + email + UI clic rapide)
 *   - Backfill en batch qui re-traite des tickets déjà triagés récemment
 *   - Race conditions multi-instance
 *
 * 60s est assez court pour permettre une re-génération volontaire si le
 * tech a modifié subject/description et clique Régénérer — la modification
 * de `updated_at` invalide implicitement via le hash pour les cas critiques.
 */
const TRIAGE_DEDUP_WINDOW_SEC = 60;

export async function triageTicket(ticketId: string): Promise<TriageResult | null> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        description: true,
        organizationId: true,
        isInternal: true,
        organization: { select: { name: true } },
      },
    });
    if (!ticket) return null;
    if (!ticket.subject?.trim()) return null;

    // Idempotence : si un triage ok récent existe sur le même ticket, le
    // retourner directement. Évite les appels en double sur webhook + email
    // simultané ou pendant un backfill batch.
    const recentCutoff = new Date(
      Date.now() - TRIAGE_DEDUP_WINDOW_SEC * 1000,
    );
    const recent = await prisma.aiInvocation.findFirst({
      where: {
        ticketId,
        feature: "triage",
        status: "ok",
        createdAt: { gte: recentCutoff },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, response: true, createdAt: true },
    });
    if (recent?.response) {
      try {
        const cached = JSON.parse(recent.response) as TriageResult;
        console.log(
          `[ai-triage] ticket ${ticketId} — triage récent (${Math.round((Date.now() - recent.createdAt.getTime()) / 1000)}s) réutilisé, skip LLM`,
        );
        return cached;
      } catch {
        // Réponse stockée invalide — on continue avec un nouveau triage.
      }
    }

    const [similar, categories, orgFacts, orgVocabulary] = await Promise.all([
      findSimilarOpenTickets(ticket.organizationId, ticket.subject, ticket.id, 120),
      listCategoryPaths(ticket.organizationId, ticket.isInternal),
      getOrgContextFacts(ticket.organizationId, 10),
      // Vocabulaire client spécifique extrait par le job
      // `client-vocabulary-extractor` (hostnames internes, noms d'apps,
      // acronymes métier). Permet au LLM de comprendre le jargon local
      // au lieu de le traiter comme du bruit.
      prisma.aiMemory.findMany({
        where: {
          scope: `org:${ticket.organizationId}`,
          category: "vocabulary",
          verifiedAt: { not: null },
          rejectedAt: null,
        },
        select: { content: true },
        take: 15,
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    // Ancrage sémantique via centroids de catégorie — apprentissage
    // continu. L'embedding du ticket est comparé aux centroids de chaque
    // catégorie (moyenne des tickets résolus). Le top-5 est passé au LLM
    // comme SUGGESTIONS fortes, et utilisé en sanity check post-LLM.
    let semanticSuggestions: Array<{
      categoryId: string;
      path: string;
      similarity: number;
      sampleCount: number;
    }> = [];
    try {
      const { ensureTicketEmbedding } = await import("@/lib/ai/embeddings");
      const { suggestCategoriesByCentroid } = await import(
        "@/lib/ai/jobs/category-centroids"
      );
      await ensureTicketEmbedding(ticket.id);
      const t = await prisma.ticket.findUnique({
        where: { id: ticket.id },
        select: { embedding: true },
      });
      if (t && Array.isArray(t.embedding)) {
        const matches = await suggestCategoriesByCentroid(
          t.embedding as number[],
          5,
        );
        const catMap = new Map(categories.map((c) => [c.id, c]));
        semanticSuggestions = matches
          .filter((m) => m.similarity >= 0.55)
          .map((m) => ({
            categoryId: m.categoryId,
            path: catMap.get(m.categoryId)?.path.join(" > ") ?? "",
            similarity: m.similarity,
            sampleCount: m.sampleCount,
          }))
          .filter((m) => m.path); // ignore centroids pour catégories supprimées
      }
    } catch (err) {
      console.warn("[triage] centroid fetch failed:", err);
    }

    // Charge la guidance apprise par le job prompt-evolution. Sous forme
    // de lignes formatées prêtes à être concaténées au prompt system.
    let learnedGuidance = "";
    try {
      const { getPromptGuidance, formatGuidanceForPrompt } = await import(
        "@/lib/ai/jobs/prompt-evolution"
      );
      const g = await getPromptGuidance("triage");
      learnedGuidance = formatGuidanceForPrompt(g);
    } catch {
      /* degrade silently — guidance optionnelle */
    }

    const { system, user } = buildTriagePrompt({
      ticket: {
        subject: ticket.subject,
        description: ticket.description ?? "",
        orgName: ticket.organization?.name ?? null,
      },
      categories,
      similar,
      orgFacts,
      orgVocabulary: orgVocabulary.map((v) => v.content),
      semanticSuggestions,
      learnedGuidance,
    });

    const result = await runAiTask({
      policy: POLICY_TRIAGE,
      context: {
        ticketId: ticket.id,
        organizationId: ticket.organizationId,
      },
      taskKind: "classification",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (!result.ok || !result.content) return null;

    const parsed = parseTriageJson(
      result.content,
      new Set(categories.map((c) => c.id)),
      new Set(similar.map((s) => s.id)),
      categories,
    );

    // Charge les patterns appris en autonome par le job d'audit (mots à
    // ajouter à SANITY_STOP, mappings catégorie forcés, etc.). Retourne
    // via cache 5 min → coût DB négligeable.
    const { getLearnedPatterns } = await import("@/lib/ai/jobs/ai-audit");
    const learned = await getLearnedPatterns("triage").catch(() => ({
      sanityStops: new Set<string>(),
      categoryMappings: [] as Array<{ keyword: string; category: string }>,
      confidencePenalties: [] as string[],
    }));

    // Sanity check catégorie : si l'IA a choisi une catégorie avec forte
    // confiance mais que son CHEMIN ne partage aucun mot-clé avec le
    // ticket, c'est probablement une hallucination. On cap la confidence
    // à 0.35 pour empêcher l'auto-apply (seuil 0.7) et signaler au tech
    // qu'il doit valider manuellement.
    //
    // Trois sanity checks cumulatifs :
    //   1. Overlap tokens non-génériques
    //   2. Centroid cosine + top-5 sémantique
    //   3. Penalty apprise depuis feedbacks humains
    //
    // Si les TROIS échouent → rejet TOTAL (categoryId = null). Empêche un
    // auto-apply catastrophique que le tech devrait ensuite corriger à la main.
    let failedChecks = 0;
    if (parsed && parsed.categoryId && (parsed.categoryConfidence ?? 0) >= 0.5) {
      const cat = categories.find((c) => c.id === parsed.categoryId);
      if (cat) {
        // Étend SANITY_STOP avec les mots appris par le feedback loop d'audit.
        // Les mots que gpt-4o a identifiés comme "trop génériques" à plusieurs
        // reprises sont automatiquement exclus du scoring de matching.
        const dynStop = new Set(SANITY_STOP);
        for (const w of learned.sanityStops) dynStop.add(w);
        const pathTokens = tokenizeWith(cat.path.join(" "), dynStop);
        const ticketTokens = tokenizeWith(
          `${ticket.subject ?? ""} ${ticket.description ?? ""}`,
          dynStop,
        );
        let hasOverlap = false;
        for (const t of pathTokens) {
          if (ticketTokens.has(t)) {
            hasOverlap = true;
            break;
          }
        }
        if (!hasOverlap) {
          console.warn(
            `[ai-triage] catégorie '${cat.path.join(" > ")}' rejetée : aucun mot commun avec le ticket (${ticket.subject?.slice(0, 60)})`,
          );
          parsed.categoryConfidence = Math.min(
            parsed.categoryConfidence ?? 0,
            0.35,
          );
          failedChecks++;
        }

        // Second sanity check — basé sur les centroids vectoriels. Si le
        // LLM a choisi une catégorie qui n'est pas dans le top-5 des
        // suggestions sémantiques ET que la cosine de la catégorie choisie
        // avec le ticket est FAIBLE, c'est probablement une hallucination
        // malgré l'overlap de tokens. On cap la confidence.
        if (semanticSuggestions.length > 0) {
          const inTop = semanticSuggestions.some(
            (s) => s.categoryId === parsed.categoryId,
          );
          if (!inTop) {
            // Calcule la cosine de la catégorie choisie (si elle a un centroid).
            const { suggestCategoriesByCentroid } = await import(
              "@/lib/ai/jobs/category-centroids"
            );
            const t = await prisma.ticket.findUnique({
              where: { id: ticket.id },
              select: { embedding: true },
            });
            if (t && Array.isArray(t.embedding)) {
              const allMatches = await suggestCategoriesByCentroid(
                t.embedding as number[],
                50,
              );
              const m = allMatches.find(
                (x) => x.categoryId === parsed.categoryId,
              );
              if (m && m.similarity < 0.5) {
                console.warn(
                  `[ai-triage] catégorie '${cat.path.join(" > ")}' hors top-5 sémantique (cosine ${Math.round(m.similarity * 100)}%) → confidence plafonnée`,
                );
                parsed.categoryConfidence = Math.min(
                  parsed.categoryConfidence ?? 0,
                  0.4,
                );
                failedChecks++;
              }
            }
          }
        }

        // Troisième sanity check — pénalité apprise depuis les thumbs-down
        // humains. Si cette catégorie a été plusieurs fois rejetée sur des
        // tickets contenant les mêmes tokens, on downgrade la confidence.
        try {
          const { categoryPenaltyForText } = await import(
            "@/lib/ai/jobs/category-feedback-learner"
          );
          const ticketText = `${ticket.subject ?? ""} ${ticket.description ?? ""}`;
          const penalty = await categoryPenaltyForText(
            parsed.categoryId,
            ticketText,
          );
          if (penalty > 0.3) {
            console.warn(
              `[ai-triage] catégorie '${cat.path.join(" > ")}' pénalisée par feedback humain (strength ${Math.round(penalty * 100)}%) → confidence downgraded`,
            );
            parsed.categoryConfidence = Math.min(
              parsed.categoryConfidence ?? 0,
              Math.max(0, (parsed.categoryConfidence ?? 0) * (1 - penalty)),
            );
            failedChecks++;
          }
        } catch {
          /* fail-open — le triage ne doit pas crasher si le learner
             a un problème */
        }

        // Politique "classer tout, corriger via feedback" : si 2/3 sanity
        // checks échouent, on GARDE la catégorie mais on cap la confidence
        // au floor (0.3). Elle s'applique donc juste à la limite — l'IA
        // catégorise même dans le doute, le tech corrige via thumbs-down
        // si c'était mauvais. Rejet TOTAL uniquement si 3/3 échouent
        // (hallucination vraiment certaine).
        if (failedChecks >= 3) {
          console.warn(
            `[ai-triage] catégorie '${cat.path.join(" > ")}' REJETÉE (3/3 sanity checks échoués) — hallucination probable, suggestion retirée`,
          );
          parsed.categoryId = null;
          parsed.categoryConfidence = 0;
        } else if (failedChecks >= 2) {
          console.warn(
            `[ai-triage] catégorie '${cat.path.join(" > ")}' SUSPECTE (${failedChecks}/3 sanity checks) — confidence plafonnée à 0.3, à revoir via feedback`,
          );
          parsed.categoryConfidence = Math.min(
            parsed.categoryConfidence ?? 0,
            0.3,
          );
        }
      }
    }

    // Sanity checks supplémentaires pour priority / type / duplicate,
    // basés sur les feedbacks humains agrégés (triage-feedback-learner).
    try {
      const { triagePenaltyForText, isDuplicateExcluded } = await import(
        "@/lib/ai/jobs/triage-feedback-learner"
      );
      const ticketText = `${ticket.subject ?? ""} ${ticket.description ?? ""}`;

      // Priority penalty
      if (parsed && parsed.priority) {
        const p = await triagePenaltyForText(
          "priority",
          parsed.priority,
          ticketText,
        );
        if (p > 0.3) {
          console.warn(
            `[ai-triage] priorité '${parsed.priority}' pénalisée par feedback humain (${Math.round(p * 100)}%) → downgrade confidence`,
          );
          // Pas de champ numérique pour priorityConfidence (enum "low"/"medium"/"high")
          // → on cap à "low" quand pénalité forte.
          if (p > 0.5) parsed.priorityConfidence = "low";
        }
      }

      // Type penalty : pas d'auto-apply du type côté triage donc on
      // n'efface pas la suggestion mais on log pour traçabilité.
      if (parsed && parsed.suggestedType) {
        const p = await triagePenaltyForText(
          "type",
          parsed.suggestedType,
          ticketText,
        );
        if (p > 0.5) {
          console.warn(
            `[ai-triage] type '${parsed.suggestedType}' pénalisé par feedback humain (${Math.round(p * 100)}%) — signal à l'UI`,
          );
        }
      }

      // Duplicate exclusion : si la paire (source, suggéré) a été
      // marquée comme faux doublon, on retire la suggestion.
      if (parsed && parsed.possibleDuplicateOfId) {
        const excluded = await isDuplicateExcluded(
          ticket.id,
          parsed.possibleDuplicateOfId,
        );
        if (excluded) {
          console.warn(
            `[ai-triage] doublon '${parsed.possibleDuplicateOfId}' exclu par feedback humain — suggestion retirée`,
          );
          parsed.possibleDuplicateOfId = null;
          parsed.possibleDuplicateReason = undefined;
        }
      }
    } catch {
      /* fail-open */
    }

    // Persiste le résultat POST-PROCESSÉ dans AiInvocation.response en
    // écrasant la réponse LLM brute. Raison : le GET /triage/route.ts relit
    // AiInvocation.response et fait JSON.parse direct — si on garde la
    // réponse brute, l'UI verra le `categoryId` shallow du LLM au lieu du
    // `categoryId` résolu à la feuille. En stockant le résultat final, GET
    // et POST restent cohérents. Trade-off : on perd la réponse LLM brute
    // pour debug, mais l'audit trail (feature, provider, tokens, cost) reste
    // intact dans AiInvocation.
    if (parsed && result.invocationId) {
      try {
        await prisma.aiInvocation.update({
          where: { id: result.invocationId },
          data: { response: JSON.stringify(parsed) },
        });
      } catch {
        /* non bloquant — le retour fonctionne même si l'update échoue */
      }
    }

    return parsed;
  } catch (err) {
    console.warn(
      `[ai-triage] ticket ${ticketId} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Application automatique des suggestions au ticket.
//
// Politique courante (2026-Q2, décision produit) :
//   - categoryId : AUTO-APPLIQUÉE systématiquement tant que le ticket n'a pas
//     déjà une catégorie fixée par un humain (categorySource=MANUAL). La
//     décision est corrigible via les boutons feedback dans l'UI — le tech
//     signale "mauvaise catégorie" et le learner ajuste. Plancher : une
//     confidence ≥ 0.3 est requis pour éviter d'appliquer des suggestions
//     quasi-aléatoires ; les 3 sanity checks (overlap tokens, centroid,
//     feedback pénalité) filtrent déjà les hallucinations avant ce point.
//   - priority : appliquée uniquement si confidence="high" ET que le ticket
//     est encore à LOW+DEFAULT (pas d'écrasement d'une valeur MANUAL/AI).
//     Plus conservateur car l'impact opérationnel (SLA, escalade) est direct.
//   - duplicates / type : JAMAIS appliqués automatiquement. Visible en UI
//     comme suggestion seulement — l'agent décide.
//
// L'objectif : classer tous les tickets pour alimenter la correlation et les
// stats, et utiliser le feedback humain comme mécanisme de correction (plus
// efficace qu'un seuil conservateur qui laisse 70% des tickets sans catégorie).
// ---------------------------------------------------------------------------
const CATEGORY_DEFAULT_FLOOR = 0.3;

export async function applyTriageIfConfident(
  ticketId: string,
  result: TriageResult,
): Promise<void> {
  try {
    const fresh = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        categoryId: true,
        categorySource: true,
        priority: true,
        prioritySource: true,
      },
    });
    if (!fresh) return;

    const updates: Record<string, unknown> = {};

    // Catégorie — AUTO-APPLIQUÉE si :
    //   (1) L'IA a retourné un categoryId (survécu aux 3 sanity checks)
    //   (2) Confidence ≥ floor (0.3) — filtre résiduel anti-bruit
    //   (3) La catégorie actuelle n'a PAS été choisie manuellement par un humain
    //       (categorySource=MANUAL). AI ou DEFAULT sont écrasables.
    //
    // Le champ categorySource suit l'évolution :
    //   null/DEFAULT → AI (lors du premier triage) → MANUAL (si un humain édite)
    //
    // Une fois MANUAL, le triage n'écrase JAMAIS — c'est la promesse "copilote
    // pas pilote". Les corrections humaines sont finales.
    const humanLocked = fresh.categorySource === "MANUAL";
    const categoryFloor =
      POLICY_TRIAGE.autoApplyFloor ?? CATEGORY_DEFAULT_FLOOR;
    if (!humanLocked) {
      // Trois cas, dans cet ordre :
      //   (a) Confiance ≥ floor ET categoryId résolu → on applique la
      //       catégorie + categorySource="AI". Notice UI : "Catégorisé par
      //       l'IA à XX%" (acceptable / éditable).
      //   (b) Triage exécuté mais (confiance < floor OU pas de match) →
      //       on N'applique PAS de catégorie mais on marque tout de même
      //       categorySource="AI" + categoryId=null. Notice UI :
      //       "L'IA n'a pas pu trancher — à classer manuellement".
      //       Cette trace permet de distinguer un ticket "jamais triagé"
      //       (categorySource=null, ex: legacy/migration FS) d'un ticket
      //       "triagé sans succès" — et donc de pousser l'agent à agir.
      //   (c) Cas (a) où categoryId est identique à la valeur courante :
      //       skip l'update categoryId pour ne pas churn updatedAt.
      const confidentMatch =
        result.categoryId &&
        (result.categoryConfidence ?? 0) >= categoryFloor;
      if (confidentMatch) {
        if (fresh.categoryId !== result.categoryId) {
          updates.categoryId = result.categoryId;
        }
        updates.categorySource = "AI";
        updates.categoryConfidence = result.categoryConfidence ?? null;
      } else {
        // Cas (b) : trace la tentative IA infructueuse. On force categoryId
        // à null seulement s'il l'était déjà (ne pas écraser une catégorie
        // attribuée par un AUTRE chemin entre-temps — défensif).
        if (fresh.categoryId === null) {
          updates.categorySource = "AI";
          updates.categoryConfidence = result.categoryConfidence ?? null;
        }
      }
    }

    // Priorité — on touche seulement si haute confiance ET source par défaut.
    // Le seuil est dynamique : on accepte "medium" confidence UNIQUEMENT
    // si le feature_health de priority_suggest est très bon (agreement ≥ 0.85).
    // Sinon reste sur "high" strict (comportement historique).
    const currentIsDefault =
      !fresh.prioritySource || fresh.prioritySource === "DEFAULT";
    const priorityAgreement = await getFeatureAgreementRate(
      "priority_suggest",
    );
    const acceptedConfidenceLevels =
      priorityAgreement !== null && priorityAgreement >= 0.85
        ? new Set(["high", "medium"])
        : new Set(["high"]);
    if (
      result.priority &&
      result.priorityConfidence &&
      acceptedConfidenceLevels.has(result.priorityConfidence) &&
      currentIsDefault
    ) {
      const dbPriority = {
        low: "LOW",
        medium: "MEDIUM",
        high: "HIGH",
        critical: "CRITICAL",
      }[result.priority] as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      if (dbPriority !== fresh.priority) {
        updates.priority = dbPriority;
        updates.prioritySource = "AI";
      } else {
        // Même valeur — on marque quand même la source pour tracer l'analyse
        updates.prioritySource = "AI";
      }
    }

    if (Object.keys(updates).length === 0) return;
    await prisma.ticket.update({ where: { id: ticketId }, data: updates });
  } catch (err) {
    console.warn(
      `[ai-triage apply] ticket ${ticketId} failed:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ---------------------------------------------------------------------------
// Seuil d'auto-apply dynamique — lit le feature_health stocké par
// meta-learning et ajuste le baseline en fonction du agreement rate récent.
//
// Mapping :
//   agreement ≥ 0.90 → threshold × 0.85  (très fiable, on accélère)
//   agreement ≥ 0.80 → threshold × 0.95
//   agreement ≥ 0.60 → threshold × 1.0   (neutre)
//   agreement ≥ 0.40 → threshold × 1.15  (dérive, on ralentit)
//   agreement <  0.40 → threshold × 1.25 (très mauvais, quasi-manuel seulement)
//
// Cache 5 min in-memory pour éviter les requêtes DB à chaque auto-apply.
// ---------------------------------------------------------------------------

interface ThresholdCache {
  at: number;
  byFeature: Map<string, number>;
}
let thresholdCache: ThresholdCache = { at: 0, byFeature: new Map() };
const THRESHOLD_CACHE_TTL_MS = 5 * 60_000;

// Plus appelée sur category_suggest depuis que l'auto-apply est systématique
// (floor 0.3). Conservée comme helper disponible si on réintroduit un seuil
// dynamique sur une autre feature plus tard.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function computeDynamicThreshold(
  feature: string,
  baseline: number,
): Promise<number> {
  try {
    if (
      Date.now() - thresholdCache.at < THRESHOLD_CACHE_TTL_MS &&
      thresholdCache.byFeature.has(feature)
    ) {
      return thresholdCache.byFeature.get(feature)!;
    }
    const health = await prisma.aiPattern.findUnique({
      where: {
        scope_kind_key: {
          scope: "meta:feature_health",
          kind: "score",
          key: feature,
        },
      },
      select: { value: true },
    });
    const v = health?.value as {
      agreementRate?: number;
      recentRate7d?: number | null;
      totalAudits?: number;
    } | null;
    // Privilégie le rate 7j si assez d'audits, sinon le rate 30j.
    const rate =
      v?.recentRate7d !== null && v?.recentRate7d !== undefined
        ? v.recentRate7d
        : (v?.agreementRate ?? null);

    let multiplier = 1;
    if (rate === null || (v?.totalAudits ?? 0) < 5) {
      // Pas assez de données → baseline.
      multiplier = 1;
    } else if (rate >= 0.9) multiplier = 0.85;
    else if (rate >= 0.8) multiplier = 0.95;
    else if (rate >= 0.6) multiplier = 1;
    else if (rate >= 0.4) multiplier = 1.15;
    else multiplier = 1.25;

    const threshold = Math.max(0.5, Math.min(0.95, baseline * multiplier));

    // Refresh cache global pour toutes features si expiré.
    if (Date.now() - thresholdCache.at >= THRESHOLD_CACHE_TTL_MS) {
      thresholdCache = { at: Date.now(), byFeature: new Map() };
    }
    thresholdCache.byFeature.set(feature, threshold);

    if (multiplier !== 1) {
      console.log(
        `[ai-triage] seuil dynamique ${feature} : baseline ${baseline} × ${multiplier} = ${threshold.toFixed(2)} (agreement ${Math.round((rate ?? 0) * 100)}%)`,
      );
    }
    return threshold;
  } catch {
    return baseline;
  }
}

/**
 * Agreement rate courant d'une feature — pour décider si on peut assouplir
 * les critères d'auto-apply (priorité notamment). Retourne null si pas
 * assez d'audits récents.
 */
async function getFeatureAgreementRate(
  feature: string,
): Promise<number | null> {
  try {
    const health = await prisma.aiPattern.findUnique({
      where: {
        scope_kind_key: {
          scope: "meta:feature_health",
          kind: "score",
          key: feature,
        },
      },
      select: { value: true },
    });
    const v = health?.value as {
      agreementRate?: number;
      recentRate7d?: number | null;
      totalAudits?: number;
    } | null;
    if (!v || (v.totalAudits ?? 0) < 10) return null;
    return v.recentRate7d ?? v.agreementRate ?? null;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget — à appeler depuis le flow de création de ticket.
 * Exécute le triage + applique les suggestions à forte confiance. Ne
 * throw jamais — tout échec est logué silencieusement.
 */
export async function triageTicketAsync(ticketId: string): Promise<void> {
  const result = await triageTicket(ticketId);
  if (!result) return;
  await applyTriageIfConfident(ticketId, result);
}
