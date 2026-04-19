// ============================================================================
// CLIENT VOCABULARY — extrait le jargon technique propre à chaque client.
//
// Idée : chaque MSP client a son propre vocabulaire — noms de serveurs
// internes (SRV-CERBERE, BACKUPVM), applications custom (BioMed-X,
// Cliniplus), acronymes maison (ZAD pour "zone administrative directe").
// Ces termes sont INCONNUS du modèle IA de base mais APPARAISSENT
// régulièrement dans les tickets du client.
//
// L'algorithme extrait les tokens :
//   - fréquents chez ce client (≥ 3 apparitions dans les 90 derniers jours)
//   - RARES globalement (apparaissent dans ≤ 2% des tickets globaux)
//
// Les tokens qualifiés sont sauvegardés comme AiMemory vocabulary facts :
//   content: "Terme 'SRV-CERBERE' utilisé fréquemment chez ce client
//            (12 occurrences/90j). Probablement un nom de serveur interne."
//
// Ces faits alimentent ensuite le contexte IA pour triage, response_assist,
// chat, etc. — l'IA comprend immédiatement qu'un token inconnu est
// probablement un asset client et peut poser les bonnes questions.
//
// 100% autonome. Recalcule toutes les 12h.
// ============================================================================

import prisma from "@/lib/prisma";

const LOOKBACK_DAYS = 90;
const MIN_CLIENT_OCCURRENCES = 3;
const GLOBAL_RARITY_MAX = 0.02; // token dans ≤ 2% des tickets globaux = rare
const MIN_TOKEN_LEN = 4;

// Stop-words techniques à ignorer — voir sanity stop dans triage.ts mais
// étendu avec des patterns qui ne forment pas un vocabulaire technique.
const VOCAB_STOP = new Set([
  // Verbes/noms trop communs en support
  "avec", "sans", "dans", "pour", "mais", "plus", "tous", "tout",
  "problem", "problème", "erreur", "issue", "ticket", "client", "user",
  "email", "courriel", "compte", "message", "windows", "office",
  "system", "outlook", "teams", "microsoft", "server", "serveur",
  "fichier", "file", "dossier", "folder", "application",
  // Mots de liaison/communication
  "bonjour", "merci", "cordialement", "salutations",
  // Patterns de date/heure parse-résistants
  "hier", "aujourd", "demain", "matin", "soir",
]);

