"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useLocaleStore } from "@/stores/locale-store";
import {
  ArrowLeft,
  Send,
  User,
  Clock,
  Calendar,
  Tag,
  UserCircle,
  AlertCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TicketComment {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

interface TicketDetail {
  id: string;
  number: number;
  displayNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  organizationName: string;
  requesterName: string;
  requesterEmail: string;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  categoryName: string;
  queueName: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  comments: TicketComment[];
  // Approval workflow — exposés par /api/v1/portal/tickets/[id]
  // (lecture du ticket flatten qui inclut maintenant ces 3 champs).
  requiresApproval?: boolean;
  approvalStatus?: string | null;
  approvalLockOverride?: boolean;
  approvers?: {
    id: string;
    name: string;
    email: string;
    status: string;
    /** ISO date — null tant que l'approbateur n'a pas tranché. */
    decidedAt?: string | null;
    /** Commentaire optionnel laissé par l'approbateur lors du refus. */
    comment?: string | null;
    /** ISO date de création de la demande d'approbation. */
    createdAt?: string;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_KEY: Record<string, string> = {
  NEW: "portal.status.new",
  OPEN: "portal.status.open",
  IN_PROGRESS: "portal.status.in_progress",
  ON_SITE: "portal.status.on_site",
  PENDING: "portal.status.pending",
  WAITING_CLIENT: "portal.status.waiting_client",
  WAITING_VENDOR: "portal.status.waiting_vendor",
  SCHEDULED: "portal.status.scheduled",
  RESOLVED: "portal.status.resolved",
  CLOSED: "portal.status.closed",
  CANCELLED: "portal.status.cancelled",
};

const STATUS_VARIANT: Record<string, "default" | "primary" | "success" | "warning" | "danger"> = {
  NEW: "danger",
  OPEN: "primary",
  IN_PROGRESS: "primary",
  ON_SITE: "primary",
  PENDING: "warning",
  WAITING_CLIENT: "warning",
  WAITING_VENDOR: "warning",
  SCHEDULED: "default",
  RESOLVED: "success",
  CLOSED: "default",
  CANCELLED: "default",
};

const PRIORITY_KEY: Record<string, string> = {
  CRITICAL: "portal.priority.critical",
  HIGH: "portal.priority.high",
  MEDIUM: "portal.priority.medium",
  LOW: "portal.priority.low",
};

const PRIORITY_VARIANT: Record<string, "default" | "primary" | "success" | "warning" | "danger"> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "default",
};

const TYPE_KEY: Record<string, string> = {
  INCIDENT: "portal.type.incident",
  SERVICE_REQUEST: "portal.type.service_request",
  PROBLEM: "portal.type.problem",
  CHANGE: "portal.type.change",
  ALERT: "portal.type.alert",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PortalTicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tr = useLocaleStore((s) => s.t);
  const id = params.id as string;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const fetchTicket = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/portal/tickets/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Erreur ${res.status}`);
      }
      const json = await res.json();
      setTicket(json.data);
    } catch (err: any) {
      setError(err.message || tr("portal.ticketDetail.cannotLoad"));
    } finally {
      setLoading(false);
    }
  }, [id, tr]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  async function handleSendReply() {
    if (!reply.trim() || !ticket) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(
        `/api/v1/portal/tickets/${encodeURIComponent(ticket.id)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: reply.trim() }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Erreur ${res.status}`);
      }
      const json = await res.json();
      // Append the new comment to the list
      setTicket((prev) =>
        prev ? { ...prev, comments: [...prev.comments, json.data] } : prev,
      );
      setReply("");
    } catch (err: any) {
      setSendError(err.message || tr("portal.ticketDetail.cannotSendReply"));
    } finally {
      setSending(false);
    }
  }

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        <span className="ml-3 text-sm text-neutral-500">
          {tr("portal.ticketDetail.loading")}
        </span>
      </div>
    );
  }

  // ---- Error state ----
  if (error || !ticket) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {tr("portal.ticketDetail.back")}
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-red-700">
            {error || tr("portal.ticketDetail.notFound")}
          </p>
          <button
            onClick={fetchTicket}
            className="mt-3 text-sm text-red-600 underline hover:text-red-800"
          >
            {tr("portal.ticketDetail.retry")}
          </button>
        </div>
      </div>
    );
  }

  // Overlay statut "En attente d'approbation" : si le ticket exige une
  // approbation et n'a pas été déverrouillé, on remplace le label/variant
  // standard. Le requester voit aussi une bannière dédiée plus bas.
  const isPendingApproval =
    !!ticket.requiresApproval &&
    String(ticket.approvalStatus ?? "").toLowerCase() === "pending" &&
    !ticket.approvalLockOverride;
  const statusLabel = isPendingApproval
    ? "En attente d'approbation"
    : STATUS_KEY[ticket.status]
      ? tr(STATUS_KEY[ticket.status])
      : ticket.status;
  const statusVariant: "default" | "primary" | "warning" | "success" | "danger" =
    isPendingApproval ? "warning" : STATUS_VARIANT[ticket.status] ?? "default";
  const priorityLabel = PRIORITY_KEY[ticket.priority] ? tr(PRIORITY_KEY[ticket.priority]) : ticket.priority;
  const priorityVariant = PRIORITY_VARIANT[ticket.priority] ?? "default";
  const typeLabel = TYPE_KEY[ticket.type] ? tr(TYPE_KEY[ticket.type]) : ticket.type;

  const isClosed = ticket.status === "CLOSED" || ticket.status === "CANCELLED";

  return (
    <div className="space-y-6">
      {/* Lien retour */}
      <Link
        href="/portal/tickets"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {tr("portal.ticketDetail.backToTickets")}
      </Link>

      {/* Bannière d'approbation : 3 cas
          - PENDING : "en attente, sera décidé par X"
          - APPROVED : "approuvé le DATE par X" (visible aussi après pour
            que le demandeur puisse mesurer le délai d'approbation)
          - REJECTED : "refusé le DATE par X" + raison
          On affiche toujours quand l'approbation existe (même décidée),
          pour que le demandeur ait visibilité sur les délais —
          notamment pour comprendre que si le ticket a traîné, c'est dû
          à l'approbateur et non au MSP. */}
      {ticket.requiresApproval && ticket.approvers && ticket.approvers.length > 0 && (() => {
        const decided = ticket.approvers.find((a) => a.status === "approved" || a.status === "rejected");
        const isApproved = decided?.status === "approved";
        const isRejected = decided?.status === "rejected";
        const fmtDate = (iso: string | null | undefined) =>
          iso
            ? new Date(iso).toLocaleString("fr-CA", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" } as never)
            : "—";

        if (isPendingApproval) {
          // En attente — délai écoulé depuis la demande
          const submitted = ticket.approvers[0].createdAt;
          return (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-200 text-amber-900 shrink-0">
                ⏳
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-amber-900">
                  Ce ticket est en attente d&apos;approbation
                </p>
                <p className="mt-0.5 text-[12.5px] text-amber-800 leading-relaxed">
                  Avant que notre équipe puisse intervenir, votre demande doit être
                  approuvée par
                  <strong className="ml-1">
                    {ticket.approvers.map((a) => a.name).join(", ")}
                  </strong>
                  . Vous serez notifié dès qu&apos;une décision sera rendue.
                </p>
                {submitted && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Demande d&apos;approbation envoyée le {fmtDate(submitted)}.
                  </p>
                )}
              </div>
            </div>
          );
        }
        if (isApproved && decided) {
          return (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3.5 flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-200 text-emerald-900 shrink-0">
                ✓
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-emerald-900">
                  Approuvé par {decided.name}
                </p>
                <p className="mt-0.5 text-[12.5px] text-emerald-800 leading-relaxed">
                  {decided.decidedAt
                    ? `Décision rendue le ${fmtDate(decided.decidedAt)}. Notre équipe peut maintenant prendre en charge votre demande.`
                    : "Notre équipe peut maintenant prendre en charge votre demande."}
                </p>
                {decided.comment && (
                  <p className="mt-1.5 rounded-md bg-white/60 px-2.5 py-1.5 text-[12px] text-emerald-900 italic">
                    « {decided.comment} »
                  </p>
                )}
              </div>
            </div>
          );
        }
        if (isRejected && decided) {
          return (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3.5 flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-200 text-red-900 shrink-0">
                ✕
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-red-900">
                  Refusé par {decided.name}
                </p>
                <p className="mt-0.5 text-[12.5px] text-red-800 leading-relaxed">
                  {decided.decidedAt && (
                    <>Décision rendue le {fmtDate(decided.decidedAt)}. </>
                  )}
                  Notre équipe ne traitera pas cette demande dans son état actuel.
                </p>
                {decided.comment && (
                  <p className="mt-1.5 rounded-md bg-white/60 px-2.5 py-1.5 text-[12px] text-red-900 italic">
                    « {decided.comment} »
                  </p>
                )}
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* En-tête du billet */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-mono text-neutral-400">
              {ticket.displayNumber}
            </span>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
            <Badge variant={priorityVariant}>{priorityLabel}</Badge>
          </div>
          <h1 className="mt-2 text-xl font-bold text-neutral-900">
            {ticket.subject}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6">
        {/* Contenu principal */}
        <div className="space-y-6 min-w-0">
          {/* Description */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm p-6 overflow-hidden">
            <h2 className="text-sm font-semibold text-neutral-900 mb-3">
              {tr("portal.ticketDetail.description")}
            </h2>
            {(() => {
              // Préférence : descriptionHtml déjà sanitizé côté serveur
              // (courriels entrants avec fil Outlook complet). Fallback :
              // description en plain text (rendu pre-line).
              const html = (ticket as { descriptionHtml?: string | null }).descriptionHtml;
              if (html) {
                return (
                  <div
                    className="text-sm text-neutral-700 leading-relaxed prose prose-sm prose-neutral max-w-none break-words [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:underline [&_a]:break-all [&_strong]:font-semibold [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:my-2 [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-slate-50"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                );
              }
              if (ticket.description.includes("<")) {
                return (
                  <div
                    className="text-sm text-neutral-600 leading-relaxed prose prose-sm prose-neutral max-w-none break-words [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:underline [&_a]:break-all [&_strong]:font-semibold [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
                    dangerouslySetInnerHTML={{ __html: ticket.description }}
                  />
                );
              }
              return (
                <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-line">
                  {ticket.description}
                </p>
              );
            })()}
          </div>

          {/* Conversation */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="p-5 border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-neutral-900">
                {tr("portal.ticketDetail.conversation")}
                {ticket.comments.length > 0 && (
                  <span className="ml-2 text-neutral-400 font-normal">
                    ({ticket.comments.length})
                  </span>
                )}
              </h2>
            </div>

            {ticket.comments.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-400">
                {tr("portal.ticketDetail.noMessages")}
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {ticket.comments.map((msg) => {
                  const isPortalUser =
                    msg.authorName.toLowerCase() ===
                    ticket.requesterName.toLowerCase();
                  return (
                    <div key={msg.id} className="p-5">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                            isPortalUser
                              ? "bg-neutral-100 text-neutral-500"
                              : "bg-blue-100 text-[#2563EB]",
                          )}
                        >
                          <User className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-neutral-900">
                              {msg.authorName}
                            </span>
                            {!isPortalUser && (
                              <span className="text-[10px] font-medium bg-blue-50 text-[#2563EB] rounded-full px-2 py-0.5">
                                {tr("portal.ticketDetail.support")}
                              </span>
                            )}
                            <span className="text-xs text-neutral-400">
                              {formatDate(msg.createdAt)}
                            </span>
                          </div>
                          {(() => {
                            const html = (msg as { contentHtml?: string | null }).contentHtml;
                            if (html) {
                              return (
                                <div
                                  className="mt-2 text-sm text-neutral-700 leading-relaxed prose prose-sm prose-neutral max-w-none break-words [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:underline [&_a]:break-all [&_strong]:font-semibold [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-slate-50"
                                  dangerouslySetInnerHTML={{ __html: html }}
                                />
                              );
                            }
                            return (
                              <p className="mt-2 text-sm text-neutral-600 leading-relaxed whitespace-pre-line">
                                {msg.content}
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Formulaire de réponse */}
            {!isClosed ? (
              <div className="p-5 border-t border-neutral-100 bg-[#F9FAFB] rounded-b-xl">
                <label className="text-sm font-medium text-neutral-700 block mb-2">
                  {tr("portal.ticketDetail.writeReply")}
                </label>
                <textarea
                  rows={4}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={tr("portal.ticketDetail.replyPlaceholder")}
                  className="w-full rounded-lg border border-neutral-200 bg-white p-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 resize-none"
                  disabled={sending}
                />
                {sendError && (
                  <p className="mt-1 text-xs text-red-600">{sendError}</p>
                )}
                <div className="flex items-center justify-end mt-3">
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !reply.trim()}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors",
                      sending || !reply.trim()
                        ? "bg-blue-300 cursor-not-allowed"
                        : "bg-[#2563EB] hover:bg-blue-700",
                    )}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {sending ? tr("portal.ticketDetail.sending") : tr("portal.ticketDetail.send")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 border-t border-neutral-100 bg-[#F9FAFB] rounded-b-xl text-center">
                <p className="text-sm text-neutral-400">
                  {tr("portal.ticketDetail.closedNotice")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Barre latérale */}
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">{tr("portal.ticketDetail.details")}</h3>

            <div className="space-y-3.5">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    {tr("portal.ticketDetail.status")}
                  </p>
                  <Badge variant={statusVariant} className="mt-0.5">
                    {statusLabel}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    {tr("portal.ticketDetail.priority")}
                  </p>
                  <Badge variant={priorityVariant} className="mt-0.5">
                    {priorityLabel}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    {tr("portal.ticketDetail.type")}
                  </p>
                  <p className="text-sm text-neutral-700 mt-0.5">
                    {typeLabel}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    {tr("portal.ticketDetail.category")}
                  </p>
                  <p className="text-sm text-neutral-700 mt-0.5">
                    {ticket.categoryName}
                  </p>
                </div>
              </div>

              <div className="border-t border-neutral-100 pt-3.5 flex items-center gap-3">
                <UserCircle className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    {tr("portal.ticketDetail.requester")}
                  </p>
                  <p className="text-sm text-neutral-700 mt-0.5">
                    {ticket.requesterName}
                  </p>
                </div>
              </div>

              {ticket.assigneeName && (
                <div className="flex items-center gap-3">
                  <UserCircle className="h-4 w-4 text-neutral-400 shrink-0" />
                  <div>
                    <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                      {tr("portal.ticketDetail.assignedTo")}
                    </p>
                    <p className="text-sm text-neutral-700 mt-0.5">
                      {ticket.assigneeName}
                    </p>
                  </div>
                </div>
              )}

              <div className="border-t border-neutral-100 pt-3.5 flex items-center gap-3">
                <Calendar className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    {tr("portal.ticketDetail.createdAt")}
                  </p>
                  <p className="text-sm text-neutral-700 mt-0.5">
                    {formatDateShort(ticket.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    {tr("portal.ticketDetail.lastUpdate")}
                  </p>
                  <p className="text-sm text-neutral-700 mt-0.5">
                    {formatDateShort(ticket.updatedAt)}
                  </p>
                </div>
              </div>

              {ticket.dueAt && (
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-neutral-400 shrink-0" />
                  <div>
                    <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                      {tr("portal.ticketDetail.dueDate")}
                    </p>
                    <p className="text-sm text-neutral-700 mt-0.5">
                      {formatDateShort(ticket.dueAt)}
                    </p>
                  </div>
                </div>
              )}

              {ticket.resolvedAt && (
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-neutral-400 shrink-0" />
                  <div>
                    <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                      {tr("portal.ticketDetail.resolvedAt")}
                    </p>
                    <p className="text-sm text-neutral-700 mt-0.5">
                      {formatDateShort(ticket.resolvedAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
