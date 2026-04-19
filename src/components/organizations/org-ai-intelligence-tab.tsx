"use client";

// ============================================================================
// OrgAiIntelligenceTab — onglet « Intelligence IA » sur la fiche organisation.
//
// Trois sections pour SUPERVISOR+ :
//   1. Analyse de risque (POST /ai-risk-analysis)
//   2. Rapport exécutif mensuel (POST /ai-monthly-report)
//   3. Suggestions commerciales (POST /ai-sales-suggest)
//
// Chaque section est indépendamment exécutable (coût IA visible — pas de
// "tout lancer d'un coup"). Les résultats persistent le temps de la session.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { OrgAiMemoryPanel } from "./org-ai-memory-panel";
import { OrgAiConsentPanel } from "./org-ai-consent-panel";
import {
  Shield,
  FileText,
  TrendingUp,
  Loader2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clipboard,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RiskFinding {
  domain: "operational" | "security" | "infrastructure" | "compliance";
  title: string;
  evidence: string;
  severity: "low" | "medium" | "high" | "critical";
  signals: string[];
}
interface RiskRecommendation {
  title: string;
  rationale: string;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  addressesFindings: string[];
}
interface RiskAnalysis {
  overallRiskScore: number;
  summary: string;
  findings: RiskFinding[];
  recommendations: RiskRecommendation[];
  generatedAt: string;
  sinceDays: number;
}

interface MonthlyReport {
  periodStart: string;
  periodEnd: string;
  executiveSummary: string;
  keyFacts: string[];
  trends: string[];
  completedActions: string[];
  recommendations: string[];
  discussionPoints: string[];
  markdown: string;
  generatedAt: string;
}

interface SalesOpportunity {
  title: string;
  category: string;
  problemEvidence: string[];
  clientValue: string;
  confidence: "low" | "medium" | "high";
  clientEffort: "low" | "medium" | "high";
  recurring: boolean;
}

const SEVERITY_STYLES: Record<
  RiskFinding["severity"],
  { bg: string; border: string; text: string }
> = {
  critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800" },
  high: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-800",
  },
  medium: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
  },
  low: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-700",
  },
};

const CATEGORY_LABEL: Record<string, string> = {
  security: "Sécurité",
  backup_dr: "Sauvegarde / DR",
  infrastructure_modernization: "Modernisation infra",
  endpoint_management: "Gestion du parc",
  network: "Réseau",
  consulting: "Consulting",
  training: "Formation",
  compliance: "Conformité",
  other: "Autre",
};

