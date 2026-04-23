// ============================================================================
// Détection IA de changements à partir de sources brutes (tickets résolus,
// commentaires projet, notes, modifs politiques/GPO/logiciels).
//
// Pipeline :
//   1. Collecter les signaux récents depuis Nexus
//   2. Pour chaque batch, demander à l'IA si ça décrit un "changement réel"
//      et, si oui, extraire titre/résumé/catégorie/impact/confiance
//   3. Filtrer par confidence >= seuil, dédupliquer via embedding similarity
//      (à ajouter en v2 — pour l'instant dédup par sourceType+sourceId).
//
// Retourne la liste des `Change` créés en statut AI_SUGGESTED (non publiés).
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_CONTENT_CLASSIFY } from "@/lib/ai/orchestrator/policies";
import type { ChangeCategory, ChangeImpact } from "@prisma/client";

const VALID_CATEGORIES: ChangeCategory[] = [
  "INFRASTRUCTURE", "NETWORK_SECURITY", "IDENTITY_ACCESS", "M365_CLOUD",
  "SOFTWARE", "BACKUPS", "WORKSTATIONS", "TELECOM_PRINT", "CONTRACTS",
  "ORGANIZATIONAL", "OTHER",
];
const VALID_IMPACTS: ChangeImpact[] = ["MINOR", "MODERATE", "MAJOR", "STRUCTURAL"];

const MIN_CONFIDENCE = 0.6;

interface SourceItem {
  sourceType: string;
  sourceId: string;
  text: string;
  date?: Date;
}

async function collectSources(orgId: string, sinceDays = 14): Promise<SourceItem[]> {
  const since = new Date(Date.now() - sinceDays * 86400_000);
  const items: SourceItem[] = [];

  // Tickets résolus
  const tickets = await prisma.ticket.findMany({
    where: {
      organizationId: orgId,
      status: { in: ["Résolu", "Fermé"] as never },
      updatedAt: { gte: since },
    },
    select: { id: true, subject: true, description: true, updatedAt: true, comments: { select: { body: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 2 } },
    take: 30,
  });
  for (const t of tickets) {
    const extra = t.comments.map((c) => c.body.slice(0, 500)).join("\n---\n");
    items.push({
      sourceType: "ticket",
      sourceId: t.id,
      text: `Sujet : ${t.subject}\n${(t.description || "").slice(0, 800)}\n${extra}`,
      date: t.updatedAt,
    });
  }

  // Projets récents
  const projects = await prisma.project.findMany({
    where: { organizationId: orgId, updatedAt: { gte: since } },
    select: { id: true, name: true, description: true, updatedAt: true },
    take: 10,
  });
  for (const p of projects) {
    items.push({
      sourceType: "project",
      sourceId: p.id,
      text: `Projet : ${p.name}\n${(p.description || "").slice(0, 800)}`,
      date: p.updatedAt,
    });
  }

  // Particularités ajoutées/mises à jour (contextes opérationnels)
  const particularities = await prisma.particularity.findMany({
    where: { organizationId: orgId, updatedAt: { gte: since }, status: "ACTIVE" },
    select: { id: true, title: true, summary: true, updatedAt: true },
    take: 15,
  });
  for (const p of particularities) {
    items.push({
      sourceType: "particularity", sourceId: p.id,
      text: `Particularité : ${p.title}\n${p.summary ?? ""}`,
      date: p.updatedAt,
    });
  }

  // Logiciels ajoutés/modifiés chez le client
  const software = await prisma.softwareInstance.findMany({
    where: { organizationId: orgId, updatedAt: { gte: since }, status: "ACTIVE" },
    select: { id: true, name: true, vendor: true, version: true, updatedAt: true },
    take: 15,
  });
  for (const s of software) {
    items.push({
      sourceType: "software", sourceId: s.id,
      text: `Logiciel : ${s.name} (${s.vendor ?? "?"}) v${s.version ?? "?"}`,
      date: s.updatedAt,
    });
  }

  // GPO instances récentes (déploiements ou modifications)
  const gpoInstances = await prisma.gpoInstance.findMany({
    where: { organizationId: orgId, updatedAt: { gte: since } },
    select: { id: true, computedName: true, description: true, status: true, updatedAt: true },
    take: 15,
  });
  for (const g of gpoInstances) {
    items.push({
      sourceType: "gpo_instance", sourceId: g.id,
      text: `GPO : ${g.computedName} (${g.status})\n${g.description ?? ""}`,
      date: g.updatedAt,
    });
  }

  // Scripts publiés / modifiés
  const scripts = await prisma.scriptInstance.findMany({
    where: { organizationId: orgId, updatedAt: { gte: since } },
    select: { id: true, title: true, language: true, bodyDocMarkdown: true, updatedAt: true },
    take: 10,
  });
  for (const s of scripts) {
    items.push({
      sourceType: "script", sourceId: s.id,
      text: `Script ${s.language} : ${s.title}\n${(s.bodyDocMarkdown ?? "").slice(0, 500)}`,
      date: s.updatedAt,
    });
  }

  // Politiques documentées
  const policies = await prisma.policyDocument.findMany({
    where: { organizationId: orgId, updatedAt: { gte: since }, status: "ACTIVE" },
    select: { id: true, title: true, subcategory: true, summary: true, updatedAt: true },
    take: 15,
  });
  for (const p of policies) {
    items.push({
      sourceType: "policy_document", sourceId: p.id,
      text: `Politique ${p.subcategory} : ${p.title}\n${p.summary ?? ""}`,
      date: p.updatedAt,
    });
  }

  // Actifs récemment ajoutés ou modifiés
  const assets = await prisma.asset.findMany({
    where: { organizationId: orgId, updatedAt: { gte: since } },
    select: { id: true, name: true, type: true, manufacturer: true, model: true, status: true, updatedAt: true },
    take: 15,
  });
  for (const a of assets) {
    items.push({
      sourceType: "asset", sourceId: a.id,
      text: `Actif ${a.type} : ${a.name} — ${a.manufacturer ?? ""} ${a.model ?? ""} (${a.status})`,
      date: a.updatedAt,
    });
  }

  return items;
}

interface AiVerdict {
  isChange: boolean;
  title?: string;
  summary?: string;
  category?: ChangeCategory;
  impact?: ChangeImpact;
  confidence?: number;
  reasoning?: string;
}

async function classifyAsChange(item: SourceItem, organizationName: string | null, userId: string | null): Promise<AiVerdict> {
  const result = await runAiTask({
    policy: POLICY_CONTENT_CLASSIFY,
    messages: [
      {
        role: "system",
        content: `Tu analyses un texte opérationnel pour déterminer s'il DÉCRIT un changement significatif et durable dans l'environnement technique d'un client MSP (et non un simple support ponctuel).

Un "changement significatif" = modification durable d'infrastructure, de logiciel déployé, de politique, de réseau, d'identité, de contrat ou d'organisation. PAS un ticket de support résolu par une action banale (redémarrage, déblocage de mot de passe, etc.).

Retourne UNIQUEMENT du JSON :
{
  "isChange": true|false,
  "title": "titre court 40-80 chars (si isChange)",
  "summary": "1-2 phrases (si isChange)",
  "category": "INFRASTRUCTURE|NETWORK_SECURITY|IDENTITY_ACCESS|M365_CLOUD|SOFTWARE|BACKUPS|WORKSTATIONS|TELECOM_PRINT|CONTRACTS|ORGANIZATIONAL|OTHER",
  "impact": "MINOR|MODERATE|MAJOR|STRUCTURAL",
  "confidence": 0.0-1.0,
  "reasoning": "pourquoi en 1 phrase"
}

Règles :
- Par défaut isChange=false. Active uniquement si le texte parle explicitement d'ajout, suppression, remplacement, migration, configuration durable.
- Confidence <0.6 → rejeté automatiquement, sois honnête.`,
      },
      {
        role: "user",
        content: `Client : ${organizationName ?? "?"}\nSource : ${item.sourceType} #${item.sourceId}\n\n${item.text.slice(0, 3500)}`,
      },
    ],
    taskKind: "classification",
    context: { userId: userId ?? undefined },
  });
  if (!result.ok || !result.content) return { isChange: false };
  const raw = result.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(raw) as AiVerdict;
    return parsed;
  } catch {
    return { isChange: false };
  }
}

