// ============================================================================
// GET /api/v1/tickets/[id]/similar
//
// Retourne les tickets similaires dans 4 buckets hiérarchisés par
// spécificité (du plus pertinent au moins) :
//   - sameRequester        : tickets du MÊME demandeur (contact/requester)
//                            → le même user a-t-il déjà eu ce genre de souci ?
//   - sameClientOpen       : OUVERTS du même client (doublons en vol)
//   - sameClientResolved   : RÉSOLUS du même client (savoir local)
//   - otherClientsResolved : RÉSOLUS d'autres clients (savoir transversal,
//                            seuil de pertinence élevé pour éviter le bruit)
//
// Algorithme de similarité (v2) :
//   1. TOKENIZATION enrichie du sujet + description :
//      - mots ≥ 4 chars (comme avant)
//      - acronymes 2-4 chars ALL-CAPS (VPN, AD, DNS, SSL, MFA, RDP, CVE, …)
//      - stop-words FR + EN étendus (mots vides qui polluent la similarité)
//   2. POIDS des tokens = log(1 / fréquence du token dans les tickets) — un
//      token rare (ex: "fortigate") pèse plus qu'un commun (ex: "outlook").
//      Calculé sur un échantillon de 2000 tickets récents pour la vitesse.
//   3. CANDIDATS DB : même catégorie OU famille (top-level parent) ± tokens.
//   4. SCORING : somme des poids des tokens qui matchent (sujet + description).
//      Bonus catégorie exacte, bonus catégorie sœur, bonus récence.
//   5. SEUIL : cross-client exige un score minimum absolu ET ≥2 tokens matchés
//      pour éviter le bruit.
//
// Query params :
//   - limit (défaut 5 par bucket, max 15)
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { TicketStatus } from "@prisma/client";
import {
  cosineSim,
  ensureTicketEmbedding,
  loadEmbeddings,
} from "@/lib/ai/embeddings";
import { getTokenBoosts } from "@/lib/ai/jobs/click-ranking";
import { getTokenPenalties } from "@/lib/ai/jobs/similar-feedback-learner";

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const STOP = new Set([
  // FR — mots de liaison / outils courants
  "avec", "sans", "dans", "pour", "mais", "plus", "tous", "tout", "toutes", "toute",
  "avoir", "faire", "bien", "autre", "autres", "cette", "cela", "entre", "notre",
  "votre", "leur", "leurs", "mon", "ton", "son", "mes", "tes", "ses", "nos", "vos",
  "sont", "est", "été", "être", "avait", "aura", "devait",
  "aussi", "donc", "alors", "ainsi", "aprés", "après", "avant",
  // FR — vocabulaire support générique (polluant : apparaît partout)
  "probleme", "problème", "erreur", "issue", "soucis", "incident", "demande",
  "aide", "question", "ticket", "client", "utilisateur", "bonjour", "merci",
  "cordialement", "salutations", "besoin",
  // EN équivalents
  "with", "from", "have", "this", "that", "they", "them", "there", "than", "into",
  "been", "being", "were", "will", "would", "could", "should",
  "about", "after", "before", "between", "through",
  "problem", "issue", "error", "help", "please", "thanks", "thank",
  "hello", "need", "ticket", "customer", "user",
  // Vocabulaire TECH trop générique — présent dans >30% des tickets, donc
  // un match sur un seul de ces mots n'est PAS un signal fiable. Exemple :
  // ticket "backup SQL failed" vs "Excel crashe" partagent "microsoft" →
  // faux match. Ces mots nécessitent un autre token discriminant pour
  // compter.
  "microsoft", "windows", "office", "outlook", "teams", "onedrive",
  "sharepoint", "email", "emails", "mail", "mails", "courriel", "courriels",
  "message", "messages", "compte", "comptes", "fichier", "fichiers",
  "systeme", "systèmes", "systeme", "ordinateur", "ordinateurs",
  "serveur", "serveurs", "poste", "postes",
]);

const MIN_LEN = 4;
const MAX_TOKENS = 15;
const MAX_BIGRAMS = 8;

/**
 * Entités techniques à haut pouvoir discriminant. Un match sur une de ces
 * entités est presque toujours un signal fort (IP commune = même réseau,
 * même error code = même bug). On les détecte AVANT la tokenisation pour
 * les préserver intacts (les `.` et `-` seraient sinon splittés).
 */
