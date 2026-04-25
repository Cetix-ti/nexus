"use client";

// ============================================================================
// /intelligence/techs — Vue d'ensemble du coaching des techniciens.
// Liste tous les techs actifs avec leur profil d'expertise, leur charge,
// leurs tickets à risque SLA. Lien vers /intelligence/techs/[id] pour
// drill-down.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Users,
  AlertTriangle,
  GraduationCap,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Top3Row {
  categoryId: string;
  categoryPath: string;
  expertise: number;
  resolvedCount: number;
}

interface Tech {
  id: string;
  name: string;
  email: string;
  role: string;
  totalResolved: number;
  openLoad: number;
  categoriesMastered: number;
  totalCategories: number;
  top3: Top3Row[];
  slaRisks: { total: number; critical: number };
  profileUpdatedAt: string | null;
}

export default function TechsPage() {
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/intelligence/techs");
        if (!res.ok) {
          setError(res.status === 403 ? "Accès réservé" : "Erreur");
          return;
        }
        const data = (await res.json()) as { techs: Tech[] };
        if (!cancelled) setTechs(data.techs ?? []);
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
    ? techs.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.email.toLowerCase().includes(q),
      )
    : techs;

  const totalCritical = techs.reduce(
    (acc, t) => acc + t.slaRisks.critical,
    0,
  );
  const avgLoad =
    techs.length > 0
      ? Math.round(techs.reduce((a, t) => a + t.openLoad, 0) / techs.length)
      : 0;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <Users className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-500" />
          Coaching techniciens
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Vue opérationnelle : expertise par catégorie (workload-optimizer),
          charge actuelle, risques SLA assignés. Cliquer un tech pour voir
          ses zones de croissance et son expertise détaillée.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Techs actifs" value={String(techs.length)} />
        <Kpi
          label="Critiques SLA"
          value={String(totalCritical)}
          tone={totalCritical > 0 ? "bad" : "good"}
        />
        <Kpi
          label="Charge moyenne"
          value={`${avgLoad} tickets`}
          tone={avgLoad >= 10 ? "bad" : avgLoad >= 5 ? "warn" : "good"}
        />
      </div>

      <input
        type="text"
        placeholder="Rechercher par nom ou courriel…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-md rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm italic text-slate-400">
          Aucun technicien correspondant.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => (
            <li key={t.id}>
              <Link
                href={`/intelligence/techs/${t.id}`}
                className="flex items-start sm:items-center gap-3 sm:gap-4 rounded-lg border border-slate-200 bg-white p-3 sm:p-4 transition hover:border-indigo-200 hover:bg-indigo-50/30 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30"
              >
                <Avatar name={t.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {t.name}
                    </span>
                    <RoleBadge role={t.role} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="truncate max-w-full">{t.email}</span>
                    <span className="text-slate-300 hidden sm:inline">·</span>
                    <span className="hidden sm:inline">{t.totalResolved} résolutions historiques</span>
                    <span className="text-slate-300 hidden sm:inline">·</span>
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" />
                      {t.categoriesMastered}/{t.totalCategories}
                    </span>
                  </div>
                  {t.top3.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-emerald-500" />
                      {t.top3.map((c) => (
                        <span
                          key={c.categoryId}
                          className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          title={`${c.resolvedCount} tickets résolus · expertise ${Math.round(c.expertise * 100)}%`}
                        >
                          {shortPath(c.categoryPath)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex sm:hidden flex-wrap items-center gap-1.5">
                    <LoadPill load={t.openLoad} />
                    {t.slaRisks.total > 0 && (
                      <span className={cn(
                        "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        t.slaRisks.critical > 0 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700",
                      )}>
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {t.slaRisks.total} SLA
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                  <LoadPill load={t.openLoad} />
                  {t.slaRisks.total > 0 && (
                    <span
                      className={cn(
                        "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        t.slaRisks.critical > 0
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                      )}
                    >
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {t.slaRisks.total} SLA{" "}
                      {t.slaRisks.critical > 0 &&
                        `· ${t.slaRisks.critical} critique${t.slaRisks.critical > 1 ? "s" : ""}`}
                    </span>
                  )}
                </div>
                <ChevronRight className="hidden sm:block h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  const cls =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-rose-600 dark:text-rose-400"
          : "text-slate-900 dark:text-slate-100";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", cls)}>
        {value}
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const hue = hashToHue(name);
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: `hsl(${hue}, 60%, 55%)` }}
    >
      {initials || "?"}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="rounded border border-slate-300 px-1.5 py-px text-[9px] font-medium uppercase text-slate-600 dark:border-slate-700 dark:text-slate-300">
      {role.replace("_", " ").toLowerCase()}
    </span>
  );
}

function LoadPill({ load }: { load: number }) {
  const color =
    load >= 10
      ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
      : load >= 5
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        color,
      )}
      title="Tickets ouverts assignés"
    >
      {load} ouv.
    </span>
  );
}

function shortPath(p: string): string {
  const parts = p.split(" > ");
  if (parts.length <= 2) return p;
  return `…${parts.slice(-2).join(" > ")}`;
}

function hashToHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
