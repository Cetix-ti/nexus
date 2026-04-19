"use client";

// ============================================================================
// Supervision > Coaching IA — rapport de besoins de formation pour l'équipe
// technique. Basé sur l'analyse des patterns agrégés (délais, escalades,
// gaps KB). Volontairement sans tracking individuel des agents.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  GraduationCap,
  Library,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface CoachingTopic {
  topic: string;
  rationale: string;
  signals: string[];
  priority: "low" | "medium" | "high";
  format: "capsule" | "shadowing" | "documentation" | "workshop" | "other";
}
interface Report {
  periodDays: number;
  summary: string;
  topics: CoachingTopic[];
  documentationGaps: string[];
  positiveTrends: string[];
  generatedAt: string;
}

const FORMAT_LABEL: Record<CoachingTopic["format"], string> = {
  capsule: "Capsule (asynchrone)",
  shadowing: "Shadowing",
  documentation: "Documentation",
  workshop: "Atelier",
  other: "Autre",
};

const PRIORITY_STYLES: Record<
  CoachingTopic["priority"],
  { bg: string; text: string; label: string }
> = {
  high: { bg: "bg-red-100", text: "text-red-800", label: "Haute" },
  medium: { bg: "bg-amber-100", text: "text-amber-800", label: "Moyenne" },
  low: { bg: "bg-slate-100", text: "text-slate-700", label: "Faible" },
};

export default function CoachingPage() {
  const [sinceDays, setSinceDays] = useState("60");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/ai/tech-coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceDays: parseInt(sinceDays, 10) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link
            href="/supervision"
            className="inline-flex items-center gap-1 text-[12.5px] text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour
          </Link>
          <span className="text-slate-300">·</span>
          <h1 className="text-[22px] font-semibold text-slate-900">
            Coaching IA
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sinceDays} onValueChange={setSinceDays}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 derniers jours</SelectItem>
              <SelectItem value="60">60 derniers jours</SelectItem>
              <SelectItem value="90">90 derniers jours</SelectItem>
              <SelectItem value="180">180 derniers jours</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="primary" size="sm" onClick={run} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {report ? "Régénérer" : "Générer le rapport"}
          </Button>
        </div>
      </div>

      <p className="text-[13px] text-slate-500 max-w-2xl">
        Ce rapport identifie les besoins de formation de l'équipe en analysant
        les patterns opérationnels (escalades, délais par catégorie, gaps de
        documentation). Il NE fait PAS de tracking individuel des agents —
        l'analyse reste au niveau des thèmes et des catégories.
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {!report && !loading && !error && (
        <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
          <GraduationCap className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <p className="text-[13px] text-slate-500">
            Clique sur « Générer le rapport » pour lancer l'analyse.
          </p>
        </div>
      )}

      {report && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Synthèse · {report.periodDays} derniers jours
            </p>
            <p className="text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap">
              {report.summary}
            </p>
            <p className="mt-2 text-[10.5px] text-slate-400">
              Généré le{" "}
              {new Date(report.generatedAt).toLocaleString("fr-CA", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>

          {/* Topics */}
          {report.topics.length > 0 && (
            <section>
              <h2 className="text-[13px] font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" />
                Sujets de formation prioritaires
              </h2>
              <div className="space-y-2">
                {report.topics.map((t, i) => {
                  const p = PRIORITY_STYLES[t.priority];
                  return (
                    <div
                      key={i}
                      className="rounded-md border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-[13px] font-semibold text-slate-900">
                          {t.topic}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              p.bg,
                              p.text,
                            )}
                          >
                            {p.label}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-medium">
                            {FORMAT_LABEL[t.format]}
                          </span>
                        </div>
                      </div>
                      <p className="text-[12px] text-slate-700 mb-1.5">
                        {t.rationale}
                      </p>
                      {t.signals.length > 0 && (
                        <ul className="list-disc list-inside text-[11.5px] text-slate-500 space-y-0.5">
                          {t.signals.map((s, j) => (
                            <li key={j}>{s}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Doc gaps */}
          {report.documentationGaps.length > 0 && (
            <section>
              <h2 className="text-[13px] font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <Library className="h-3.5 w-3.5" />
                Lacunes de documentation
              </h2>
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11.5px] text-amber-900 mb-1.5">
                      Ces catégories génèrent beaucoup de tickets mais ont moins
                      de 2 articles KB associés — candidats à documenter.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {report.documentationGaps.map((g) => (
                        <span
                          key={g}
                          className="inline-flex items-center rounded-md bg-white px-2 py-0.5 ring-1 ring-amber-200 text-[11px] text-amber-900"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Positive trends */}
          {report.positiveTrends.length > 0 && (
            <section>
              <h2 className="text-[13px] font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                Tendances positives
              </h2>
              <ul className="list-disc list-inside text-[12.5px] text-slate-800 space-y-1">
                {report.positiveTrends.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
