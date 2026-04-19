"use client";

// ============================================================================
// /intelligence/activity — Flux des changements autonomes faits par le
// moteur d'auto-apprentissage sur les 14 derniers jours.
//
// Transparence : l'admin voit QUI a appris QUOI et QUAND, ainsi que les
// décisions prises (neutralisation d'un pattern, throttle budget, création
// d'un brouillon KB, etc.).
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Activity,
  BookOpen,
  CheckCircle2,
  DollarSign,
  Sparkles,
  ShieldOff,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EventType =
  | "learned_pattern"
  | "prompt_guidance"
  | "pattern_neutralized"
  | "budget_throttle"
  | "playbook_mined"
  | "kb_draft_auto"
  | "audit_applied"
  | "similar_token_penalty";

interface ActivityEvent {
  at: string;
  type: EventType;
  title: string;
  description: string;
  link?: string;
}

const TYPE_META: Record<
  EventType,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    label: string;
  }
> = {
  learned_pattern: {
    icon: Sparkles,
    color: "text-emerald-500",
    label: "Apprentissage",
  },
  prompt_guidance: {
    icon: Sparkles,
    color: "text-indigo-500",
    label: "Guidance prompt",
  },
  pattern_neutralized: {
    icon: XCircle,
    color: "text-rose-500",
    label: "Neutralisation",
  },
  budget_throttle: {
    icon: DollarSign,
    color: "text-amber-500",
    label: "Throttle budget",
  },
  playbook_mined: {
    icon: CheckCircle2,
    color: "text-blue-500",
    label: "Playbook",
  },
  kb_draft_auto: {
    icon: BookOpen,
    color: "text-indigo-500",
    label: "Article KB",
  },
  audit_applied: {
    icon: ShieldOff,
    color: "text-slate-500",
    label: "Audit IA",
  },
  similar_token_penalty: {
    icon: XCircle,
    color: "text-rose-400",
    label: "Token pénalisé",
  },
};

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/intelligence/activity");
        if (!res.ok) {
          setError(res.status === 403 ? "Accès réservé" : "Erreur");
          return;
        }
        const data = (await res.json()) as { events: ActivityEvent[] };
        if (!cancelled) setEvents(data.events ?? []);
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

  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});

  const filtered =
    typeFilter === "all" ? events : events.filter((e) => e.type === typeFilter);

  // Groupe par jour pour lisibilité
  const byDay = new Map<string, ActivityEvent[]>();
  for (const e of filtered) {
    const day = e.at.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  }

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <Activity className="h-6 w-6 text-indigo-500" />
          Journal d&apos;auto-apprentissage
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Chaque changement autonome effectué par le moteur sur les 14
          derniers jours : nouveaux patterns appris, guidance prompt
          régénérée, patterns neutralisés, brouillons KB créés, throttles
          budget appliqués.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        <FilterBtn
          active={typeFilter === "all"}
          onClick={() => setTypeFilter("all")}
          label={`Tous (${events.length})`}
        />
        {Object.entries(TYPE_META).map(([t, meta]) => (
          <FilterBtn
            key={t}
            active={typeFilter === t}
            onClick={() => setTypeFilter(t as EventType)}
            label={`${meta.label} (${counts[t] ?? 0})`}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm italic text-slate-400">
          Aucun événement correspondant.
        </p>
      ) : (
        <div className="space-y-5">
          {Array.from(byDay.entries()).map(([day, dayEvents]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {formatDay(day)}
              </h2>
              <ul className="space-y-1.5">
                {dayEvents.map((e, i) => {
                  const meta = TYPE_META[e.type];
                  const Icon = meta.icon;
                  const content = (
                    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50">
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.color)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {e.title}
                          </span>
                          <span className="ml-auto text-[10px] tabular-nums text-slate-400">
                            {formatTime(e.at)}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">
                          {e.description}
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <li key={`${day}-${i}`}>
                      {e.link ? (
                        <Link href={e.link}>{content}</Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
      )}
    >
      {label}
    </button>
  );
}

function formatDay(yyyy_mm_dd: string): string {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (yyyy_mm_dd === today) return "Aujourd'hui";
  const yesterday = new Date(now.getTime() - 24 * 3600_000)
    .toISOString()
    .slice(0, 10);
  if (yyyy_mm_dd === yesterday) return "Hier";
  return new Date(yyyy_mm_dd).toLocaleDateString("fr-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