export async function extractClientVocabularies(): Promise<{
  orgs: number;
  tokensAdded: number;
  factsWritten: number;
}> {
  const stats = { orgs: 0, tokensAdded: 0, factsWritten: 0 };

  // Baseline globale : fréquence de chaque token tous clients confondus
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);
  const allTickets = await prisma.ticket.findMany({
    where: { createdAt: { gte: since } },
    select: { subject: true, description: true },
    take: 5000,
  });
  const globalDocCount = allTickets.length;
  const globalDF = new Map<string, number>();
  for (const t of allTickets) {
    const toks = extractVocabTokens(`${t.subject} ${t.description ?? ""}`);
    for (const tok of toks) globalDF.set(tok, (globalDF.get(tok) ?? 0) + 1);
  }

  const orgs = await prisma.organization.findMany({
    where: { isActive: true, isInternal: false },
    select: { id: true, name: true },
  });

  for (const org of orgs) {
    stats.orgs++;
    const orgTickets = await prisma.ticket.findMany({
      where: { organizationId: org.id, createdAt: { gte: since } },
      select: { subject: true, description: true },
      take: 500,
    });
    if (orgTickets.length < 5) continue;

    const orgTF = new Map<string, number>();
    for (const t of orgTickets) {
      // Strip des signatures avant extraction — sinon les noms de techs
      // Cetix (bruno@cetix.ca, "Directeur Services"), numéros de téléphone
      // bureau, adresses courriel corpo, se retrouvent dans le vocabulaire
      // client alors qu'ils n'ont rien à voir avec le client.
      const cleanDesc = stripEmailSignatures(t.description ?? "");
      const toks = extractVocabTokens(`${t.subject} ${cleanDesc}`);
      for (const tok of toks) orgTF.set(tok, (orgTF.get(tok) ?? 0) + 1);
    }

    // Filtre : ≥ MIN_CLIENT_OCCURRENCES chez ce client ET rareté globale
    const vocab: Array<{ token: string; clientCount: number; globalRate: number }> = [];
    for (const [tok, count] of orgTF) {
      if (count < MIN_CLIENT_OCCURRENCES) continue;
      const globalCount = globalDF.get(tok) ?? 0;
      const globalRate = globalDocCount > 0 ? globalCount / globalDocCount : 0;
      if (globalRate > GLOBAL_RARITY_MAX) continue;
      vocab.push({ token: tok, clientCount: count, globalRate });
    }
    vocab.sort((a, b) => b.clientCount - a.clientCount);

    // Top 30 par org — assez pour couvrir le jargon sans spammer AiMemory
    const topVocab = vocab.slice(0, 30);
    stats.tokensAdded += topVocab.length;

    for (const v of topVocab) {
      // Upsert AiMemory fact de catégorie "vocabulary".
      // Source="system:vocab-extractor" distingue ces faits des extractions
      // générales de facts-extract.ts.
      const content = `Terme "${v.token}" utilisé fréquemment chez ce client (${v.clientCount} occurrences sur ${LOOKBACK_DAYS}j, très rare globalement à ${(v.globalRate * 100).toFixed(2)}%). Probablement un asset, acronyme, ou produit spécifique au client.`;

      // Dédup manuel : on cherche un AiMemory existant avec même scope +
      // catégorie + token dans le contenu.
      const existing = await prisma.aiMemory.findFirst({
        where: {
          scope: `org:${org.id}`,
          category: "vocabulary",
          content: { contains: `"${v.token}"` },
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.aiMemory.update({
          where: { id: existing.id },
          data: { content },
        });
      } else {
        await prisma.aiMemory.create({
          data: {
            scope: `org:${org.id}`,
            category: "vocabulary",
            content,
            source: "system:vocab-extractor",
            // Auto-validé car algorithmique, pas d'hallucination LLM possible.
            verifiedAt: new Date(),
            verifiedBy: "system:vocab-extractor",
          },
        });
        stats.factsWritten++;
      }
    }
  }

  return stats;
}

/**
 * Strip les blocs de signature courants dans les descriptions de tickets.
 * Tronque le texte au premier marqueur de signature trouvé — tout ce qui
 * suit est considéré comme signature/contact et IGNORÉ pour l'extraction
 * de vocabulaire.
 *
 * Marqueurs détectés (FR + EN) :
 *   - Ligne "-- " ou "--" seule (RFC 3676 standard)
 *   - "-----Original Message-----" / "De :" / "From:" (forward Outlook)
 *   - Closings communs : "Cordialement,", "Salutations,", "Merci,", "Thanks,",
 *     "Best regards,", "Sincerely,", "Bien à vous,"
 *   - "Sent from my iPhone/iPad" (signatures mobiles)
 *   - Blocs corp signature typiques : 3+ lignes successives avec phone/email
 *
 * Exporté pour tests unitaires.
 */
export function stripEmailSignatures(text: string): string {
  if (!text) return "";

  // Pattern 1 : séparateur standard "-- " ou "--" sur une ligne seule
  const separatorRe = /\n[-_]{2,}\s*\n/;
  const sepMatch = text.match(separatorRe);
  if (sepMatch && sepMatch.index !== undefined) {
    text = text.slice(0, sepMatch.index);
  }

  // Pattern 2 : "-----Original Message-----" ou "De :" / "From:" (forwards)
  const forwardRe = /\n\s*(?:-{3,}\s*Original\s+Message\s*-{3,}|De\s*:\s|From\s*:\s)/i;
  const fwdMatch = text.match(forwardRe);
  if (fwdMatch && fwdMatch.index !== undefined) {
    text = text.slice(0, fwdMatch.index);
  }

  // Pattern 3 : closings typiques (FR + EN) — tout ce qui suit la ligne qui
  // commence par "Cordialement," etc. est tronqué. Doit être en début de
  // ligne pour éviter les faux positifs ("je voulais te dire merci pour ton
  // aide" ne doit PAS être tronqué).
  const closingRe = /\n\s*(?:Cordialement|Salutations|Sinc[èe]rement|Bien\s+[àa]\s+(?:toi|vous)|Merci(?:\s+encore)?|Thanks(?:\s+again)?|Best(?:\s+regards)?|Sincerely|Regards|Cheers|À\s+bient[ôo]t)\s*[,.\n]/i;
  const closeMatch = text.match(closingRe);
  if (closeMatch && closeMatch.index !== undefined) {
    text = text.slice(0, closeMatch.index);
  }

  // Pattern 4 : "Sent from my iPhone" / "Envoyé depuis mon iPhone"
  const mobileRe = /\n\s*(?:Sent\s+from\s+my|Envoy[ée]\s+(?:depuis|de)\s+mon)\s+/i;
  const mobMatch = text.match(mobileRe);
  if (mobMatch && mobMatch.index !== undefined) {
    text = text.slice(0, mobMatch.index);
  }

  return text.trim();
}

function extractVocabTokens(text: string): Set<string> {
  const out = new Set<string>();
  if (!text) return out;

  // Pass 1 : acronymes ALL-CAPS 2-6 chars (avec chiffres optionnels)
  const acronymRe = /\b[A-Z]{2,6}(?:[-_]?\d+)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = acronymRe.exec(text)) !== null) {
    const tok = m[0].toLowerCase();
    if (!looksLikeJunkToken(tok)) out.add(tok);
  }

  // Pass 2 : hostnames structurés (SRV-XX, DC01-YY, WKS-NNN)
  const hostRe = /\b[A-Z]{2,5}\d*-[A-Z0-9]{2,10}(?:-[A-Z0-9]+)?\b/g;
  while ((m = hostRe.exec(text)) !== null) {
    const tok = m[0].toLowerCase();
    if (!looksLikeJunkToken(tok)) out.add(tok);
  }

  // Pass 3 : mots normalisés ≥ 4 chars, hors stop-words
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  for (const tok of normalized.split(/\s+/)) {
    if (tok.length < MIN_TOKEN_LEN || tok.length > 20) continue;
    if (/^\d+$/.test(tok)) continue;
    if (VOCAB_STOP.has(tok)) continue;
    if (looksLikeJunkToken(tok)) continue;
    out.add(tok);
  }

  return out;
}

