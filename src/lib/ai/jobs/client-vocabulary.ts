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
      const toks = extractVocabTokens(`${t.subject} ${t.description ?? ""}`);
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

function extractVocabTokens(text: string): Set<string> {
  const out = new Set<string>();
  if (!text) return out;

  // Pass 1 : acronymes ALL-CAPS 2-6 chars (avec chiffres optionnels)
  const acronymRe = /\b[A-Z]{2,6}(?:[-_]?\d+)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = acronymRe.exec(text)) !== null) {
    out.add(m[0].toLowerCase());
  }

  // Pass 2 : hostnames structurés (SRV-XX, DC01-YY, WKS-NNN)
  const hostRe = /\b[A-Z]{2,5}\d*-[A-Z0-9]{2,10}(?:-[A-Z0-9]+)?\b/g;
  while ((m = hostRe.exec(text)) !== null) {
    out.add(m[0].toLowerCase());
  }

  // Pass 3 : mots normalisés ≥ 4 chars, hors stop-words
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  for (const tok of normalized.split(/\s+/)) {
    if (tok.length < MIN_TOKEN_LEN || tok.length > 30) continue;
    if (/^\d+$/.test(tok)) continue;
    if (VOCAB_STOP.has(tok)) continue;
    out.add(tok);
  }

  return out;
}