export async function detectChangesForOrg(orgId: string, opts?: { userId?: string; sinceDays?: number }): Promise<{ signalsCreated: number; changesProposed: number }> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  const sources = await collectSources(orgId, opts?.sinceDays ?? 14);

  let signalsCreated = 0;
  let changesProposed = 0;

  for (const item of sources) {
    // Dédup : un signal par (sourceType, sourceId)
    const existing = await prisma.changeAiSignal.findFirst({
      where: { organizationId: orgId, sourceType: item.sourceType, sourceId: item.sourceId },
    });
    if (existing) continue;

    const verdict = await classifyAsChange(item, org?.name ?? null, opts?.userId ?? null);
    if (!verdict.isChange || (verdict.confidence ?? 0) < MIN_CONFIDENCE) {
      // On enregistre quand même un signal DISMISSED pour ne pas re-classifier
      await prisma.changeAiSignal.create({
        data: {
          organizationId: orgId,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          rawText: item.text.slice(0, 4000),
          confidence: verdict.confidence ?? 0,
          status: "DISMISSED",
        },
      });
      signalsCreated++;
      continue;
    }

    const category = VALID_CATEGORIES.includes(verdict.category as ChangeCategory) ? verdict.category! : "OTHER";
    const impact = VALID_IMPACTS.includes(verdict.impact as ChangeImpact) ? verdict.impact! : "MODERATE";

    const change = await prisma.change.create({
      data: {
        organizationId: orgId,
        title: (verdict.title ?? "Changement détecté").slice(0, 120),
        summary: verdict.summary ?? null,
        body: verdict.reasoning ?? "",
        category: category as ChangeCategory,
        impact: impact as ChangeImpact,
        status: "AI_SUGGESTED",
        changeDate: item.date ?? new Date(),
        detectedAt: new Date(),
        aiConfidence: verdict.confidence ?? 0,
        sources: [{ type: item.sourceType, id: item.sourceId, excerpt: item.text.slice(0, 400) }] as never,
        linkedTicketIds: item.sourceType === "ticket" ? [item.sourceId] : [],
      },
    });

    await prisma.changeAiSignal.create({
      data: {
        organizationId: orgId,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        rawText: item.text.slice(0, 4000),
        confidence: verdict.confidence ?? 0,
        proposedChangeId: change.id,
        status: "PROMOTED",
      },
    });
    signalsCreated++;
    changesProposed++;
  }

  return { signalsCreated, changesProposed };
}
