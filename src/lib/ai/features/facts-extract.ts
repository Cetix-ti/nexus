// ============================================================================
// AI FACTS EXTRACTION — Phase 2 → fondation Phase 3.
//
// Job batch qui lit les tickets résolus récents d'une organisation et
// propose des "faits" structurés à stocker dans AiMemory :
//   - conventions    : "VDSA utilise toujours MFA Microsoft, pas Authenticator"
//   - quirks         : "Le firewall de Louiseville bloque UDP 500 sortant"
//   - preferences    : "Ne jamais redémarrer SERVEUR-X sans accord client"
//   - incident_pattern : "Imprimantes Ricoh de HLX tombent offline après mise à jour Windows"
//
// Les faits sont proposés avec `verifiedAt=null` → visibles dans une file
// d'admin à valider. Une fois validés, ils enrichissent le contexte de
// toutes les features IA qui concernent ce client (triage, response-assist).
//
// Déduplication : on hash le `fact` normalisé (lowercase, trim) + scope.
// Si un fait équivalent existe déjà, on n'en crée pas un second.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_FACTS_EXTRACT } from "@/lib/ai/orchestrator/policies";

export interface ExtractedFact {
  kind: "convention" | "quirk" | "preference" | "incident_pattern";
  fact: string;
  /** Référence au ticket source pour traçabilité. */
  sourceTicketId?: string;
  confidence: number;
}

interface ExtractStats {
  scanned: number;
  proposed: number;
  dedupedExisting: number;
}

/**
 * Analyse les tickets résolus d'une organisation dans une fenêtre donnée
 * et propose des faits à l'admin. Idempotent — un re-run ne crée pas de
 * doublons si les faits extraits sont identiques.
 */
