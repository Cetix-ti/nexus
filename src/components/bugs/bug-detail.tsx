"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, MessageSquare, ExternalLink, GitPullRequest, Play } from "lucide-react";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type BugStatus = "NEW" | "TRIAGED" | "APPROVED_FOR_FIX" | "FIX_IN_PROGRESS" | "FIX_PROPOSED" | "FIXED" | "REJECTED" | "DUPLICATE";
type FixStatus = "ANALYZING" | "PROPOSED" | "MERGED" | "ABANDONED" | "FAILED" | "REJECTED";

interface FixAttempt {
  id: string;
  status: FixStatus;
  agentModel: string;
  branch: string | null;
  prUrl: string | null;
  prNumber: number | null;
  diffSummary: string | null;
  filesChanged: string[];
  confidence: number | null;
  testsRun: boolean;
  testsPass: boolean | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  costUsd: string | number | null;
  abortReason: string | null;
  startedAt: string;
  endedAt: string | null;
}

interface BugDetailData {
  id: string;
  title: string;
  description: string;
  stepsToReproduce: string | null;
  severity: Severity;
  status: BugStatus;
  contextUrl: string | null;
  contextMeta: Record<string, unknown> | null;
  screenshots: string[] | null;
  createdAt: string;
  reporter: { id: string; firstName: string; lastName: string; email: string } | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  approvedBy: { firstName: string; lastName: string } | null;
  rejectedBy: { firstName: string; lastName: string } | null;
  rejectionReason: string | null;
  fixAttempts: FixAttempt[];
  comments: Array<{ id: string; body: string; authorName: string | null; createdAt: string }>;
}

const SEVERITY_LABEL: Record<Severity, string> = { LOW: "Mineur", MEDIUM: "Moyen", HIGH: "Majeur", CRITICAL: "Critique" };
const STATUS_LABEL: Record<BugStatus, string> = {
  NEW: "Nouveau", TRIAGED: "Trié", APPROVED_FOR_FIX: "Approuvé",
  FIX_IN_PROGRESS: "Fix en cours", FIX_PROPOSED: "PR proposée", FIXED: "Fixé",
  REJECTED: "Rejeté", DUPLICATE: "Doublon",
};
const FIX_LABEL: Record<FixStatus, string> = {
  ANALYZING: "Analyse", PROPOSED: "Proposé", MERGED: "Mergé",
  ABANDONED: "Abandonné", FAILED: "Échec", REJECTED: "Rejeté",
};

