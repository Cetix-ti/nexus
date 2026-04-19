"use client";

// ============================================================================
// Bulk ops IA — opérations admin ponctuelles.
//
// Utile pour :
//   - Rattraper le triage sur les tickets historiques (déploiement initial)
//   - Forcer une extraction de faits manuelle sur une org
//   - Tester en dry-run avant d'engager un coût IA
//
// Toutes les ops sont SUPERVISOR+ avec dry-run par défaut. Safety first.
// ============================================================================

import { useState } from "react";
import {
  Loader2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface DryRunResult {
  ticketsToProcess: number;
  scanned: number;
  alreadyExcluded: number;
  estimatedCostCents: number;
  target: "never_triaged" | "never_categorized";
}

interface ApplyResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

interface FactsDryRunResult {
  orgsToProcess: number;
  orgs: Array<{ id: string; name: string; tickets: number }>;
  estimatedCostCents: number;
}

interface FactsApplyResult {
  orgsProcessed: number;
  totalFactsProposed: number;
  totalTicketsScanned: number;
  perOrg: Array<{
    orgId: string;
    orgName: string;
    scanned: number;
    proposed: number;
    dedupedExisting: number;
    error?: string;
  }>;
}

export function AiBulkOpsSection() {
  const [sinceDays, setSinceDays] = useState("90");
  const [limit, setLimit] = useState("20");
  const [target, setTarget] = useState<
    "never_triaged" | "never_categorized"
  >("never_categorized");

  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [factsMaxOrgs, setFactsMaxOrgs] = useState("5");
  const [factsSinceDays, setFactsSinceDays] = useState("90");
  const [factsMaxTickets, setFactsMaxTickets] = useState("30");
  const [factsDryRunLoading, setFactsDryRunLoading] = useState(false);
  const [factsDryRun, setFactsDryRun] = useState<FactsDryRunResult | null>(
    null,
  );
  const [factsApplying, setFactsApplying] = useState(false);
  const [factsApplied, setFactsApplied] = useState<FactsApplyResult | null>(
    null,
  );
  const [factsError, setFactsError] = useState<string | null>(null);

  async function runDry() {
    setDryRunLoading(true);
    setError(null);
    setApplied(null);
    try {
      const res = await fetch("/api/v1/ai/bulk-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun: true,
          sinceDays: parseInt(sinceDays, 10),
          limit: parseInt(limit, 10),
          target,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setDryRun({
        ticketsToProcess: data.ticketsToProcess,
        scanned: data.scanned,
        alreadyExcluded: data.alreadyExcluded ?? 0,
        estimatedCostCents: data.estimatedCostCents,
        target: data.target ?? target,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setDryRunLoading(false);
    }
  }

  async function runApply() {
    if (!dryRun || dryRun.ticketsToProcess === 0) return;
    if (
      !confirm(
        `Lancer le triage sur ${dryRun.ticketsToProcess} ticket(s) ? Coût estimé : ${(dryRun.estimatedCostCents / 100).toFixed(2)} $ max (0 $ avec Ollama).`,
      )
    )
      return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/ai/bulk-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun: false,
          sinceDays: parseInt(sinceDays, 10),
          limit: parseInt(limit, 10),
          target,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setApplied({
        processed: data.processed,
        succeeded: data.succeeded,
        failed: data.failed,
        errors: data.errors ?? [],
      });
      setDryRun(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setApplying(false);
    }
  }

  async function runFactsDry() {
    setFactsDryRunLoading(true);
    setFactsError(null);
    setFactsApplied(null);
    try {
      const res = await fetch("/api/v1/ai/bulk-extract-facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun: true,
          maxOrgs: parseInt(factsMaxOrgs, 10),
          sinceDays: parseInt(factsSinceDays, 10),
          maxTicketsPerOrg: parseInt(factsMaxTickets, 10),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFactsDryRun({
        orgsToProcess: data.orgsToProcess,
        orgs: data.orgs ?? [],
        estimatedCostCents: data.estimatedCostCents,
      });
    } catch (err) {
      setFactsError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setFactsDryRunLoading(false);
    }
  }

  async function runFactsApply() {
    if (!factsDryRun || factsDryRun.orgsToProcess === 0) return;
    if (
      !confirm(
        `Lancer l'extraction de faits sur ${factsDryRun.orgsToProcess} organisation(s) ? Coût max estimé : ${(factsDryRun.estimatedCostCents / 100).toFixed(2)} $ (0 $ avec Ollama). L'extraction peut prendre plusieurs minutes.`,
      )
    )
      return;
    setFactsApplying(true);
    setFactsError(null);
    try {
      const res = await fetch("/api/v1/ai/bulk-extract-facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun: false,
          maxOrgs: parseInt(factsMaxOrgs, 10),
          sinceDays: parseInt(factsSinceDays, 10),
          maxTicketsPerOrg: parseInt(factsMaxTickets, 10),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFactsApplied({
        orgsProcessed: data.orgsProcessed,
        totalFactsProposed: data.totalFactsProposed,
        totalTicketsScanned: data.totalTicketsScanned,
        perOrg: data.perOrg ?? [],
      });
      setFactsDryRun(null);
    } catch (err) {
      setFactsError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setFactsApplying(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="text-[13px] font-semibold text-slate-700 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            Rattraper le triage historique
          </h3>
          <p className="text-[11.5px] text-slate-500 mt-0.5">
            Applique le triage IA aux tickets historiques. Mode
            <strong> &ldquo;sans catégorie&rdquo;</strong> : re-triager tous les
            tickets sans catégorie (y compris ceux déjà triagés dont la
            suggestion n&apos;a pas passé l&apos;ancien seuil). Mode
            <strong> &ldquo;jamais triagé&rdquo;</strong> : comportement
            historique, seuls les tickets sans AiInvocation triage. Les
            tickets avec catégorie manuelle sont toujours respectés.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div>
            <label className="text-[10.5px] font-medium text-slate-600">
              Mode
            </label>
            <select
              value={target}
              onChange={(e) =>
                setTarget(
                  e.target.value as "never_triaged" | "never_categorized",
                )
              }
              className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-[12.5px]"
            >
              <option value="never_categorized">Sans catégorie</option>
              <option value="never_triaged">Jamais triagé</option>
            </select>
          </div>
          <div>
            <label className="text-[10.5px] font-medium text-slate-600">
              Depuis (jours)
            </label>
            <Input
              type="number"
              value={sinceDays}
              onChange={(e) => setSinceDays(e.target.value)}
              min="1"
              max="3650"
            />
          </div>
          <div>
            <label className="text-[10.5px] font-medium text-slate-600">
              Max à traiter
            </label>
            <Input
              type="number"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              min="1"
              max="200"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={runDry}
              disabled={dryRunLoading || applying}
              className="w-full"
            >
              {dryRunLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Simuler (dry-run)
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {error}
          </div>
        )}

        {dryRun && (
          <div className="rounded-md border border-blue-200 bg-blue-50/60 p-3 space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  À traiter
                </p>
                <p className="text-[18px] font-bold text-slate-900 tabular-nums">
                  {dryRun.ticketsToProcess}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  {dryRun.target === "never_categorized"
                    ? "Mode"
                    : "Déjà triés"}
                </p>
                <p className="text-[14px] font-bold text-slate-900 tabular-nums">
                  {dryRun.target === "never_categorized"
                    ? "sans cat."
                    : dryRun.alreadyExcluded}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  Coût max estimé
                </p>
                <p className="text-[18px] font-bold text-slate-900 tabular-nums">
                  {(dryRun.estimatedCostCents / 100).toFixed(2)} $
                </p>
              </div>
            </div>
            {dryRun.ticketsToProcess > 0 ? (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-blue-200">
                <p className="text-[11px] text-blue-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Confirme pour lancer le traitement réel.
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={runApply}
                  disabled={applying}
                >
                  {applying ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  Lancer le triage
                </Button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-600 italic">
                Aucun ticket à traiter sur cette période (tous déjà triés).
              </p>
            )}
          </div>
        )}

        {applied && (
          <div
            className={
              applied.failed === 0
                ? "rounded-md border border-emerald-200 bg-emerald-50/60 p-3"
                : "rounded-md border border-amber-200 bg-amber-50/60 p-3"
            }
          >
            <p className="text-[12.5px] font-semibold text-slate-900 flex items-center gap-1.5">
              <CheckCircle2
                className={
                  applied.failed === 0
                    ? "h-3.5 w-3.5 text-emerald-600"
                    : "h-3.5 w-3.5 text-amber-600"
                }
              />
              {applied.succeeded} succès / {applied.processed} traités
              {applied.failed > 0 && ` · ${applied.failed} échecs`}
            </p>
            {applied.errors.length > 0 && (
              <ul className="mt-1 list-disc list-inside text-[10.5px] text-slate-600 space-y-0.5">
                {applied.errors.map((e, i) => (
                  <li key={i} className="truncate">
                    {e}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="text-[13px] font-semibold text-slate-700 flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5 text-indigo-500" />
            Extraire les faits pour tous les clients actifs
          </h3>
          <p className="text-[11.5px] text-slate-500 mt-0.5">
            Lance une passe d'extraction de faits IA (conventions, quirks,
            préférences) sur les organisations les plus actives. Les faits déjà
            connus sont dédupliqués. Utile pour un kickstart mémoire ou avant
            une rencontre mensuelle.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div>
            <label className="text-[10.5px] font-medium text-slate-600">
              Max orgs
            </label>
            <Input
              type="number"
              value={factsMaxOrgs}
              onChange={(e) => setFactsMaxOrgs(e.target.value)}
              min="1"
              max="10"
            />
          </div>
          <div>
            <label className="text-[10.5px] font-medium text-slate-600">
              Depuis (jours)
            </label>
            <Input
              type="number"
              value={factsSinceDays}
              onChange={(e) => setFactsSinceDays(e.target.value)}
              min="30"
              max="365"
            />
          </div>
          <div>
            <label className="text-[10.5px] font-medium text-slate-600">
              Tickets/org
            </label>
            <Input
              type="number"
              value={factsMaxTickets}
              onChange={(e) => setFactsMaxTickets(e.target.value)}
              min="5"
              max="50"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={runFactsDry}
              disabled={factsDryRunLoading || factsApplying}
              className="w-full"
            >
              {factsDryRunLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Simuler
            </Button>
          </div>
        </div>

        {factsError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {factsError}
          </div>
        )}

        {factsDryRun && (
          <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  Orgs à traiter
                </p>
                <p className="text-[18px] font-bold text-slate-900 tabular-nums">
                  {factsDryRun.orgsToProcess}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  Coût max estimé
                </p>
                <p className="text-[18px] font-bold text-slate-900 tabular-nums">
                  {(factsDryRun.estimatedCostCents / 100).toFixed(2)} $
                </p>
              </div>
            </div>
            {factsDryRun.orgs.length > 0 && (
              <ul className="text-[11px] text-slate-700 space-y-0.5 max-h-32 overflow-y-auto border-t border-indigo-200 pt-2">
                {factsDryRun.orgs.map((o) => (
                  <li key={o.id} className="flex justify-between">
                    <span className="truncate">{o.name}</span>
                    <span className="tabular-nums text-slate-500">
                      {o.tickets} tickets
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {factsDryRun.orgsToProcess > 0 ? (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-indigo-200">
                <p className="text-[11px] text-indigo-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Peut prendre plusieurs minutes.
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={runFactsApply}
                  disabled={factsApplying}
                >
                  {factsApplying ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  Lancer l'extraction
                </Button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-600 italic">
                Aucune organisation active à traiter.
              </p>
            )}
          </div>
        )}

        {factsApplied && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
            <p className="text-[12.5px] font-semibold text-slate-900 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              {factsApplied.totalFactsProposed} faits proposés ·{" "}
              {factsApplied.orgsProcessed} orgs ·{" "}
              {factsApplied.totalTicketsScanned} tickets scannés
            </p>
            {factsApplied.perOrg.length > 0 && (
              <ul className="text-[11px] text-slate-700 space-y-0.5 max-h-40 overflow-y-auto border-t border-emerald-200 pt-2">
                {factsApplied.perOrg.map((r) => (
                  <li key={r.orgId} className="flex justify-between gap-2">
                    <span className="truncate">{r.orgName}</span>
                    <span className="tabular-nums text-slate-500 shrink-0">
                      {r.error ? (
                        <span className="text-red-600">{r.error}</span>
                      ) : (
                        `${r.proposed} proposés · ${r.dedupedExisting} dédupés`
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