export function OrgAiIntelligenceTab({
  organizationId,
  organizationSlug,
}: {
  organizationId: string;
  /** Slug URL de l'organisation — requis pour le bouton "Ouvrir en PDF" du
   *  rapport mensuel qui redirige vers /organisations/[slug]/monthly-report-print. */
  organizationSlug?: string;
}) {
  // ---- Risk analysis ---------------------------------------------------
  const [risk, setRisk] = useState<RiskAnalysis | null>(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [riskGenerating, setRiskGenerating] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

  const loadRisk = useCallback(async () => {
    setRiskLoading(true);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/ai-risk-analysis`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRisk(data.analysis ?? null);
    } catch (err) {
      setRiskError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRiskLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadRisk();
  }, [loadRisk]);

  async function runRiskAnalysis() {
    setRiskGenerating(true);
    setRiskError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/ai-risk-analysis`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRisk(data.analysis);
    } catch (err) {
      setRiskError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRiskGenerating(false);
    }
  }

  // ---- Monthly report --------------------------------------------------
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  async function runMonthlyReport() {
    setReportLoading(true);
    setReportError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/ai-monthly-report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setReport(data.report);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setReportLoading(false);
    }
  }

  // ---- Sales suggestions -----------------------------------------------
  const [sales, setSales] = useState<SalesOpportunity[] | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

  async function runSalesSuggest() {
    setSalesLoading(true);
    setSalesError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/ai-sales-suggest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSales(data.suggestions?.opportunities ?? []);
    } catch (err) {
      setSalesError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSalesLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Consent Loi 25 — première section. Un consent révoqué (aiEnabled=false)
          bloque toutes les autres features IA, donc c'est le point de contrôle
          principal. */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <OrgAiConsentPanel
          organizationId={organizationId}
          organizationSlug={organizationSlug ?? ""}
        />
      </section>

      {/* Faits connus / mémoire IA — affichée en premier pour que l'admin
          voie ce que le système sait de ce client avant d'analyser. */}
      <OrgAiMemoryPanel organizationId={organizationId} />

      {/* ---- Risk analysis ---- */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-slate-700" />
            <h2 className="text-[14px] font-semibold text-slate-900">
              Analyse de risque
            </h2>
            {risk && (
              <span className="text-[11px] text-slate-400">
                Mise à jour{" "}
                {new Date(risk.generatedAt).toLocaleDateString("fr-CA", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}{" "}
                — {risk.sinceDays}j
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runRiskAnalysis}
            disabled={riskGenerating}
          >
            {riskGenerating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 text-violet-500" />
            )}
            {risk ? "Régénérer" : "Analyser"}
          </Button>
        </div>

        {riskLoading && (
          <p className="text-[12px] text-slate-500">Chargement du snapshot…</p>
        )}
        {!riskLoading && !risk && !riskError && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 text-[12.5px] text-slate-500">
            Aucune analyse pour l'instant. L'IA peut synthétiser tickets,
            monitoring, sécurité, sauvegardes et parc pour produire un profil
            de risque avec recommandations priorisées.
          </div>
        )}
        {riskError && (
          <p className="text-[12px] text-red-600">{riskError}</p>
        )}

        {risk && <RiskView risk={risk} />}
      </section>

      {/* ---- Monthly report ---- */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-700" />
            <h2 className="text-[14px] font-semibold text-slate-900">
              Rapport exécutif mensuel
            </h2>
            {report && (
              <span className="text-[11px] text-slate-400">
                {report.periodStart} → {report.periodEnd}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runMonthlyReport}
            disabled={reportLoading}
          >
            {reportLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 text-violet-500" />
            )}
            {report ? "Régénérer (mois précédent)" : "Générer"}
          </Button>
        </div>

        {!report && !reportLoading && !reportError && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 text-[12.5px] text-slate-500">
            Génère un rapport client pour le mois précédent — ton rassurant,
            faits saillants, tendances, actions accomplies, recommandations.
            Markdown complet, prêt à exporter en PDF après révision.
          </div>
        )}
        {reportError && (
          <p className="text-[12px] text-red-600">{reportError}</p>
        )}

        {report && (
          <MonthlyReportView
            report={report}
            onPrint={() => {
              if (!organizationSlug) {
                alert(
                  "Slug de l'organisation manquant — recharge la page puis réessaye.",
                );
                return;
              }
              // Persiste le rapport localement pour que la page print le lise
              const key = `nexus:monthly-report:${organizationSlug}`;
              try {
                window.localStorage.setItem(key, JSON.stringify(report));
                window.open(
                  `/organisations/${organizationSlug}/monthly-report-print`,
                  "_blank",
                );
              } catch (err) {
                alert(
                  "Impossible d'ouvrir la vue imprimable : " +
                    (err instanceof Error ? err.message : String(err)),
                );
              }
            }}
          />
        )}
      </section>

      {/* ---- Sales suggestions ---- */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-700" />
            <h2 className="text-[14px] font-semibold text-slate-900">
              Opportunités commerciales
            </h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runSalesSuggest}
            disabled={salesLoading}
          >
            {salesLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 text-violet-500" />
            )}
            {sales ? "Régénérer" : "Analyser"}
          </Button>
        </div>

        {!sales && !salesLoading && !salesError && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 text-[12.5px] text-slate-500">
            Extrait des opportunités projets/services en analysant les
            patterns d'incidents. Les suggestions sont INTERNES et basées
            sur les données — à valider avant discussion client.
          </div>
        )}
        {salesError && (
          <p className="text-[12px] text-red-600">{salesError}</p>
        )}

        {sales && sales.length === 0 && (
          <p className="text-[12.5px] text-slate-500 italic">
            Aucune opportunité évidente à partir des données actuelles.
          </p>
        )}

        {sales && sales.length > 0 && (
          <div className="space-y-2">
            {sales.map((op, i) => (
              <SalesOpportunityCard key={i} op={op} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk view
// ---------------------------------------------------------------------------
function RiskView({ risk }: { risk: RiskAnalysis }) {
  return (
    <div className="space-y-4">
      {/* Score + résumé */}
      <div
        className={cn(
          "rounded-lg border p-3 flex items-start gap-3",
          risk.overallRiskScore >= 70
            ? "bg-red-50 border-red-200"
            : risk.overallRiskScore >= 40
              ? "bg-amber-50 border-amber-200"
              : "bg-emerald-50 border-emerald-200",
        )}
      >
        <div
          className={cn(
            "rounded-full h-12 w-12 shrink-0 flex items-center justify-center text-[16px] font-bold tabular-nums",
            risk.overallRiskScore >= 70
              ? "bg-red-100 text-red-800"
              : risk.overallRiskScore >= 40
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-800",
          )}
        >
          {risk.overallRiskScore}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Score de risque global
          </p>
          <p className="text-[13px] text-slate-800 mt-0.5">{risk.summary}</p>
        </div>
      </div>

      {/* Findings */}
      {risk.findings.length > 0 && (
        <div>
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
            Constats ({risk.findings.length})
          </h3>
          <div className="space-y-2">
            {risk.findings.map((f, i) => {
              const s = SEVERITY_STYLES[f.severity];
              return (
                <div
                  key={i}
                  className={cn("rounded-md border p-2.5", s.bg, s.border)}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", s.text)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[12.5px] font-semibold", s.text)}>
                        {f.title}
                      </p>
                      <p className="text-[11.5px] text-slate-700 mt-0.5">
                        {f.evidence}
                      </p>
                      <p className="text-[10.5px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-2">
                        <span className="font-medium uppercase tracking-wider">
                          {f.severity}
                        </span>
                        <span>· {f.domain}</span>
                        {f.signals.length > 0 && (
                          <span>· {f.signals.join(" | ")}</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {risk.recommendations.length > 0 && (
        <div>
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
            Recommandations priorisées
          </h3>
          <div className="space-y-1.5">
            {risk.recommendations.map((r, i) => (
              <div
                key={i}
                className="rounded-md border border-blue-200 bg-blue-50/50 p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-slate-900">
                      {r.title}
                    </p>
                    <p className="text-[11.5px] text-slate-700 mt-0.5">
                      {r.rationale}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <Pill label={`Effort ${effortLabel(r.effort)}`} tone="slate" />
                    <Pill
                      label={`Impact ${effortLabel(r.impact)}`}
                      tone={r.impact === "high" ? "emerald" : "slate"}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly report view
// ---------------------------------------------------------------------------
function MonthlyReportView({
  report,
  onPrint,
}: {
  report: MonthlyReport;
  onPrint?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-500">
          Généré le {new Date(report.generatedAt).toLocaleString("fr-CA")}
        </p>
        <div className="flex items-center gap-2">
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex items-center gap-1 text-[11.5px] text-slate-600 hover:text-slate-900"
            >
              <FileText className="h-3 w-3" />
              Télécharger en PDF
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(report.markdown);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                /* ignore */
              }
            }}
            className="inline-flex items-center gap-1 text-[11.5px] text-slate-600 hover:text-slate-900"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-600" />
                Copié
              </>
            ) : (
              <>
                <Clipboard className="h-3 w-3" />
                Copier le Markdown
              </>
            )}
          </button>
        </div>
      </div>

      <ReportSection title="Résumé exécutif" single={report.executiveSummary} />
      <ReportSection title="Faits saillants" items={report.keyFacts} />
      <ReportSection title="Tendances" items={report.trends} />
      <ReportSection title="Actions accomplies" items={report.completedActions} />
      <ReportSection title="Recommandations" items={report.recommendations} />
      {report.discussionPoints.length > 0 && (
        <ReportSection
          title="À discuter en rencontre"
          items={report.discussionPoints}
        />
      )}
    </div>
  );
}

function ReportSection({
  title,
  single,
  items,
}: {
  title: string;
  single?: string;
  items?: string[];
}) {
  if (!single && (!items || items.length === 0)) return null;
  return (
    <section>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {title}
      </h4>
      {single && (
        <p className="text-[12.5px] text-slate-800 leading-snug">{single}</p>
      )}
      {items && items.length > 0 && (
        <ul className="list-disc list-inside space-y-0.5 text-[12.5px] text-slate-800">
          {items.map((i, idx) => (
            <li key={idx}>{i}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sales opportunity card
// ---------------------------------------------------------------------------
function SalesOpportunityCard({ op }: { op: SalesOpportunity }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-[13px] font-semibold text-slate-900">{op.title}</p>
        <Pill label={CATEGORY_LABEL[op.category] ?? op.category} tone="blue" />
      </div>
      <p className="text-[12px] text-slate-700 mb-2">
        <span className="font-medium">Valeur client : </span>
        {op.clientValue}
      </p>
      {op.problemEvidence.length > 0 && (
        <div className="mb-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Observations qui motivent l'opportunité
          </p>
          <ul className="text-[11.5px] text-slate-700 list-disc list-inside space-y-0.5">
            {op.problemEvidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Pill
          label={`Confiance ${confLabel(op.confidence)}`}
          tone={
            op.confidence === "high"
              ? "emerald"
              : op.confidence === "low"
                ? "slate"
                : "amber"
          }
        />
        <Pill
          label={`Effort client ${effortLabel(op.clientEffort)}`}
          tone="slate"
        />
        {op.recurring && (
          <Pill label="Récurrent" tone="violet" icon={<Info className="h-2.5 w-2.5" />} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Pill({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: "slate" | "blue" | "emerald" | "amber" | "red" | "violet";
  icon?: React.ReactNode;
}) {
  const toneClasses: Record<typeof tone, string> = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        toneClasses[tone],
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function effortLabel(e: "low" | "medium" | "high"): string {
  return e === "high" ? "élevé" : e === "low" ? "faible" : "moyen";
}
function confLabel(c: "low" | "medium" | "high"): string {
  return c === "high" ? "haute" : c === "low" ? "faible" : "moyenne";
}
