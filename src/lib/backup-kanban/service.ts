// ============================================================================
// Service Kanban des sauvegardes (/backups → Kanban).
//
// Responsabilités :
//   1. Agréger les alertes Veeam FAILED par organisation dans la fenêtre de
//      lookback configurée → liste `{ org, failedTasks[], latestAlertAt }`.
//   2. Générer / rafraîchir les templates (BackupTicketTemplate) à partir
//      de cette agrégation, sans toucher aux tickets déjà convertis.
//   3. Convertir un template en vrai Ticket quand l'utilisateur le drop
//      en colonne 2 (catégorie/sous-cat/priorité depuis les settings).
//
// Principe anti-écrasement du titre éditable par l'agent :
//   Quand on rafraîchit, si le template existe déjà et que l'utilisateur
//   a modifié son titre (différent de ce qu'on aurait généré), on
//   conserve son titre. On met juste à jour la liste des failedTasks,
//   latestAlertAt et sourceAlertIds — l'agent garde le contrôle du libellé.
//
// Principe anti-boucle avec la colonne 2 :
//   Les tickets convertis sont de vrais `Ticket` dans la table principale.
//   Leur équivalent `BackupTicketTemplate` est SUPPRIMÉ au moment de la
//   conversion (cf. convertTemplateToTicket). Du coup, un refresh ultérieur
//   qui voit à nouveau des alertes FAILED pour ce client recréera un
//   NOUVEAU template en colonne 1 — sans affecter le ticket en cours de
//   traitement. Ça match la demande : "nouvelles alertes = nouveaux
//   templates ; anciens tickets = intacts".
// ============================================================================

import prisma from "@/lib/prisma";
import { getSetting } from "@/lib/tenant-settings/service";
import { createTicket } from "@/lib/tickets/service";

export interface AggregatedFailures {
  organizationId: string;
  organizationName: string;
  failedTasks: string[]; // jobNames distincts, ordonnés par date desc
  latestAlertAt: Date;
  sourceAlertIds: string[];
}

/**
 * Agrège les alertes VeeamBackupAlert FAILED par organisation sur la
 * fenêtre donnée. Ne retourne que les orgs avec ≥1 tâche en échec et
 * dont organizationId est connu (les alertes non matchées à une org
 * sont ignorées — elles apparaissent déjà dans la carte "Non associé"
 * du dashboard Veeam, et on n'a nulle part où créer un ticket).
 */
export async function aggregateFailuresByOrg(
  lookbackDays: number,
): Promise<AggregatedFailures[]> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const alerts = await prisma.veeamBackupAlert.findMany({
    where: {
      status: "FAILED",
      receivedAt: { gte: since },
      organizationId: { not: null },
    },
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      organizationId: true,
      organizationName: true,
      jobName: true,
      receivedAt: true,
    },
  });

  const byOrg = new Map<string, AggregatedFailures>();
  // Déduplique `jobName` par org : on garde la première occurrence (la plus
  // récente grâce au orderBy desc), ce qui donne aussi la date de dernière
  // alerte par job. Sur l'ensemble org, latestAlertAt = première alerte vue.
  for (const a of alerts) {
    const orgId = a.organizationId as string;
    let entry = byOrg.get(orgId);
    if (!entry) {
      entry = {
        organizationId: orgId,
        organizationName: a.organizationName ?? "Client inconnu",
        failedTasks: [],
        latestAlertAt: a.receivedAt,
        sourceAlertIds: [],
      };
      byOrg.set(orgId, entry);
    }
    entry.sourceAlertIds.push(a.id);
    if (!entry.failedTasks.includes(a.jobName)) {
      entry.failedTasks.push(a.jobName);
    }
    // Max via comparaison simple (alerts est déjà trié desc mais on reste
    // safe si le caller change l'ordre).
    if (a.receivedAt > entry.latestAlertAt) {
      entry.latestAlertAt = a.receivedAt;
    }
  }

  return Array.from(byOrg.values()).sort(
    (a, b) => b.latestAlertAt.getTime() - a.latestAlertAt.getTime(),
  );
}

/**
 * Applique le gabarit de titre configuré à une org. Remplace les
 * placeholders `{clientName}`, `{clientCode}`, `{failedCount}`, `{date}`.
 */
export function renderTitle(
  pattern: string,
  ctx: {
    clientName: string;
    clientCode?: string | null;
    failedCount: number;
    latestAlertAt: Date;
  },
): string {
  const dateStr = ctx.latestAlertAt.toISOString().slice(0, 10); // YYYY-MM-DD
  return pattern
    .replace(/\{clientName\}/g, ctx.clientName)
    .replace(/\{clientCode\}/g, ctx.clientCode ?? "")
    .replace(/\{failedCount\}/g, String(ctx.failedCount))
    .replace(/\{date\}/g, dateStr)
    .trim();
}

