// ============================================================================
// DISPLAY STATUS — overlay d'affichage pour les tickets en attente d'approbation
//
// Sépare le `status` réel (NEW / OPEN / IN_PROGRESS / …) du status affiché
// dans l'UI. Quand un ticket est `requiresApproval=true && approvalStatus="pending"`,
// on affiche "En attente d'approbation" comme statut visuel — peu importe
// la valeur réelle du `status` sous-jacent.
//
// Avantages de ce design :
//   - Le `status` historique est préservé (pas de churn DB pendant la
//     phase d'approbation).
//   - Une fois approuvé, le ticket retombe sur son `status` réel sans
//     migration.
//   - Une fois rejeté ou override-déverrouillé, idem.
//   - Le rapport / kanban / filtres peuvent traiter ces tickets comme un
//     état séparé sans inventer un nouveau statut DB.
// ============================================================================

import type { TicketStatus } from "@/lib/mock-data";

export type DisplayStatus = TicketStatus | "pending_approval";

export interface MinimalTicket {
  status: TicketStatus | string;
  requiresApproval?: boolean;
  approvalStatus?: "not_required" | "pending" | "approved" | "rejected" | string;
  approvalLockOverride?: boolean;
}

/**
 * Retourne le statut à AFFICHER pour un ticket donné. Si le ticket est en
 * attente d'approbation et n'a pas été déverrouillé manuellement, on
 * retourne "pending_approval" — la couche présentation l'affiche comme
 * "En attente d'approbation".
 */
export function getDisplayStatus(t: MinimalTicket): DisplayStatus {
  const isPending =
    !!t.requiresApproval &&
    String(t.approvalStatus).toLowerCase() === "pending";
  if (isPending && !t.approvalLockOverride) {
    return "pending_approval";
  }
  return t.status as TicketStatus;
}

/**
 * Libellé localisé associé à un display status. Utilisé par les badges
 * partout dans l'UI agent et portail.
 */
const DISPLAY_STATUS_LABELS: Record<string, string> = {
  pending_approval: "En attente d'approbation",
  new: "Nouveau",
  open: "Ouvert",
  in_progress: "En cours",
  on_site: "Sur place",
  scheduled: "Planifié",
  pending: "En attente",
  waiting_client: "Attente client",
  waiting_vendor: "Attente fournisseur",
  resolved: "Résolu",
  closed: "Fermé",
  cancelled: "Annulé",
  deleted: "Supprimé",
};

export function getDisplayStatusLabel(s: DisplayStatus | string): string {
  return DISPLAY_STATUS_LABELS[String(s).toLowerCase()] ?? String(s);
}

/**
 * Classe Tailwind pour la couleur du badge associé au status. Centralise
 * pour qu'on n'ait pas à recopier la logique partout.
 */
export function getDisplayStatusClass(s: DisplayStatus | string): string {
  const k = String(s).toLowerCase();
  switch (k) {
    case "pending_approval":
      return "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300";
    case "new":
      return "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200";
    case "open":
      return "bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200";
    case "in_progress":
    case "on_site":
    case "scheduled":
      return "bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-200";
    case "pending":
    case "waiting_client":
    case "waiting_vendor":
      return "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200";
    case "resolved":
    case "closed":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200";
    case "cancelled":
    case "deleted":
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
  }
}