/**
 * Heuristiques anti-junk : rejette les tokens qui ressemblent à des IDs
 * (cuid, UUID, hash, session ID), URL-encoded ou hex. Ces tokens se
 * glissaient dans le vocabulaire client faute de filtrage et polluaient le
 * contexte IA (ex: "bethbe9vppablntj71yhvhr4g" vu 17 fois = juste un cuid
 * qui traîne dans les descriptions, pas du vrai jargon).
 *
 * Règles cumulatives (une seule suffit à rejeter) :
 *   1. Longueur > 15 chars : aucun vrai mot technique n'est aussi long
 *   2. Commence par "2f" : URL-encoded slash ("%2F...")
 *   3. Hex-like (tous caractères ∈ [a-f0-9], ≥ 10 chars) : probable hash
 *   4. Aucune voyelle : jargon impossible à prononcer → quasi-certainement un ID
 *   5. Ratio digits > 30% : probablement un token avec IDs/versions mixés
 *   6. Densité lettres/digits alternée élevée : cuid-like
 */
export function looksLikeJunkToken(tok: string): boolean {
  if (!tok) return true;

  // Règle 1 : trop long
  if (tok.length > 15) return true;

  // Règle 2 : préfixe URL-encoded (%2F = /)
  if (tok.startsWith("2f") && tok.length >= 5) return true;

  // Règle 3 : hex-like (tous chars dans [a-f0-9] + assez long pour être un hash)
  if (tok.length >= 10 && /^[a-f0-9]+$/.test(tok)) return true;

  // Règle 4 : aucune voyelle (y incluse pour FR — "cycle", "style")
  if (tok.length >= 5 && !/[aeiouy]/.test(tok)) return true;

  // Règle 5 : ratio digits > 30% SUR TOKENS ≥ 6 CHARS.
  // Exclut les hostnames courts type "dc01", "ad02", "fs03" (4-5 chars
  // avec 50% digits) qui sont LÉGITIMES, tout en capturant les tokens
  // suspects plus longs avec mélange digits.
  if (tok.length >= 6) {
    const digitCount = (tok.match(/\d/g) ?? []).length;
    if (digitCount / tok.length > 0.3) return true;
  }

  // Règle 6 : alternance lettre/digit "cuid-like" (plus de 3 transitions)
  // Ex: "abc123def456" a 2 transitions ; "a1b2c3d4e5" a 9 transitions.
  if (tok.length >= 10) {
    let transitions = 0;
    for (let i = 1; i < tok.length; i++) {
      const prevDigit = /\d/.test(tok[i - 1]);
      const curDigit = /\d/.test(tok[i]);
      if (prevDigit !== curDigit) transitions++;
    }
    if (transitions >= 4) return true;
  }

  return false;
}

/**
 * Nettoie les AiMemory vocabulary déjà stockés qui matchent les patterns
 * de junk. À appeler une fois après le déploiement de la règle `looksLikeJunkToken`
 * (via endpoint admin ou script).
 *
 * Parse le `content` (format "Terme \"<token>\" utilisé…"), extrait le
 * token, applique le filtre. Retourne le nombre de rows supprimées.
 */
export async function cleanupJunkVocabulary(): Promise<{
  scanned: number;
  removed: number;
  tokensRemoved: string[];
}> {
  const rows = await prisma.aiMemory.findMany({
    where: {
      category: "vocabulary",
      source: "system:vocab-extractor",
    },
    select: { id: true, content: true },
  });
  const toRemove: string[] = [];
  const tokensRemoved: string[] = [];
  for (const r of rows) {
    const match = r.content.match(/Terme "([^"]+)"/);
    if (!match) continue;
    const tok = match[1];
    if (looksLikeJunkToken(tok)) {
      toRemove.push(r.id);
      tokensRemoved.push(tok);
    }
  }
  if (toRemove.length > 0) {
    await prisma.aiMemory.deleteMany({ where: { id: { in: toRemove } } });
  }
  return { scanned: rows.length, removed: toRemove.length, tokensRemoved };
}
