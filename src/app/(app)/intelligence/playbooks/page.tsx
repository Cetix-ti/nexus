"use client";

// ============================================================================
// /intelligence/playbooks — Runbooks extraits par `playbook-miner` depuis
// les clusters de tickets résolus. Affiche symptômes / diagnostic /
// résolution / commandes / prévention avec lien vers les tickets source.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  BookOpen,
  Terminal,
  Search,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  TicketIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Command {
  platform: string;
  command: string;
  purpose: string;
}

interface SourceTicket {
  id: string;
  number: number;
  subject: string;
}

interface Playbook {
  playbookId: string;
  categoryId: string;
  categoryPath: string;
  title: string;
  symptoms: string[];
  diagnosticSteps: string[];
  resolutionSteps: string[];
  commands: Command[];
  prevention: string[];
  sampleCount: number;
  confidence: number;
  updatedAt: string;
  sourceTickets: SourceTicket[];
}

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/intelligence/playbooks");
        if (!res.ok) {
          setError(res.status === 403 ? "Accès réservé" : "Erreur");
          return;
        }
        const data = (await res.json()) as { playbooks: Playbook[] };
        if (!cancelled) setPlaybooks(data.playbooks ?? []);
      } catch {
        setError("Connexion impossible");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? playbooks.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.categoryPath.toLowerCase().includes(q) ||
          p.symptoms.some((s) => s.toLowerCase().includes(q)),
      )
    : playbooks;

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <BookOpen className="h-6 w-6 text-emerald-500" />
          Playbooks extraits
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Runbooks construits automatiquement à partir des clusters de tickets
          résolus (similitude sémantique ≥ 0.82). Le moteur extrait symptômes,
          diagnostic, résolution et commandes utiles. Les clusters de ≥ 6
          tickets génèrent aussi un brouillon d&apos;article KB.
        </p>
      </header>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher un playbook…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {filtered.length} / {playbooks.length} playbooks
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm italic text-slate-400">
          {query
            ? "Aucun playbook ne correspond à cette recherche."
            : "Aucun playbook extrait pour le moment. Le job tourne quotidiennement."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => {
            const isExpanded = !!expanded[p.playbookId];
            return (
              <li
                key={p.playbookId}
                className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((e) => ({ ...e, [p.playbookId]: !e[p.playbookId] }))
                  }
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {p.title}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{p.categoryPath}</span>
                      <span className="text-slate-300">·</span>
                      <span>{p.sampleCount} tickets source</span>
                      <span className="text-slate-300">·</span>
                      <span>confiance {Math.round(p.confidence * 100)}%</span>
                    </div>
                  </div>
                  <ConfidenceBar confidence={p.confidence} />
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                </button>
                {isExpanded && (
                  <div className="space-y-4 border-t border-slate-100 p-4 text-sm dark:border-slate-800">
                    <PlaybookSection
                      title="Symptômes typiques"
                      items={p.symptoms}
                      ordered={false}
                    />
                    <PlaybookSection
                      title="Diagnostic"
                      items={p.diagnosticSteps}
                      ordered={true}
                      icon={<Search className="h-3 w-3" />}
                    />
                    <PlaybookSection
                      title="Résolution"
                      items={p.resolutionSteps}
                      ordered={true}
                      tone="success"
                    />
                    {p.commands.length > 0 && (
                      <div>
                        <h3 className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
                          <Terminal className="h-3 w-3" /> Commandes utiles
                        </h3>
                        <ul className="space-y-1.5">
                          {p.commands.map((c, i) => (
                            <li key={i}>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="rounded border border-slate-300 px-1 py-px font-mono text-[10px] dark:border-slate-700">
                                  {c.platform}
                                </span>
                                <span className="italic">{c.purpose}</span>
                              </div>
                              <pre className="mt-0.5 overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100 dark:bg-slate-950">
                                {c.command}
                              </pre>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <PlaybookSection
                      title="Prévention"
                      items={p.prevention}
                      ordered={false}
                      icon={<ShieldCheck className="h-3 w-3" />}
                    />
                    {p.sourceTickets.length > 0 && (
                      <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                        <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                          Tickets source
                        </h3>
                        <div className="flex flex-wrap gap-1">
                          {p.sourceTickets.map((t) => (
                            <Link
                              key={t.id}
                              href={`/tickets/${t.id}`}
                              target="_blank"
                              className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              <TicketIcon className="h-2.5 w-2.5" />
                              TK-{t.number}
                              <span className="max-w-[200px] truncate">
                                {t.subject}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PlaybookSection({
  title,
  items,
  ordered,
  icon,
  tone,
}: {
  title: string;
  items: string[];
  ordered: boolean;
  icon?: React.ReactNode;
  tone?: "success";
}) {
  if (items.length === 0) return null;
  const ListTag = ordered ? "ol" : "ul";
  return (
    <div>
      <h3 className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
        {icon}
        {title}
      </h3>
      <ListTag
        className={cn(
          ordered ? "list-decimal" : "list-disc",
          "space-y-0.5 pl-5 text-slate-700 dark:text-slate-200",
          tone === "success" && "font-medium",
        )}
      >
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ListTag>
    </div>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80
      ? "bg-emerald-500"
      : pct >= 60
        ? "bg-amber-500"
        : "bg-slate-400";
  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={cn("h-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