const ENTITY_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // IPv4
  { re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, label: "ipv4" },
  // IPv6 compact (au moins un ::)
  { re: /\b(?:[0-9a-fA-F]{1,4}:){1,7}(?::[0-9a-fA-F]{1,4}){0,7}\b/g, label: "ipv6" },
  // MAC address (séparateurs `:` ou `-`)
  { re: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, label: "mac" },
  // CVE — "CVE-2024-1234"
  { re: /\bCVE-\d{4}-\d{4,7}\b/gi, label: "cve" },
  // MITRE ATT&CK technique id (T1234 / T1234.001)
  { re: /\bT\d{4}(?:\.\d{3})?\b/g, label: "mitre-attack" },
  // Windows / Microsoft error codes : 0x-hex ou E_XXX
  { re: /\b0x[0-9A-Fa-f]{4,10}\b/g, label: "hex-error" },
  { re: /\bE_[A-Z_]+\b/g, label: "win-error" },
  // Windows Event ID typique (4xxx, 5xxx, 6xxx pour la sécurité/audit)
  { re: /\bEvent\s*ID\s*(\d{3,5})\b/gi, label: "event-id" },
  // HTTP status code typique en support (4xx/5xx)
  { re: /\b(?:4\d{2}|5\d{2})\b/g, label: "http-status" },
  // Versions : 24H2, 10.0.19045, 2022.3.5
  { re: /\b\d{2,4}H\d\b/g, label: "win-version" },
  { re: /\b\d+\.\d+\.\d+(?:\.\d+)?\b/g, label: "semver" },
  // KB Articles Microsoft (KB5001234)
  { re: /\bKB\d{6,7}\b/g, label: "kb-article" },
  // Hostnames type "SRV-XX-YY" ou "DC01-XXX"
  { re: /\b[A-Z]{2,5}\d*-[A-Z0-9]{2,10}(?:-[A-Z0-9]+)?\b/g, label: "hostname" },
  // Chemins Windows
  { re: /\b[CDEF]:\\[^\s]{3,}/g, label: "win-path" },
  // Chemins UNC (\\server\share)
  { re: /\\\\[A-Za-z0-9_-]{2,}\\[^\s]{2,}/g, label: "unc-path" },
  // URLs
  { re: /https?:\/\/[^\s)<>"']+/g, label: "url" },
  // Ports avec préfixe TCP/UDP/port
  { re: /\b(?:TCP|UDP|port)\s*\/?\s*\d{2,5}\b/gi, label: "port" },
  // Ports standards communs mentionnés seuls (80, 443, 3389, 445, 22)
  { re: /\b(?:port\s+)?(?:3389|5985|5986|445|139|22|1433|1521|3306|5432)\b/gi, label: "std-port" },
  // Emails (commun dans tickets phishing, compromise) — les noms de
  // domaines deviennent discriminants
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, label: "email" },
  // Service / process Windows (svchost.exe, lsass.exe, etc.)
  { re: /\b[a-zA-Z0-9_-]{3,}\.exe\b/gi, label: "exe" },
  { re: /\b[a-zA-Z0-9_-]{3,}\.(?:dll|sys|ps1|vbs|bat)\b/gi, label: "script" },
  // SID Windows (S-1-5-21-...)
  { re: /\bS-\d-\d+(?:-\d+){1,6}\b/g, label: "sid" },
  // GUID / UUID
  { re: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, label: "uuid" },
];

/**
 * Bigrammes connus avec fort pouvoir discriminant — si deux tickets
 * mentionnent "active directory" plutôt que juste "active" ou juste
 * "directory", c'est un signal beaucoup plus fiable.
 */