export function BugDetail({ bugId }: { bugId: string }) {
  const [bug, setBug] = useState<BugDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");

  async function load() {
    const r = await fetch(`/api/v1/bugs/${bugId}`);
    if (r.ok) setBug(await r.json());
    else setError(`HTTP ${r.status}`);
  }

  useEffect(() => { void load(); }, [bugId]);

  async function approve() {
    if (!confirm("Approuver ce bug pour auto-fix nocturne ?\nLe worker Claude le traitera lors de la prochaine fenêtre 22h-6h.")) return;
    setBusy(true);
    const r = await fetch(`/api/v1/bugs/${bugId}/approve`, { method: "POST" });
    setBusy(false);
    if (!r.ok) { setError(`HTTP ${r.status}`); return; }
    await load();
  }

  async function reject() {
    const reason = prompt("Raison du rejet (optionnel) :");
    if (reason === null) return;
    setBusy(true);
    const r = await fetch(`/api/v1/bugs/${bugId}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (!r.ok) { setError(`HTTP ${r.status}`); return; }
    await load();
  }

  async function addComment() {
    if (!comment.trim()) return;
    setBusy(true);
    const r = await fetch(`/api/v1/bugs/${bugId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: comment.trim() }),
    });
    setBusy(false);
    if (!r.ok) { setError(`HTTP ${r.status}`); return; }
    setComment("");
    await load();
  }

  if (error && !bug) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!bug) return <div className="p-6 text-sm text-slate-500">Chargement…</div>;

  const canApprove = ["NEW", "TRIAGED", "REJECTED"].includes(bug.status);
  const canReject = !["FIXED"].includes(bug.status);

  return (
    <div className="space-y-4 sm:space-y-5">
      <Link href="/admin/bugs" className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>

      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className="text-[11px] rounded px-2 py-0.5 bg-slate-100 text-slate-700">{SEVERITY_LABEL[bug.severity]}</span>
              <span className="text-[11px] rounded px-2 py-0.5 bg-violet-50 text-violet-700">{STATUS_LABEL[bug.status]}</span>
            </div>
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 break-words">{bug.title}</h1>
            <div className="text-[12px] text-slate-500 mt-1">
              Signalé par {bug.reporter ? `${bug.reporter.firstName} ${bug.reporter.lastName}` : "—"} le{" "}
              {new Date(bug.createdAt).toLocaleString("fr-CA")}
            </div>
          </div>
        </div>

        {/* Action bar — sticky-friendly, stack mobile */}
        <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3">
          {canApprove && (
            <button
              onClick={approve}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Approuver pour auto-fix
            </button>
          )}
          {canReject && (
            <button
              onClick={reject}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 hover:bg-slate-50 px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Rejeter
            </button>
          )}
        </div>

        <div className="space-y-2 pt-1">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Description</div>
            <p className="text-[13px] text-slate-800 whitespace-pre-wrap break-words">{bug.description}</p>
          </div>
          {bug.stepsToReproduce && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Étapes</div>
              <pre className="text-[12px] text-slate-800 whitespace-pre-wrap font-mono bg-slate-50 rounded p-2 border border-slate-200 break-words">{bug.stepsToReproduce}</pre>
            </div>
          )}
          {bug.contextUrl && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">URL</div>
              <code className="text-[11.5px] text-slate-700 font-mono break-all">{bug.contextUrl}</code>
            </div>
          )}
          {bug.screenshots && bug.screenshots.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Captures</div>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {bug.screenshots.map((s, i) => (
                  <a key={i} href={s} target="_blank" rel="noopener" className="block">
                    <img src={s} alt={`screenshot ${i + 1}`} className="h-20 w-20 object-cover rounded border border-slate-300" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {bug.contextMeta && (
            <details className="text-[12px]">
              <summary className="cursor-pointer text-slate-600 font-medium">Métadonnées navigateur</summary>
              <pre className="mt-1 text-[11px] bg-slate-50 rounded p-2 border border-slate-200 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(bug.contextMeta, null, 2)}</pre>
            </details>
          )}
          {bug.rejectionReason && (
            <div className="rounded bg-red-50 border border-red-100 p-2 text-[12.5px] text-red-800">
              <div className="font-medium">Rejeté — {bug.rejectedBy ? `par ${bug.rejectedBy.firstName} ${bug.rejectedBy.lastName}` : ""}</div>
              <div className="whitespace-pre-wrap">{bug.rejectionReason}</div>
            </div>
          )}
        </div>
      </div>

      {bug.fixAttempts.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 space-y-2">
          <h2 className="text-[14px] font-semibold text-slate-900 inline-flex items-center gap-2">
            <GitPullRequest className="h-4 w-4 text-indigo-600" /> Tentatives de fix ({bug.fixAttempts.length})
          </h2>
          {bug.fixAttempts.map((a) => (
            <div key={a.id} className="rounded border border-slate-200 p-3 text-[13px]">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] rounded px-1.5 py-0.5 bg-indigo-50 text-indigo-700">{FIX_LABEL[a.status]}</span>
                  <span className="text-[11px] text-slate-500 font-mono">{a.agentModel}</span>
                  {a.confidence != null && (
                    <span className="text-[11px] text-slate-500">Confiance : {Math.round(a.confidence * 100)}%</span>
                  )}
                </div>
                {a.prUrl && (
                  <a href={a.prUrl} target="_blank" rel="noopener"
                     className="inline-flex items-center gap-1 text-[12px] text-indigo-700 hover:underline">
                    PR #{a.prNumber} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {a.branch && <div className="text-[11.5px] text-slate-500 font-mono mt-1">branche: {a.branch}</div>}
              {a.diffSummary && (
                <p className="text-[12.5px] text-slate-700 mt-1.5 whitespace-pre-wrap break-words">{a.diffSummary}</p>
              )}
              {a.filesChanged.length > 0 && (
                <div className="mt-1.5 text-[11.5px] text-slate-600">
                  <span className="font-medium">Fichiers :</span> {a.filesChanged.join(", ")}
                </div>
              )}
              {a.abortReason && (
                <div className="mt-1.5 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-100 rounded p-1.5">
                  {a.abortReason}
                </div>
              )}
              <div className="mt-1.5 text-[11px] text-slate-500">
                {new Date(a.startedAt).toLocaleString("fr-CA")}
                {a.endedAt && ` → ${new Date(a.endedAt).toLocaleString("fr-CA")}`}
                {a.costUsd != null && ` · ${Number(a.costUsd).toFixed(2)} USD`}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 space-y-2">
        <h2 className="text-[14px] font-semibold text-slate-900 inline-flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-slate-600" /> Commentaires ({bug.comments.length})
        </h2>
        <div className="space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Ajouter un commentaire…"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-[13px]"
          />
          <div className="flex justify-end">
            <button
              onClick={addComment}
              disabled={busy || !comment.trim()}
              className="text-[13px] rounded bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 disabled:opacity-50"
            >
              Publier
            </button>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {bug.comments.map((c) => (
            <div key={c.id} className="py-2 text-[13px]">
              <div className="text-[11px] text-slate-500 mb-0.5">
                {c.authorName ?? "—"} · {new Date(c.createdAt).toLocaleString("fr-CA")}
              </div>
              <p className="text-slate-800 whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