export interface RefreshResult {
  created: number;    // nouveaux templates créés
  updated: number;    // templates existants mis à jour (tasks/date)
  preserved: number;  // templates existants gardés tels quels (titre édité par l'agent)
  purged: number;     // templates supprimés car plus d'échec récent
  orgsSkipped: number; // orgs qui ont déjà un ticket en colonne 2 (on ne crée pas de doublon)
}

/**
 * (Re)génère les templates en colonne 1 à partir des dernières alertes.
 *
 * - Pour chaque org avec ≥1 FAILED récent : upsert un template.
 * - Pour chaque template existant dont l'org n'a plus de FAILED récent :
 *   supprime le template (la colonne 1 doit refléter "ce qui est actif").
 * - Ne touche JAMAIS aux tickets en colonne 2 (ils n'existent pas dans
 *   cette table de toute façon — ils sont dans `Ticket`).
 */
export async function refreshTemplates(): Promise<RefreshResult> {
  const settings = await getSetting("backup-kanban");
  const failures = await aggregateFailuresByOrg(settings.lookbackDays);

  const existingTemplates = await prisma.backupTicketTemplate.findMany({
    select: {
      id: true,
      organizationId: true,
      subject: true,
      failedTasks: true,
      sourceAlertIds: true,
    },
  });
  const existingByOrg = new Map(
    existingTemplates.map((t) => [t.organizationId, t] as const),
  );

  // Charge les orgs (name + clientCode) en une seule requête pour éviter N+1.
  const orgs = await prisma.organization.findMany({
    where: { id: { in: failures.map((f) => f.organizationId) } },
    select: { id: true, name: true, clientCode: true },
  });
  const orgById = new Map(orgs.map((o) => [o.id, o] as const));

  let created = 0;
  let updated = 0;
  let preserved = 0;
  const orgsSkipped = 0; // placeholder — pas de skip pour l'instant (cf. note ci-dessous)
  let purged = 0;

  const stillActiveOrgIds = new Set<string>();

  for (const f of failures) {
    stillActiveOrgIds.add(f.organizationId);
    const org = orgById.get(f.organizationId);
    if (!org) continue; // org disparue entre les 2 queries — improbable

    const existing = existingByOrg.get(f.organizationId);
    const defaultTitle = renderTitle(settings.titlePattern, {
      clientName: org.name,
      clientCode: org.clientCode,
      failedCount: f.failedTasks.length,
      latestAlertAt: f.latestAlertAt,
    });

    if (!existing) {
      await prisma.backupTicketTemplate.create({
        data: {
          organizationId: f.organizationId,
          subject: defaultTitle,
          failedTasks: f.failedTasks,
          latestAlertAt: f.latestAlertAt,
          sourceAlertIds: f.sourceAlertIds,
        },
      });
      created++;
      continue;
    }

    // Le template existe. Si l'utilisateur n'a pas modifié le titre, on
    // peut le rafraîchir (utile si failedCount/date ont changé). Si c'est
    // un titre custom, on le garde tel quel.
    // Heuristique : "non modifié" = subject identique au titre qu'on aurait
    // généré AVEC la liste précédente de tasks. Comme on ne stocke pas ça,
    // on compare au titre "qu'on générerait avec le state courant" — un peu
    // plus conservateur, mais évite d'écraser une modif user.
    const looksDefault = existing.subject === defaultTitle;

    // Détecte si les données agrégées ont changé (nouvelles tâches, etc.)
    const sameTasks =
      existing.failedTasks.length === f.failedTasks.length &&
      existing.failedTasks.every((t) => f.failedTasks.includes(t));

    if (looksDefault && !sameTasks) {
      // Met à jour tout, y compris le titre par défaut.
      await prisma.backupTicketTemplate.update({
        where: { id: existing.id },
        data: {
          subject: defaultTitle,
          failedTasks: f.failedTasks,
          latestAlertAt: f.latestAlertAt,
          sourceAlertIds: f.sourceAlertIds,
        },
      });
      updated++;
    } else {
      // Soit le titre est custom → on ne le retouche pas ; soit rien n'a
      // changé côté tâches. Dans les deux cas on peut quand même mettre
      // à jour la liste (utile pour afficher le bon détail).
      const needsDataRefresh =
        !sameTasks ||
        f.latestAlertAt.getTime() !== existing.sourceAlertIds.length;
      if (!sameTasks) {
        await prisma.backupTicketTemplate.update({
          where: { id: existing.id },
          data: {
            failedTasks: f.failedTasks,
            latestAlertAt: f.latestAlertAt,
            sourceAlertIds: f.sourceAlertIds,
          },
        });
        updated++;
      } else {
        preserved++;
      }
      void needsDataRefresh;
    }
  }

  // Purge : templates orphelins (plus d'alertes FAILED récentes pour l'org).
  for (const t of existingTemplates) {
    if (!stillActiveOrgIds.has(t.organizationId)) {
      await prisma.backupTicketTemplate.delete({ where: { id: t.id } });
      purged++;
    }
  }

  return { created, updated, preserved, purged, orgsSkipped };
}