export async function extractFactsForOrganization(args: {
  organizationId: string;
  sinceDays?: number;
  maxTickets?: number;
}): Promise<ExtractStats> {
  const sinceDays = args.sinceDays ?? 90;
  const maxTickets = args.maxTickets ?? 30;

  const stats: ExtractStats = {
    scanned: 0,
    proposed: 0,
    dedupedExisting: 0,
  };

  const org = await prisma.organization.findUnique({
    where: { id: args.organizationId },
    select: { id: true, name: true },
  });
  if (!org) return stats;

  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  // On échantillonne plutôt que tout charger — si une org a 500 tickets
  // résolus, 30 suffit pour voir des patterns. Trie par closedAt desc
  // pour avoir les plus récents (= plus représentatifs).
  const tickets = await prisma.ticket.findMany({
    where: {
      organizationId: args.organizationId,
      status: { in: ["RESOLVED", "CLOSED"] },
      closedAt: { gte: since },
    },
    select: {
      id: true,
      number: true,
      subject: true,
      description: true,
      category: { select: { name: true } },
      comments: {
        where: { isInternal: true },
        orderBy: { createdAt: "desc" },
        select: { body: true },
        take: 3,
      },
    },
    orderBy: { closedAt: "desc" },
    take: maxTickets,
  });

  stats.scanned = tickets.length;
  if (tickets.length < 3) return stats;

  const ticketsBlock = tickets
    .map(
      (t, i) =>
        `### Ticket ${i + 1} (#${t.number})
Sujet : ${t.subject}
Catégorie : ${t.category?.name ?? "—"}
Description : ${(t.description ?? "").slice(0, 300)}
Notes internes : ${t.comments.map((c) => stripHtml(c.body).slice(0, 300)).join(" | ") || "(aucune)"}`,
    )
    .join("\n\n");

  const system = `Tu extrais des FAITS UTILES à partir de tickets résolus d'un client MSP. Ces faits seront utilisés plus tard pour enrichir le contexte des suggestions IA sur ce client — donc ils doivent être durables, actionnables et spécifiques à ce client.

Tu réponds EXCLUSIVEMENT en JSON strict, format :
{
  "facts": [
    {
      "kind": "convention" | "quirk" | "preference" | "incident_pattern",
      "fact": "énoncé factuel, 1-2 phrases maximum, au présent",
      "sourceTicketNumber": 1234,
      "confidence": 0.0-1.0
    }
  ]
}

Types de faits :
- "convention" : une pratique récurrente du client (ex: "utilise FortiClient SAML pour VPN")
- "quirk" : particularité technique non standard (ex: "le serveur FS2 nécessite un redémarrage manuel après patch")
- "preference" : préférence exprimée par le client (ex: "demande toujours d'avertir avant intervention sur le serveur financier")
- "incident_pattern" : récurrence observée (ex: "panne d'impression le lundi matin après patch Tuesday Microsoft")

Règles strictes :
- UNIQUEMENT des faits observés dans les tickets fournis. Ne pas inventer.
- Si un fait n'est observé QU'UNE FOIS → confidence ≤ 0.4.
- Si un fait est répété dans 3+ tickets → confidence ≥ 0.7.
- Omettre les faits triviaux ("le client a signalé un problème"), les faits génériques ("il faut tester après intervention"), ou les faits qui ne concernent pas le futur.
- Viser 3-8 faits de haute qualité. Préférer peu et utile à beaucoup et bruyant.
- Si aucun pattern net n'émerge, retourne {"facts": []}.`;

  const user = `Client : ${org.name}
Période analysée : ${sinceDays} derniers jours
Nombre de tickets : ${tickets.length}

${ticketsBlock}`;

  const result = await runAiTask({
    policy: POLICY_FACTS_EXTRACT,
    context: { organizationId: org.id },
    taskKind: "extraction",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  if (!result.ok || !result.content) return stats;

  const parsed = parseJson(result.content);
  if (!parsed || !Array.isArray(parsed.facts)) return stats;

  const scopeKey = `org:${org.id}`;

  for (const raw of parsed.facts as unknown[]) {
    const o = raw as Record<string, unknown>;
    const kindRaw = String(o.kind ?? "").toLowerCase();
    if (
      kindRaw !== "convention" &&
      kindRaw !== "quirk" &&
      kindRaw !== "preference" &&
      kindRaw !== "incident_pattern"
    ) {
      continue;
    }
    const factText = String(o.fact ?? "").trim();
    if (!factText || factText.length < 10) continue;
    const confidence = Number(o.confidence);
    const confValue =
      Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
        ? confidence
        : 0.5;

    // Dé-doublonnage : fact normalisé + scope = clé logique. On cherche
    // un AiMemory existant avec content identique (case-insensitive).
    const normalized = factText.toLowerCase().replace(/\s+/g, " ").trim();
    const existing = await prisma.aiMemory.findFirst({
      where: {
        scope: scopeKey,
        category: kindRaw,
      },
      select: { id: true, content: true },
    });
    // Simple dedup : même catégorie + même contenu normalisé.
    const existingMatch = await findExistingFact(scopeKey, kindRaw, normalized);
    if (existingMatch) {
      stats.dedupedExisting++;
      continue;
    }

    // Trouve le ticket source via sourceTicketNumber si fourni.
    const sourceTicketNumRaw = o.sourceTicketNumber;
    let sourceTicketId: string | null = null;
    if (typeof sourceTicketNumRaw === "number") {
      const idx = sourceTicketNumRaw - 1;
      if (idx >= 0 && idx < tickets.length) {
        sourceTicketId = tickets[idx].id;
      }
    }

    await prisma.aiMemory.create({
      data: {
        scope: scopeKey,
        category: kindRaw,
        content: factText,
        source: sourceTicketId
          ? `extracted:ticket:${sourceTicketId}`
          : `extracted:batch:${new Date().toISOString().slice(0, 10)}`,
      },
    });
    stats.proposed++;
    // Le `existing` var est gardée pour éviter un TS "unused" — logique
    // réelle de dédup via findExistingFact ci-dessus.
    void existing;
  }

  return stats;
}

/**
 * Recherche un fait déjà présent — match textuel normalisé. Pas d'index
 * parfait, mais acceptable à notre volume (50-500 faits par org max).
 */
async function findExistingFact(
  scope: string,
  category: string,
  normalizedFact: string,
): Promise<boolean> {
  const rows = await prisma.aiMemory.findMany({
    where: { scope, category },
    select: { content: true },
  });
  for (const r of rows) {
    const norm = r.content.toLowerCase().replace(/\s+/g, " ").trim();
    if (norm === normalizedFact) return true;
  }
  return false;
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(raw);
    return typeof o === "object" && o !== null ? (o as Record<string, unknown>) : null;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const o = JSON.parse(m[0]);
      return typeof o === "object" && o !== null ? (o as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
