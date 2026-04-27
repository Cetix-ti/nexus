"use client";

import { useEffect, useState } from "react";
import { X, Clock, ExternalLink, CheckCircle2, Send, Loader2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { useTicketsStore } from "@/stores/tickets-store";
import type { Ticket } from "@/lib/mock-data";

interface Props {
  open: boolean;
  onClose: () => void;
  tickets: Ticket[];
}

type ActionState =
  | { type: "idle" }
  | { type: "running"; ticketId: string; action: "override" | "resend" }
  | { type: "success"; ticketId: string; message: string }
  | { type: "error"; ticketId: string; message: string };

/**
 * Liste des tickets en attente d'approbation. Permet à un agent autorisé
 * de :
 *   - Approuver manuellement (override toutes les approbations en PENDING)
 *   - Relancer la demande aux approbateurs (envoie une nouvelle notif)
 *
 * Ces tickets sont exclus des colonnes kanban tant qu'ils n'ont pas été
 * approuvés — c'est ici qu'on décide de leur sort.
 */
export function PendingApprovalsModal({ open, onClose, tickets }: Props) {
  const [action, setAction] = useState<ActionState>({ type: "idle" });
  const reloadTickets = useTicketsStore((s) => s.loadAll);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  async function handleOverride(ticket: Ticket) {
    if (action.type === "running") return;
    const confirmed = window.confirm(
      `Approuver manuellement le ticket ${ticket.number} ?\n\nCela marquera TOUTES les approbations en attente comme approuvées (override). Utilisez cette option si l'approbateur est injoignable ou si l'approbation est déjà donnée verbalement.`,
    );
    if (!confirmed) return;
    setAction({ type: "running", ticketId: ticket.id, action: "override" });
    try {
      const pending = (ticket.approvers ?? []).filter((a) => a);
      // On approuve chaque approval PENDING via le endpoint existant.
      // L'API calcule ensuite le statut global du ticket.
      const approvalsRes = await fetch(`/api/v1/tickets/${ticket.id}/approvals`);
      const approvalsData = await approvalsRes.json();
      const approvals: Array<{ id: string; status: string }> =
        approvalsData?.data ?? [];
      const pendingOnes = approvals.filter((a) => a.status === "PENDING");
      for (const a of pendingOnes) {
        const res = await fetch(`/api/v1/tickets/${ticket.id}/approvals`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvalId: a.id,
            decision: "APPROVED",
            comment: "Approbation manuelle (override) par un agent MSP",
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Erreur ${res.status}`);
        }
      }
      setAction({
        type: "success",
        ticketId: ticket.id,
        message: `Ticket ${ticket.number} approuvé (${pendingOnes.length || pending.length} approbation${pendingOnes.length > 1 ? "s" : ""} marquée${pendingOnes.length > 1 ? "s" : ""})`,
      });
      reloadTickets();
      // Auto-clear success after 3s
      setTimeout(() => {
        setAction((a) => (a.type === "success" && a.ticketId === ticket.id ? { type: "idle" } : a));
      }, 3000);
    } catch (e) {
      setAction({
        type: "error",
        ticketId: ticket.id,
        message: e instanceof Error ? e.message : "Erreur",
      });
    }
  }

  async function handleResend(ticket: Ticket) {
    if (action.type === "running") return;
    setAction({ type: "running", ticketId: ticket.id, action: "resend" });
    try {
      const res = await fetch(
        `/api/v1/tickets/${ticket.id}/approvals/resend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      const data = await res.json();
      setAction({
        type: "success",
        ticketId: ticket.id,
        message: data.message || `Demande d'approbation relancée pour ${ticket.number}`,
      });
      setTimeout(() => {
        setAction((a) => (a.type === "success" && a.ticketId === ticket.id ? { type: "idle" } : a));
      }, 3000);
    } catch (e) {
      setAction({
        type: "error",
        ticketId: ticket.id,
        message: e instanceof Error ? e.message : "Erreur",
      });
    }
  }

  const sorted = [...tickets].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-7xl my-4 rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-200">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold tracking-tight text-slate-900">
                Tickets en attente d&apos;approbation
              </h2>
              <p className="text-[12px] text-slate-500">
                {tickets.length} ticket{tickets.length > 1 ? "s" : ""} — masqué{tickets.length > 1 ? "s" : ""} des colonnes kanban jusqu&apos;à décision
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — refonte en cards avec description visible (anciennement
            tableau 6-colonnes trop serré, qui tronquait les sujets et
            ne montrait pas la description du ticket). */}
        <div className="flex-1 overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <CheckCircle2 className="h-10 w-10 mb-2" strokeWidth={1.5} />
              <p className="text-[13px] font-medium text-slate-500">
                Aucun ticket en attente d&apos;approbation
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sorted.map((t) => (
                <PendingApprovalRow
                  key={t.id}
                  ticket={t}
                  action={action}
                  onResend={handleResend}
                  onOverride={handleOverride}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Card pour un ticket en attente. Layout 2 zones :
 *   - Bandeau du haut : ticket # + sujet en grand + chips priorité/type
 *   - Grille meta + description : 4 colonnes (Demandeur / Client /
 *     Approbateurs / Attente) + bloc description en dessous, repliable
 *   - Zone d'actions à droite (Relancer / Approuver)
 *
 * Plus respirant que l'ancien table-grid. La description du ticket est
 * visible directement (300 premiers caractères) avec un toggle pour voir
 * le texte complet quand il dépasse.
 */
function PendingApprovalRow({
  ticket,
  action,
  onResend,
  onOverride,
}: {
  ticket: Ticket;
  action: ActionState;
  onResend: (t: Ticket) => void;
  onOverride: (t: Ticket) => void;
}) {
  const [showFull, setShowFull] = useState(false);
  const isRunning = action.type === "running" && action.ticketId === ticket.id;
  const isSuccess = action.type === "success" && action.ticketId === ticket.id;
  const isError = action.type === "error" && action.ticketId === ticket.id;

  // Plain-text excerpt à partir de la description riche éventuelle.
  const plain = (ticket.description || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const excerpt = plain.slice(0, 300);
  const hasMore = plain.length > 300;

  return (
    <div className="px-5 py-4 hover:bg-slate-50/40 transition-colors">
      {/* Entête : numéro + sujet pleine largeur + chips */}
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/tickets/${ticket.id}`}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-mono font-semibold text-blue-700 hover:underline"
            >
              {ticket.number}
              <ExternalLink className="h-3 w-3" />
            </Link>
            <span
              className={cn(
                "inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset",
                ticket.priority === "critical"
                  ? "bg-red-50 text-red-700 ring-red-200"
                  : ticket.priority === "high"
                    ? "bg-orange-50 text-orange-700 ring-orange-200"
                    : "bg-slate-100 text-slate-600 ring-slate-200",
              )}
            >
              {ticket.priority}
            </span>
            <span className="text-[11px] text-slate-500">{ticket.type}</span>
            <span className="text-slate-400">·</span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              en attente depuis{" "}
              {formatDistanceToNow(new Date(ticket.createdAt), {
                addSuffix: false,
                locale: fr,
              })}
            </span>
          </div>
          <h3 className="mt-1 text-[14.5px] font-semibold text-slate-900 leading-snug">
            {ticket.subject}
          </h3>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onResend(ticket)}
            disabled={
              isRunning ||
              !ticket.approvers ||
              ticket.approvers.length === 0
            }
            title="Renvoyer la demande d'approbation par courriel"
          >
            {isRunning && action.type === "running" && action.action === "resend" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Relancer
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => onOverride(ticket)}
            disabled={isRunning}
            title="Approuver manuellement (override)"
          >
            {isRunning && action.type === "running" && action.action === "override" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Approuver
          </Button>
        </div>
      </div>

      {/* Méta — 3 colonnes */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
            Demandeur
          </p>
          <p className="text-[12.5px] text-slate-800 truncate">
            {ticket.requesterName}
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            {ticket.requesterEmail}
          </p>
        </div>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
            Client
          </p>
          <p className="text-[12.5px] text-slate-800 truncate">
            {ticket.organizationName}
          </p>
        </div>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
            Approbateurs
          </p>
          {ticket.approvers && ticket.approvers.length > 0 ? (
            <ul className="space-y-0.5">
              {ticket.approvers.map((a) => (
                <li
                  key={a.id}
                  className="text-[12px] text-slate-700 truncate"
                  title={a.email}
                >
                  {a.name}
                  {a.role === "primary" && (
                    <span className="ml-1 text-[10px] text-slate-400">
                      (principal)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11.5px] italic text-slate-400">
              Aucun approbateur défini
            </p>
          )}
        </div>
      </div>

      {/* Description du ticket — bloc dépliable */}
      {plain && (
        <div className="mt-3 rounded-lg bg-slate-50 ring-1 ring-slate-200/60 px-4 py-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Description
          </p>
          <p className="text-[12.5px] text-slate-700 leading-relaxed whitespace-pre-wrap">
            {showFull ? plain : excerpt + (hasMore ? "…" : "")}
          </p>
          {hasMore && (
            <button
              type="button"
              onClick={() => setShowFull((v) => !v)}
              className="mt-1.5 text-[11.5px] font-medium text-blue-700 hover:underline"
            >
              {showFull ? "Replier" : "Voir tout"}
            </button>
          )}
        </div>
      )}

      {isSuccess && (
        <p className="mt-2 text-[11.5px] text-emerald-700">✓ {action.message}</p>
      )}
      {isError && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-red-700">
          <AlertTriangle className="h-3 w-3" />
          {action.message}
        </p>
      )}
    </div>
  );
}