const KNOWN_BIGRAMS = new Set([
  // Infrastructure Windows / réseau
  "active directory", "account lockout", "print spooler", "group policy",
  "domain controller", "exchange online", "office 365", "microsoft 365",
  "remote desktop", "file server", "dns server", "dhcp server",
  "event viewer", "sharepoint online", "teams meeting", "onedrive sync",
  "bitlocker key", "bitdefender agent", "wazuh agent", "veeam backup",
  "task scheduler", "windows update", "defender smartscreen",
  "azure ad", "entra id", "conditional access", "intune policy",
  "hyper v", "failover cluster", "storage spaces", "wsus server",
  "smb share", "nfs export", "rdp session", "wsl subsystem",
  // Sécurité (cas phishing / compromise courants MSP)
  "phishing attempt", "brute force", "password spray", "credential stuffing",
  "suspicious login", "malware detected", "ransomware attack", "lateral movement",
  "privilege escalation", "zero day", "supply chain", "data exfiltration",
  "unauthorized access", "account compromise", "mfa bypass", "token theft",
  "command injection", "sql injection", "cross site", "file tampering",
  "powershell execution", "encoded command", "living off the land",
  // Backups / monitoring
  "backup failed", "backup success", "veeam job", "replication lag",
  "disk space", "volume full", "disk queue", "memory leak",
  "cpu spike", "network latency", "packet loss", "link down",
  "service crashed", "process hang", "high cpu", "out of memory",
  // FR — francophone MSP
  "disque plein", "sauvegarde echec", "boite courriel", "compte bloque",
  "mot passe", "serveur fichiers", "reseau lent", "imprimante reseau",
  "session verrouillee", "session bloquee", "ecran bleu", "boucle demarrage",
  "client vpn", "connexion vpn", "certificat expire", "licence expiree",
  "synchronisation echec", "replication perdue", "sauvegarde incomplete",
  "courriel suspect", "courriel indesirable", "hameconnage probable",
  "tentative connexion", "acces refuse", "autorisation requise",
  "panne service", "coupure internet", "wifi instable",
  // Applications tierces courantes MSP
  "quickbooks company", "acomba erreur", "sage report", "adp paie",
  "autocad licence", "revit project",
]);

// Trigrammes — motifs très spécifiques où 3 mots consécutifs sont la vraie
// signature du problème. Plus rares mais extrêmement discriminants quand
// ils matchent.
const KNOWN_TRIGRAMS = new Set([
  "remote code execution", "cross site scripting", "denial of service",
  "man in the middle", "business email compromise", "advanced persistent threat",
  "ransomware as service", "living off the land", "command and control",
  "data loss prevention", "zero trust network",
  "acces utilisateur refuse", "compte hors service", "serveur non joignable",
  "base donnees inaccessible", "baie disque degradee",
]);

/**
 * Extrait des tokens pertinents d'un texte.
 *
 * Règles :
 *   - ENTITÉS techniques (IP, CVE, erreurs, versions, hostnames) → préservées
 *   - ACRONYMES ALL-CAPS 2-4 chars (VPN, AD, DNS, SSL, MFA, RDP, …)
 *   - MOTS latins ≥ 4 chars, normalisés (lowercase + accents retirés)
 *   - Stop-words et nombres purs exclus
 */
export function extractTokens(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();

  // Pass 1 : entités techniques — stockées telles quelles en lowercase
  // pour match insensible à la casse plus tard.
  for (const { re } of ENTITY_PATTERNS) {
    const re2 = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = re2.exec(text)) !== null) {
      out.add(m[0].toLowerCase());
    }
  }

  // Pass 2 : acronymes ALL-CAPS (sur texte ORIGINAL pour détecter la casse)
  const acronymRe = /\b[A-Z]{2,4}(?:\d+)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = acronymRe.exec(text)) !== null) {
    out.add(m[0].toLowerCase());
  }

  // Pass 3 : mots normaux
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  for (const tok of normalized.split(/\s+/)) {
    if (tok.length < MIN_LEN) continue;
    if (/^\d+$/.test(tok)) continue;
    if (STOP.has(tok)) continue;
    out.add(tok);
  }

  return Array.from(out).slice(0, MAX_TOKENS);
}

/**
 * Extrait les bigrammes (séquences 2 mots) qui figurent dans KNOWN_BIGRAMS.
 * Renvoie des chaînes normalisées (lowercase, sans accents) prêtes à être
 * matchées contre un haystack pareillement normalisé.
 */
export function extractBigrams(text: string): string[] {
  if (!text) return [];
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalized.split(" ");
  const out = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (KNOWN_BIGRAMS.has(bigram)) out.add(bigram);
  }
  return Array.from(out).slice(0, MAX_BIGRAMS);
}

/**
 * Trigrammes connus — mots consécutifs 3-à-3 qui forment une signature
 * très spécifique d'un problème récurrent ("remote code execution",
 * "man in the middle"). Très rares donc très discriminants quand ils
 * matchent — on les trait différemment des bigrammes (score ×3).
 */
