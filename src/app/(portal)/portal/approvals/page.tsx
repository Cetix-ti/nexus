"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, AlertCircle, Loader2, Clock } from "lucide-react";

interface PortalApproval {
  id: string;
  ticketId: string;
  role: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  comment: string | null;
  decidedAt: string | null;
  createdAt: string;
  ticket: {
    id: string;
    number: number;
    displayNumber: string;
    subject: string;
    /** Texte plain (HTML strippé) pour l'aperçu de liste. */
    description: string;
    /** HTML riche complet (sanitizé en amont) — rendu via dangerouslySetInnerHTML quand "Voir tout" est cliqué. */
    descriptionHtml: string | null;
    status: string;
    priority: string;
    type: string;
    organizationName: string;
    requesterName: string;
    createdAt: string;
  };
}

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 ring-red-200",
  URGENT: "bg-red-100 text-red-800 ring-red-200",
  HIGH: "bg-orange-100 text-orange-800 ring-orange-200",
  MEDIUM: "bg-amber-100 text-amber-800 ring-amber-200",
  LOW: "bg-slate-100 text-slate-700 ring-slate-200",
};

export default function PortalApprovalsPage() {
  const [approvals, setApprovals] = useState<PortalApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [acting, setActing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/v1/portal/approvals", { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        setApprovals(d.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(approvalId: string, decision: "APPROVED" | "REJECTED") {
    const comment =
      decision === "REJECTED"
        ? prompt("Raison du refus (optionnel)") ?? undefined
        : undefined;
    setActing(approvalId);
    setFeedback(null);
    try {
      const r = await fetch("/api/v1/portal/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, decision, comment }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setFeedback(`Erreur : ${e.error ?? r.status}`);
      } else {
        setFeedback(decision === "APPROVED" ? "Ticket approuvé." : "Ticket refusé.");
        await load();
      }
    } catch {
      setFeedback("Erreur réseau");
    } finally {
      setActing(null);
      setTimeout(() => setFeedback(null), 5000);
    }
  }

  const visible =
    filter === "PENDING" ? approvals.filter((a) => a.status === "PENDING") : approvals;
  const pendingCount = approvals.filter((a) => a.status === "PENDING").length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-slate-900">
          Approbations
          {pendingCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-md bg-amber-100 text-amber-800 text-[12px] font-bold px-2 py-0.5 ring-1 ring-amber-200">
              {pendingCount} en attente
            </span>
          )}
        </h1>
        <p className="mt-0.5 text-[13px] text-slate-500">
          Tickets soumis par votre équipe en attente de votre décision avant prise en charge.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {(["PENDING", "ALL"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setFilter(v)}
            className={`px-3 py-1.5 text-[12.5px] font-medium rounded-md ring-1 ring-inset transition-colors ${
              filter === v
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {v === "PENDING" ? `En attente (${pendingCount})` : `Toutes (${approvals.length})`}
          </button>
        ))}
      </div>

      {feedback && (
        <div className="rounded-lg bg-blue-50 text-blue-800 ring-1 ring-blue-200 px-4 py-2.5 text-[13px]">
          {feedback}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-[13px] py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
          <p className="text-[14px] font-medium text-slate-700">
            {filter === "PENDING"
              ? "Aucune approbation en attente."
              : "Aucune approbation à afficher."}
          </p>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Vous serez notifié par courriel dès qu'une demande arrive.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[12px] text-slate-500">
                        {a.ticket.displayNumber}
                      </span>
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${
                          PRIORITY_COLOR[a.ticket.priority] ?? PRIORITY_COLOR.MEDIUM
                        }`}
                      >
                        {a.ticket.priority}
                      </span>
                      {a.status === "PENDING" && (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200">
                          <Clock className="h-3 w-3" /> En attente
                        </span>
                      )}
                      {a.status === "APPROVED" && (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Approuvé
                        </span>
                      )}
                      {a.status === "REJECTED" && (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold bg-red-50 text-red-800 ring-1 ring-inset ring-red-200">
                          <XCircle className="h-3 w-3" /> Refusé
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 text-[15px] font-semibold text-slate-900 truncate">
                      {a.ticket.subject}
                    </h3>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      Soumis par {a.ticket.requesterName} ·{" "}
                      {new Date(a.ticket.createdAt).toLocaleDateString("fr-CA", {
                        day: "numeric",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <Link
                    href={`/portal/tickets/${a.ticket.id}`}
                    className="text-[12.5px] text-blue-600 hover:underline shrink-0"
                  >
                    Voir le ticket complet →
                  </Link>
                </div>

                {(a.ticket.description || a.ticket.descriptionHtml) && (
                  <ApprovalDescription
                    plain={a.ticket.description}
                    html={a.ticket.descriptionHtml}
                  />
                )}

                {a.status === "PENDING" ? (
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={acting === a.id}
                      onClick={() => decide(a.id, "APPROVED")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-[12.5px] font-medium disabled:opacity-60"
                    >
                      {acting === a.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Approuver
                    </button>
                    <button
                      type="button"
                      disabled={acting === a.id}
                      onClick={() => decide(a.id, "REJECTED")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white hover:bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 px-3 py-2 text-[12.5px] font-medium disabled:opacity-60"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Refuser
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 text-[12px] text-slate-500">
                    {a.decidedAt && (
                      <>
                        Décision rendue le{" "}
                        {new Date(a.decidedAt).toLocaleDateString("fr-CA", {
                          dateStyle: "long",
                          timeStyle: "short",
                        } as never)}
                      </>
                    )}
                    {a.comment && (
                      <div className="mt-1.5 rounded-md bg-slate-50 ring-1 ring-slate-200/60 px-3 py-2 text-[12.5px] text-slate-700">
                        <AlertCircle className="inline h-3 w-3 mr-1 -mt-0.5" />
                        {a.comment}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Aperçu de la description d'un ticket en attente d'approbation.
 *
 * Mode par défaut : 4 lignes max de texte plain (extrait HTML strippé
 * côté serveur). Suffit pour décider si le ticket est légitime.
 *
 * Mode "Voir tout" : rend le HTML riche complet (mise en forme + images
 * inline base64 + liens) via dangerouslySetInnerHTML — le HTML a déjà
 * été sanitizé par le pipeline d'ingestion email-to-ticket, donc safe.
 */
function ApprovalDescription({
  plain,
  html,
}: {
  plain: string;
  html: string | null;
}) {
  const [showFull, setShowFull] = useState(false);
  const hasMore = !!html && html.length > 0;
  return (
    <div className="mt-3 rounded-lg bg-slate-50 ring-1 ring-slate-200/60 px-4 py-3">
      {showFull && hasMore ? (
        <div
          className="text-[13px] text-slate-800 leading-relaxed [&>p]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded [&_img]:my-2 [&_a]:text-blue-700 [&_a]:underline [&_table]:my-2 [&_table]:text-[12.5px]"
          dangerouslySetInnerHTML={{ __html: html! }}
        />
      ) : (
        <p className="text-[13px] text-slate-700 line-clamp-4 whitespace-pre-wrap">
          {plain}
        </p>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowFull((v) => !v)}
          className="mt-2 text-[12px] font-medium text-blue-700 hover:underline"
        >
          {showFull ? "Replier" : "Voir tout (avec images)"}
        </button>
      )}
    </div>
  );
}
