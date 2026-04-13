"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  OPEN: "Ouvert",
  IN_PROGRESS: "En cours",
  ON_SITE: "Sur site",
  PENDING: "En attente",
  WAITING_CLIENT: "Attente client",
  WAITING_VENDOR: "Attente fournisseur",
  SCHEDULED: "Planifié",
  RESOLVED: "Résolu",
  CLOSED: "Fermé",
  CANCELLED: "Annulé",
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

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: "Critique",
  HIGH: "Haute",
  MEDIUM: "Moyenne",
  LOW: "Basse",
};

const PRIORITY_VARIANT: Record<string, "default" | "primary" | "success" | "warning" | "danger"> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "default",
};

const TYPE_LABELS: Record<string, string> = {
  INCIDENT: "Incident",
  SERVICE_REQUEST: "Demande de service",
  PROBLEM: "Problème",
  CHANGE: "Changement",
  ALERT: "Alerte",
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
      setError(err.message || "Impossible de charger le billet");
    } finally {
      setLoading(false);
    }
  }, [id]);

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
      setSendError(err.message || "Impossible d'envoyer la réponse");
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
          Chargement du billet...
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
          Retour
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-red-700">
            {error || "Billet introuvable"}
          </p>
          <button
            onClick={fetchTicket}
            className="mt-3 text-sm text-red-600 underline hover:text-red-800"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[ticket.status] ?? ticket.status;
  const statusVariant = STATUS_VARIANT[ticket.status] ?? "default";
  const priorityLabel = PRIORITY_LABELS[ticket.priority] ?? ticket.priority;
  const priorityVariant = PRIORITY_VARIANT[ticket.priority] ?? "default";
  const typeLabel = TYPE_LABELS[ticket.type] ?? ticket.type;

  const isClosed = ticket.status === "CLOSED" || ticket.status === "CANCELLED";

  return (
    <div className="space-y-6">
      {/* Lien retour */}
      <Link
        href="/portal/tickets"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux billets
      </Link>

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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Contenu principal */}
        <div className="space-y-6">
          {/* Description */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm p-6">
            <h2 className="text-sm font-semibold text-neutral-900 mb-3">
              Description
            </h2>
            {ticket.description.includes("<") ? (
              <div
                className="text-sm text-neutral-600 leading-relaxed prose prose-sm prose-neutral max-w-none [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:underline [&_strong]:font-semibold [&_img]:max-w-full [&_img]:rounded-lg"
                dangerouslySetInnerHTML={{ __html: ticket.description }}
              />
            ) : (
              <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-line">
                {ticket.description}
              </p>
            )}
          </div>

          {/* Conversation */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="p-5 border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-neutral-900">
                Conversation
                {ticket.comments.length > 0 && (
                  <span className="ml-2 text-neutral-400 font-normal">
                    ({ticket.comments.length})
                  </span>
                )}
              </h2>
            </div>

            {ticket.comments.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-400">
                Aucun message pour le moment.
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
                                Support
                              </span>
                            )}
                            <span className="text-xs text-neutral-400">
                              {formatDate(msg.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-neutral-600 leading-relaxed whitespace-pre-line">
                            {msg.content}
                          </p>
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
                  Écrire une réponse
                </label>
                <textarea
                  rows={4}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Écrivez votre message ici..."
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
                    {sending ? "Envoi..." : "Envoyer"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 border-t border-neutral-100 bg-[#F9FAFB] rounded-b-xl text-center">
                <p className="text-sm text-neutral-400">
                  Ce billet est fermé. Vous ne pouvez plus y répondre.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Barre latérale */}
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">Détails</h3>

            <div className="space-y-3.5">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    Statut
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
                    Priorité
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
                    Type
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
                    Catégorie
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
                    Demandeur
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
                      Assigné à
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
                    Créé le
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
                    Dernière mise à jour
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
                      Échéance
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
                      Résolu le
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