export function extractTrigrams(text: string): string[] {
  if (!text) return [];
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalized.split(" ");
  const out = new Set<string>();
  for (let i = 0; i < words.length - 2; i++) {
    const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    if (KNOWN_TRIGRAMS.has(trigram)) out.add(trigram);
  }
  return Array.from(out).slice(0, 4);
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ---------------------------------------------------------------------------
// IDF cache — recalculé toutes les 30 min en mémoire process.
// ---------------------------------------------------------------------------

type IdfMap = Map<string, number>;
let idfCache: { map: IdfMap; at: number; docCount: number } | null = null;
const IDF_TTL_MS = 30 * 60 * 1000;

async function getIdfWeights(): Promise<{ map: IdfMap; docCount: number }> {
  if (idfCache && Date.now() - idfCache.at < IDF_TTL_MS) {
    return { map: idfCache.map, docCount: idfCache.docCount };
  }
  // Échantillon : 2000 tickets les plus récents. Couvre un corpus
  // représentatif sans exploser la mémoire ni la DB.
  const rows = await prisma.ticket.findMany({
    select: { subject: true, description: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  const docCount = rows.length;
  const df = new Map<string, number>();
  for (const r of rows) {
    const toks = new Set(extractTokens(`${r.subject} ${r.description ?? ""}`));
    for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const map: IdfMap = new Map();
  for (const [t, count] of df) {
    // IDF classique : log((N + 1) / (df + 1)) + 1, pour éviter les 0.
    map.set(t, Math.log((docCount + 1) / (count + 1)) + 1);
  }
  idfCache = { map, at: Date.now(), docCount };
  return { map, docCount };
}

// ---------------------------------------------------------------------------
// Catégorie : famille (top-level parent)
// ---------------------------------------------------------------------------

async function resolveCategoryFamily(
  categoryId: string | null,
): Promise<{ self: string | null; family: string | null; siblings: string[] }> {
  if (!categoryId) return { self: null, family: null, siblings: [] };
  // Remonte à la racine
  let cursorId: string | null = categoryId;
  let rootId: string = categoryId;
  const visited = new Set<string>();
  while (cursorId && !visited.has(cursorId)) {
    visited.add(cursorId);
    const cat: { id: string; parentId: string | null } | null =
      await prisma.category.findUnique({
        where: { id: cursorId },
        select: { id: true, parentId: true },
      });
    if (!cat) break;
    rootId = cat.id;
    cursorId = cat.parentId;
  }
  // Frères + descendants de la même famille (même root)
  const family = await prisma.category.findMany({
    where: {
      OR: [
        { id: rootId },
        // Enfants directs
        { parentId: rootId },
        // Petits-enfants : on laisse Prisma faire un scan, c'est petit
      ],
    },
    select: { id: true },
  });
  // Pour aller plus loin : on re-scan avec parentId IN famille_ids jusqu'à
  // ce que rien ne s'ajoute (arbre typique <3 niveaux, 2 passes suffisent)
  let familyIds = new Set(family.map((c) => c.id));
  for (let depth = 0; depth < 2; depth++) {
    const more = await prisma.category.findMany({
      where: { parentId: { in: Array.from(familyIds) } },
      select: { id: true },
    });
    const before = familyIds.size;
    for (const c of more) familyIds.add(c.id);
    if (familyIds.size === before) break;
  }
  return {
    self: categoryId,
    family: rootId,
    siblings: Array.from(familyIds).filter((id) => id !== categoryId),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "5", 10) || 5, 1),
    15,
  );

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      subject: true,
      description: true,
      organizationId: true,
      categoryId: true,
      requesterId: true,
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  // Tokens extraits du sujet + description.
  const textForTokens = `${ticket.subject ?? ""} ${ticket.description ?? ""}`;
  const tokens = extractTokens(textForTokens);
  const bigrams = extractBigrams(textForTokens);
  const trigrams = extractTrigrams(textForTokens);

  if (
    tokens.length === 0 &&
    bigrams.length === 0 &&
    trigrams.length === 0 &&
    !ticket.categoryId
  ) {
    return NextResponse.json({
      ticketId: ticket.id,
      sameRequester: [],
      sameClientOpen: [],
      sameClientResolved: [],
      otherClientsResolved: [],
    });
  }

  const [{ map: idf }, { family, siblings }] = await Promise.all([
    getIdfWeights(),
    resolveCategoryFamily(ticket.categoryId),
  ]);

  // Seuil IDF : un token "rare" (idf ≥ IDF_RARE) compte double pour le
  // seuil de signification. Évite de matcher sur "outlook" ou "imprimante"
  // uniquement.
  const IDF_RARE = 3.0;
  const rareTokens = tokens.filter((t) => (idf.get(t) ?? IDF_RARE) >= IDF_RARE);

  const OPEN_STATUSES: TicketStatus[] = [
    TicketStatus.NEW,
    TicketStatus.OPEN,
    TicketStatus.IN_PROGRESS,
    TicketStatus.ON_SITE,
    TicketStatus.PENDING,
    TicketStatus.WAITING_CLIENT,
    TicketStatus.WAITING_VENDOR,
    TicketStatus.SCHEDULED,
  ];
  const RESOLVED_STATUSES: TicketStatus[] = [
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ];

  const selectFields = {
    id: true,
    number: true,
    subject: true,
    description: true,
    status: true,
    categoryId: true,
    createdAt: true,
    closedAt: true,
    resolvedAt: true,
    organization: { select: { id: true, name: true, slug: true } },
    category: { select: { name: true } },
  } as const;

  // OR-clauses pour la recherche DB — on fetch large puis on re-rank en
  // mémoire avec le scoring pondéré.
  const tokenOr = tokens.length > 0
    ? tokens.map((t) => ({
        OR: [
          { subject: { contains: t, mode: "insensitive" as const } },
          { description: { contains: t, mode: "insensitive" as const } },
        ],
      }))
    : [];

  const familyCategoryIds = ticket.categoryId
    ? [ticket.categoryId, ...siblings]
    : [];

  // Critère "large" : catégorie-famille OU n'importe quel token.
  // Appliqué same-client (laxiste) ET cross-client (on filtre après).
  const broadMatch =
    familyCategoryIds.length > 0 || tokenOr.length > 0
      ? {
          OR: [
            ...(familyCategoryIds.length > 0
              ? [{ categoryId: { in: familyCategoryIds } }]
              : []),
            ...tokenOr,
          ],
        }
      : null;

  if (!broadMatch) {
    return NextResponse.json({
      ticketId: ticket.id,
      sameClientOpen: [],
      sameClientResolved: [],
      otherClientsResolved: [],
    });
  }

  const [
    sameRequesterRaw,
    sameClientOpenRaw,
    sameClientResolvedRaw,
    otherClientsRaw,
  ] = await Promise.all([
    // Bucket 1 — Même demandeur. Pas besoin de filtrer sur tokens ici :
    // TOUS les tickets d'un même demandeur sont intéressants (le tech
    // veut voir l'historique complet du user en un coup d'œil).
    // On re-score quand même pour trier par pertinence au ticket courant.
    ticket.requesterId
      ? prisma.ticket.findMany({
          where: {
            requesterId: ticket.requesterId,
            id: { not: ticket.id },
          },
          select: selectFields,
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: limit * 3,
        })
      : Promise.resolve([]),
    prisma.ticket.findMany({
      where: {
        organizationId: ticket.organizationId,
        id: { not: ticket.id },
        status: { in: OPEN_STATUSES },
        ...broadMatch,
      },
      select: selectFields,
      orderBy: { createdAt: "desc" },
      take: limit * 4,
    }),
    prisma.ticket.findMany({
      where: {
        organizationId: ticket.organizationId,
        id: { not: ticket.id },
        status: { in: RESOLVED_STATUSES },
        closedAt: {
          gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        },
        ...broadMatch,
      },
      select: selectFields,
      orderBy: { closedAt: "desc" },
      take: limit * 4,
    }),
    // Cross-client : uniquement si on a assez de signal (catégorie +
    // ≥1 token rare OU bigramme connu). Sinon le bruit est garanti.
    (ticket.categoryId || bigrams.length > 0) && (rareTokens.length > 0 || bigrams.length > 0)
      ? prisma.ticket.findMany({
          where: {
            organizationId: { not: ticket.organizationId },
            id: { not: ticket.id },
            status: { in: RESOLVED_STATUSES },
            ...broadMatch,
          },
          select: selectFields,
          orderBy: { closedAt: "desc" },
          take: limit * 8,
        })
      : Promise.resolve([]),
  ]);

  // -------------------------------------------------------------------------
  // SCORING
  // -------------------------------------------------------------------------

  type Candidate = (typeof sameClientOpenRaw)[number];
  type Scored = Candidate & {
    _score: number;
    _matches: number;
    _matchedTokens: string[];
    _matchedBigrams: string[];
    _semanticSim: number; // cosine similarity avec ticket courant, [0..1]
  };

  const ticketCategoryId: string | null = ticket.categoryId;

  const BIGRAM_WEIGHT = 4;
  // Pondération sémantique : un cosine de 1.0 ajoute SEMANTIC_MAX au score.
  // Valeur choisie pour que l'embedding soit un signal FORT mais pas
  // dominant — un ticket partageant "fortigate" + "cve-2024-1234" (2
  // bigrammes/tokens rares, score ~10) doit pouvoir l'emporter sur un
  // embedding élevé mais pas de tokens précis.
  const SEMANTIC_MAX = 6;
  // Seuil en dessous duquel on ignore le signal sémantique (du bruit).
  // nomic-embed-text retourne rarement <0.3 sur deux textes FR, et les
  // textes vraiment liés sont souvent >0.65.
  const SEMANTIC_MIN = 0.55;

  // Charge l'embedding du ticket courant + ceux des candidats pour scoring.
  // Si l'embedding courant manque, on tente un calcul à la volée (Ollama
  // warm → ~500ms). Si Ollama down ou modèle absent, on skip proprement
  // et le scoring se fait uniquement sur tokens — régression gracieuse.
  let currentEmbedding: number[] | null = null;
  const allCandidateIds = [
    ...sameClientOpenRaw,
    ...sameClientResolvedRaw,
    ...otherClientsRaw,
    ...sameRequesterRaw,
  ].map((c) => c.id);
  const candidateEmbeddings = await loadEmbeddings(allCandidateIds);

  // Boosts de tokens appris via le click-through feedback loop.
  // Token fréquemment présent dans les tickets cliqués = signal de
  // pertinence → bonus additionnel au score.
  const tokenBoosts = await getTokenBoosts().catch(() => new Map<string, number>());
  // Pénalités apprises depuis les thumbs-down explicites du widget : tokens
  // qui ont causé plusieurs faux positifs reçoivent un malus de 0-1 au
  // score. 1 = quasi-neutralise le matching sur ce token.
  const tokenPenalties = await getTokenPenalties().catch(
    () => new Map<string, number>(),
  );

  // Feedback EXPLICITE du tech : paires (source, suggéré) marquées "bad"
  // (via le bouton review dans le widget). Exclut ces suggestions pour ce
  // viewer — le modèle n'est plus confus par l'association.
  const feedbackRows = await prisma.aiPattern.findMany({
    where: {
      scope: "similar:feedback",
      kind: "pair",
      key: { startsWith: `${ticket.id}|` },
    },
    select: { key: true, value: true },
  });
  const excludedSuggestedIds = new Set<string>();
  const goodBoostIds = new Set<string>();
  for (const r of feedbackRows) {
    const v = r.value as {
      suggestedTicketId?: string;
      verdict?: string;
    } | null;
    if (!v?.suggestedTicketId) continue;
    if (v.verdict === "bad") excludedSuggestedIds.add(v.suggestedTicketId);
    else if (v.verdict === "good") goodBoostIds.add(v.suggestedTicketId);
  }
  try {
    await ensureTicketEmbedding(ticket.id);
    const me = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      select: { embedding: true },
    });
    if (me && Array.isArray(me.embedding)) {
      currentEmbedding = me.embedding as number[];
    }
  } catch {
    /* ignore — on tombe en mode tokens-seul */
  }

  function scoreCandidate(c: Candidate, opts: { crossClient: boolean }): Scored {
    const haystack = norm(`${c.subject} ${c.description ?? ""}`);
    let score = 0;
    let matches = 0;
    const matchedTokens: string[] = [];
    const matchedBigrams: string[] = [];

    for (const t of tokens) {
      const tNorm = norm(t);
      if (!tNorm) continue;
      if (haystack.includes(tNorm)) {
        const w = idf.get(t) ?? 1;
        // Boost via click-through : tokens qui génèrent des clics réels
        // reçoivent un bonus appris (jusqu'à +3 points).
        const boost = tokenBoosts.get(t) ?? 0;
        // Pénalité via feedback explicite (thumbs-down) : tokens qui
        // apparaissent dans plusieurs faux positifs sont down-weightés.
        // penalty ∈ [0, 1] — multiplie le poids IDF.
        const penalty = tokenPenalties.get(t) ?? 0;
        const effective = (w + boost) * (1 - penalty);
        if (effective > 0) {
          score += effective;
          matches += 1;
          matchedTokens.push(t);
        }
      }
    }

    for (const bg of bigrams) {
      if (haystack.includes(bg)) {
        score += BIGRAM_WEIGHT;
        matches += 1;
        matchedBigrams.push(bg);
      }
    }

    // Trigrammes — 3× le poids d'un bigramme car statistiquement beaucoup
    // plus rares et donc beaucoup plus discriminants. "remote code execution"
    // dans 2 tickets = signal très fort que c'est la même vulnérabilité.
    for (const tg of trigrams) {
      if (haystack.includes(tg)) {
        score += BIGRAM_WEIGHT * 3;
        matches += 1;
        matchedBigrams.push(tg);
      }
    }

    // Signal sémantique (embeddings) — se combine au signal tokens.
    let semanticSim = 0;
    const candVec = candidateEmbeddings.get(c.id);
    if (currentEmbedding && candVec) {
      const sim = cosineSim(currentEmbedding, candVec);
      if (sim >= SEMANTIC_MIN) {
        // Map [SEMANTIC_MIN, 1] → [0, SEMANTIC_MAX] linéairement.
        const norm01 = (sim - SEMANTIC_MIN) / (1 - SEMANTIC_MIN);
        score += norm01 * SEMANTIC_MAX;
        semanticSim = sim;
      }
    }

    if (ticketCategoryId && c.categoryId === ticketCategoryId) score += 3;
    else if (ticketCategoryId && c.categoryId && familyCategoryIds.includes(c.categoryId)) score += 1;

    const closedAt = c.closedAt ?? c.resolvedAt ?? c.createdAt;
    if (closedAt) {
      const ageDays = (Date.now() - closedAt.getTime()) / (24 * 3600 * 1000);
      if (ageDays <= 30) score += 1;
      else if (ageDays <= 90) score += 0.5;
    }

    const bodyLen = (c.description ?? "").length;
    if (bodyLen >= 300) score += 0.5;
    if (bodyLen >= 800) score += 0.5;

    if (opts.crossClient) {
      const hasRare = rareTokens.some((t) => haystack.includes(norm(t)));
      const hasBigram = matchedBigrams.length > 0;
      const hasSemantic = semanticSim >= 0.7;
      // Pénalité cross-client : signal faible SI aucun indicateur fort
      // (token rare, bigramme, ou similarité sémantique élevée).
      if (!hasRare && !hasBigram && !hasSemantic) score *= 0.4;
    }

    return {
      ...c,
      _score: score,
      _matches: matches,
      _matchedTokens: matchedTokens,
      _matchedBigrams: matchedBigrams,
      _semanticSim: semanticSim,
    };
  }

  // Seuils de pertinence :
  //   - MIN_SCORE_SAME : same-client laxiste (≥1 match) car le client est
  //     déjà un fort signal partagé.
  //   - MIN_SCORE_CROSS : cross-client BEAUCOUP plus strict. L'utilisateur
  //     veut "un grand match" — on exige un score absolu élevé (≥ 6 si
  //     contexte pauvre, ≥ 8 si riche) ET au moins 3 matches (tokens OU
  //     bigrammes). Un bigramme connu pèse déjà 4, donc 1 bigramme + 2
  //     tokens communs = 6 naturellement.
  //   - sameRequester : pas de seuil — le fait d'être du même user est déjà
  //     suffisamment pertinent. Les scores servent juste au tri.
  const MIN_SCORE_SAME = 0.5;
  const MIN_MATCHES_CROSS = 3;
  const MIN_SCORE_CROSS = rareTokens.length + bigrams.length >= 3 ? 8 : 6;

  function sortScored(arr: Scored[]): Scored[] {
    return arr.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      const at = (a.closedAt ?? a.resolvedAt ?? a.createdAt)?.getTime() ?? 0;
      const bt = (b.closedAt ?? b.resolvedAt ?? b.createdAt)?.getTime() ?? 0;
      return bt - at;
    });
  }

  // sameRequester — tri par pertinence (score) puis récence, sans seuil.
  // On déduplique implicitement avec les autres buckets via l'ordre de
  // traitement côté UI (le widget affiche chaque ticket une seule fois).
  // Applique les feedbacks explicites :
  //   - "bad"  → exclut totalement la suggestion
  //   - "good" → boost +50% pour faire remonter
  const applyFeedback = (c: Scored): Scored | null => {
    if (excludedSuggestedIds.has(c.id)) return null;
    if (goodBoostIds.has(c.id)) return { ...c, _score: c._score * 1.5 };
    return c;
  };

  const sameRequesterScored = sameRequesterRaw
    .map((c) => scoreCandidate(c, { crossClient: false }))
    .map(applyFeedback)
    .filter((c): c is Scored => c !== null);
  const sameRequester = sortScored(sameRequesterScored).slice(0, limit);
  const sameRequesterIds = new Set(sameRequester.map((t) => t.id));

  const sameClientOpen = sortScored(
    sameClientOpenRaw
      .map((c) => scoreCandidate(c, { crossClient: false }))
      .map(applyFeedback)
      .filter((c): c is Scored => c !== null)
      .filter(
        (c) =>
          !sameRequesterIds.has(c.id) &&
          (c._score >= MIN_SCORE_SAME || c.categoryId === ticketCategoryId),
      ),
  ).slice(0, limit);

  const sameClientResolved = sortScored(
    sameClientResolvedRaw
      .map((c) => scoreCandidate(c, { crossClient: false }))
      .map(applyFeedback)
      .filter((c): c is Scored => c !== null)
      .filter(
        (c) =>
          !sameRequesterIds.has(c.id) &&
          (c._score >= MIN_SCORE_SAME || c.categoryId === ticketCategoryId),
      ),
  ).slice(0, limit);

  const otherClientsResolved = sortScored(
    otherClientsRaw
      .map((c) => scoreCandidate(c, { crossClient: true }))
      .map(applyFeedback)
      .filter((c): c is Scored => c !== null)
      .filter((c) => c._matches >= MIN_MATCHES_CROSS && c._score >= MIN_SCORE_CROSS),
  ).slice(0, limit);

  const format = (t: Scored) => {
    // Détail par token : IDF + boost + penalty pour le popover "pourquoi
    // ce match ?". Coût négligeable, quelques tokens par ticket.
    const tokenDetails = t._matchedTokens.map((tk) => ({
      token: tk,
      idf: Math.round((idf.get(tk) ?? 1) * 100) / 100,
      boost: Math.round((tokenBoosts.get(tk) ?? 0) * 100) / 100,
      penalty: Math.round((tokenPenalties.get(tk) ?? 0) * 100) / 100,
    }));
    return {
      id: t.id,
      number: t.number,
      subject: t.subject,
      status: t.status,
      categoryName: t.category?.name ?? null,
      createdAt: t.createdAt,
      closedAt: t.closedAt ?? t.resolvedAt,
      organization: t.organization
        ? { id: t.organization.id, name: t.organization.name, slug: t.organization.slug }
        : null,
      // Score + détail des matches exposés côté client : l'UI peut afficher
      // un tooltip "Matché sur : fortigate, active directory, cve-2024-1234"
      // pour que le tech comprenne pourquoi ce ticket apparaît.
      score: Math.round(t._score * 100) / 100,
      matchCount: t._matches,
      matchedTokens: t._matchedTokens,
      matchedBigrams: t._matchedBigrams,
      semanticSim: Math.round(t._semanticSim * 100) / 100,
      // Enrichissement pour le popover "pourquoi cette suggestion ?"
      tokenDetails,
    };
  };

  return NextResponse.json({
    ticketId: ticket.id,
    debug: {
      tokens,
      rareTokens,
      bigrams,
      minScoreSame: MIN_SCORE_SAME,
      minScoreCross: MIN_SCORE_CROSS,
      minMatchesCross: MIN_MATCHES_CROSS,
    },
    sameRequester: sameRequester.map(format),
    sameClientOpen: sameClientOpen.map(format),
    sameClientResolved: sameClientResolved.map(format),
    otherClientsResolved: otherClientsResolved.map(format),
  });
}
