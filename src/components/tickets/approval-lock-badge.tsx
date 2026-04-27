"use client";

import { Lock, Unlock, CheckCircle2, XCircle, Clock } from "lucide-react";

/**
 * Badge d'état d'approbation pour un ticket.
 *
 * Affiché partout où on liste/affiche des tickets — kanban, liste, fiche
 * détail, portail. Quatre états possibles :
 *   - "pending" + locked  → 🔒 En attente d'approbation (verrouillé)
 *   - "pending" + unlocked → ⏳ En attente d'approbation (déverrouillé)
 *   - "approved"           → ✓ Approuvé
 *   - "rejected"           → ✗ Refusé
 *
 * Si requiresApproval est false, le composant ne rend rien.
 */
export function ApprovalLockBadge({
  requiresApproval,
  approvalStatus,
  approvalLockOverride,
  size = "sm",
}: {
  requiresApproval?: boolean;
  approvalStatus?: "not_required" | "pending" | "approved" | "rejected" | string;
  approvalLockOverride?: boolean;
  size?: "xs" | "sm";
}) {
  if (!requiresApproval) return null;
  const status = (approvalStatus ?? "").toLowerCase();
  if (status === "not_required") return null;

  const px = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  const iconCls = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";

  if (status === "approved") {
    return (
      <span className={`inline-flex items-center gap-1 rounded ${px} font-semibold bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200`}>
        <CheckCircle2 className={iconCls} />
        Approuvé
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className={`inline-flex items-center gap-1 rounded ${px} font-semibold bg-red-50 text-red-800 ring-1 ring-inset ring-red-200`}>
        <XCircle className={iconCls} />
        Refusé
      </span>
    );
  }
  // status === "pending"
  if (approvalLockOverride) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded ${px} font-semibold bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200`}
        title="En attente d'approbation — verrou levé manuellement, le ticket peut être modifié"
      >
        <Unlock className={iconCls} />
        En attente (déverrouillé)
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded ${px} font-semibold bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300`}
      title="Ticket verrouillé en attente de la décision d'un approbateur"
    >
      <Lock className={iconCls} />
      <Clock className={iconCls} />
      En attente d&apos;approbation
    </span>
  );
}