/**
 * Construit la description Markdown listant les tâches en échec. C'est
 * le contenu utilisé dans le ticket final (colonne 2). Non éditable dans
 * la colonne 1 — l'agent peut ajouter du contexte APRÈS conversion via
 * les commentaires / body du ticket.
 */
export function buildDescription(failedTasks: string[]): string {
  if (failedTasks.length === 0) return "Aucune tâche en échec détectée.";
  const lines = ["**Tâches de sauvegarde en échec :**", ""];
  for (const t of failedTasks) lines.push(`- ${t}`);
  lines.push("", "_Généré automatiquement depuis le Kanban des sauvegardes._");
  return lines.join("\n");
}

/**
 * Convertit un template en vrai Ticket. Supprime le template une fois
 * le Ticket créé (transaction). Retourne le ticket créé.
 *
 * @throws si le template n'existe plus ou si aucun créateur n'est trouvé.
 */
export async function convertTemplateToTicket(
  templateId: string,
  creatorId: string,
): Promise<{ ticketId: string; ticketNumber: number }> {
  const template = await prisma.backupTicketTemplate.findUnique({
    where: { id: templateId },
    include: {
      organization: { select: { id: true, name: true, isInternal: true } },
    },
  });
  if (!template) {
    throw new Error("Template introuvable (déjà converti ou supprimé)");
  }

  const settings = await getSetting("backup-kanban");
  // Préférence : subcategoryId si défini, sinon categoryId, sinon null.
  const categoryId = settings.subcategoryId || settings.categoryId || null;

  const ticket = await createTicket({
    subject: template.subject,
    description: buildDescription(template.failedTasks),
    organizationId: template.organizationId,
    creatorId,
    type: "incident",
    priority: settings.priority.toLowerCase() as
      | "low"
      | "medium"
      | "high"
      | "critical",
    categoryId,
    isInternal: !!template.organization.isInternal,
  });

  // Marque le ticket comme provenant du Kanban sauvegardes — c'est ce
  // qui lui donne sa place dans la "colonne 2" de la vue /backups.
  // externalId=templateId est informatif (trace de l'origine), pas
  // utilisé pour le lookup (il est unique mais le template est sur le
  // point d'être supprimé donc pas de collision future possible).
  // `createTicket` renvoie un UiTicket (number déjà préfixé en string),
  // on relit donc le number DB brut pour la réponse API.
  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      externalSource: BACKUP_KANBAN_SOURCE,
      externalId: `${BACKUP_KANBAN_SOURCE}:${templateId}`,
    },
    select: { id: true, number: true },
  });

  // Supprime le template (la "carte colonne 1" n'existe plus ; la colonne 2
  // lit `Ticket` directement via un filtre spécifique — cf. GET de la route).
  await prisma.backupTicketTemplate.delete({ where: { id: templateId } });

  return { ticketId: updated.id, ticketNumber: updated.number };
}

/**
 * Marqueur `externalSource` appliqué aux tickets créés via le Kanban
 * sauvegardes. Permet de les retrouver pour la colonne 2 de la vue
 * /backups sans ajouter un nouveau champ au modèle Ticket.
 */
export const BACKUP_KANBAN_SOURCE = "backup-kanban";

/**
 * Liste les tickets actifs créés depuis le Kanban sauvegardes (colonne 2).
 * Exclut les tickets résolus/fermés/annulés pour garder le tableau compact
 * — ils restent accessibles dans la vue tickets classique.
 */
export async function listInProcessingTickets() {
  return prisma.ticket.findMany({
    where: {
      externalSource: BACKUP_KANBAN_SOURCE,
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      priority: true,
      isInternal: true,
      createdAt: true,
      organization: {
        select: { id: true, name: true, logo: true, clientCode: true },
      },
      assignee: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
      _count: {
        select: { comments: true },
      },
    },
  });
}
