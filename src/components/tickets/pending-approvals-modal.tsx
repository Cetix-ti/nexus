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
        className="relative w-full max-w-5xl my-4 rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]"
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <CheckCircle2 className="h-10 w-10 mb-2" strokeWidth={1.5} />
              <p className="text-[13px] font-medium text-slate-500">
                Aucun ticket en attente d&apos;approbation
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur border-b border-slate-200">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Ticket
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Demandeur
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Client
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Approbateurs
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Attente
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((t) => {
                  const isRunning =
                    action.type === "running" && action.ticketId === t.id;
                  const isSuccess =
                    action.type === "success" && action.ticketId === t.id;
                  const isError =
                    action.type === "error" && action.ticketId === t.id;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/tickets/${t.id}`}
                          className="inline-flex items-center gap-1.5 text-[12px] font-mono font-semibold text-blue-700 hover:underline"
                        >
                          {t.number}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        <p className="mt-1 text-[13px] font-medium text-slate-900 line-clamp-2 max-w-md">
                          {t.subject}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                          <span
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 ring-1 ring-inset",
                              t.priority === "critical"
                                ? "bg-red-50 text-red-700 ring-red-200"
                                : t.priority === "high"
                                ? "bg-orange-50 text-orange-700 ring-orange-200"
                                : "bg-slate-100 text-slate-600 ring-slate-200",
                            )}
                          >
                            {t.priority}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500">{t.type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-[12.5px] text-slate-700">
                          {t.requesterName}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
                          {t.requesterEmail}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-[12.5px] text-slate-700 truncate max-w-[180px]">
                          {t.organizationName}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {t.approvers && t.approvers.length > 0 ? (
                          <div className="space-y-0.5">
                            {t.approvers.map((a) => (
                              <p
                                key={a.id}
                                className="text-[11.5px] text-slate-600 truncate max-w-[220px]"
                                title={a.email}
                              >
                                {a.name}
                                {a.role === "primary" && (
                                  <span className="ml-1 text-[10px] text-slate-400">
                                    (principal)
                                  </span>
                                )}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11.5px] italic text-slate-400">
                            Aucun approbateur défini
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-[12px] text-slate-500 tabular-nums whitespace-nowrap">
                        {formatDistanceToNow(new Date(t.createdAt), {
                          addSuffix: false,
                          locale: fr,
                        })}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResend(t)}
                            disabled={
                              isRunning ||
                              !t.approvers ||
                              t.approvers.length === 0
                            }
                            title="Renvoyer la demande d'approbation par courriel"
                          >
                            {isRunning && action.action === "resend" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Relancer
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleOverride(t)}
                            disabled={isRunning}
                            title="Approuver manuellement (override)"
                          >
                            {isRunning && action.action === "override" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            Approuver
                          </Button>
                        </div>
                        {isSuccess && (
                          <p className="mt-1.5 text-[11px] text-emerald-600 text-right">
                            ✓ {action.message}
                          </p>
                        )}
                        {isError && (
                          <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-red-600">
                            <AlertTriangle className="h-3 w-3" />
                            {action.message}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
