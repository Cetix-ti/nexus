"use client";

import { useState, useRef } from "react";
import {
  X,
  Upload,
  FileArchive,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Database,
  Users,
  Building2,
  Ticket as TicketIcon,
  MessageSquare,
  BookOpen,
  Monitor,
  GitMerge,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface FreshserviceImportModalProps {
  open: boolean;
  onClose: () => void;
}

interface PreviewData {
  fileName: string;
  fileSizeMb: number;
  fileCount: number;
  totalSizeMb: number;
  preview: {
    companies: number;
    agents: number;
    contacts: number;
    groups: number;
    estimatedTickets: number;
    solutionCategories: number;
  };
}

interface ImportResult {
  succeeded: boolean;
  organizations: number;
  contacts: number;
  agents: number;
  queues: number;
  tickets: number;
  ticketComments: number;
  assets: number;
  kbArticles: number;
  warnings: number;
  durationMs: number;
  backupFile?: string;
  errorMessage?: string;
  sampleWarnings?: string[];
}

type Step = "upload" | "preview" | "importing" | "result";

export function FreshserviceImportModal({
  open,
  onClose,
}: FreshserviceImportModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [strategy, setStrategy] = useState<"overwrite" | "merge">("overwrite");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setError(null);
    setResult(null);
    setBusy(false);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleFileChange(f: File | null) {
    setError(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".zip")) {
      setError("Veuillez sélectionner un fichier .zip");
      return;
    }
    setFile(f);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/v1/freshservice/preview", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Erreur d'analyse");
        return;
      }
      setPreview(json.data);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    setStep("importing");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("strategy", strategy);
      const res = await fetch("/api/v1/freshservice/import", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!json.success) {
        setResult({
          succeeded: false,
          errorMessage: json.error || "Échec de l'import",
          organizations: 0,
          contacts: 0,
          agents: 0,
          queues: 0,
          tickets: 0,
          ticketComments: 0,
          assets: 0,
          kbArticles: 0,
          warnings: 0,
          durationMs: 0,
          backupFile: json.backupFile,
        });
      } else {
        setResult({
          succeeded: true,
          organizations: json.data.organizations,
          contacts: json.data.contacts,
          agents: json.data.agents,
          queues: json.data.queues,
          tickets: json.data.tickets,
          ticketComments: json.data.ticketComments,
          assets: json.data.assets,
          kbArticles: json.data.kbArticles,
          warnings: json.data.warnings,
          durationMs: json.data.durationMs,
          backupFile: json.data.backupFile,
          sampleWarnings: json.data.warnings ? undefined : undefined,
        });
      }
    } catch (err) {
      setResult({
        succeeded: false,
        errorMessage: err instanceof Error ? err.message : "Erreur réseau",
        organizations: 0,
        contacts: 0,
        agents: 0,
        queues: 0,
        tickets: 0,
        ticketComments: 0,
        assets: 0,
        kbArticles: 0,
        warnings: 0,
        durationMs: 0,
      });
    } finally {
      setBusy(false);
      setStep("result");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-3xl my-4 rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 ring-1 ring-inset ring-emerald-200/60">
              <Database className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Import depuis Freshservice
              </h2>
              <p className="text-[12.5px] text-slate-500">
                Importez vos données depuis un export Freshservice (.zip)
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={busy}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 px-6 py-3 border-b border-slate-100 bg-slate-50/40">
          <StepDot label="Sélection" active={step === "upload"} done={step !== "upload"} />
          <StepArrow />
          <StepDot label="Aperçu" active={step === "preview"} done={step === "importing" || step === "result"} />
          <StepArrow />
          <StepDot label="Import" active={step === "importing"} done={step === "result"} />
          <StepArrow />
          <StepDot label="Résultat" active={step === "result"} done={false} />
        </div>

        {/* Body */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-[12.5px] text-red-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* STEP 1 — Upload */}
          {step === "upload" && (
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className={cn(
                  "w-full rounded-xl border-2 border-dashed p-12 text-center transition-colors",
                  busy
                    ? "border-blue-300 bg-blue-50/40"
                    : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/30"
                )}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-12 w-12 text-blue-600 mx-auto animate-spin" />
                    <p className="mt-4 text-[14px] font-semibold text-slate-700">
                      Analyse du fichier...
                    </p>
                    <p className="mt-1 text-[12px] text-slate-500">
                      Cela peut prendre quelques secondes
                    </p>
                  </>
                ) : (
                  <>
                    <FileArchive className="h-12 w-12 text-slate-400 mx-auto" />
                    <p className="mt-4 text-[14px] font-semibold text-slate-700">
                      Cliquez pour sélectionner votre export Freshservice
                    </p>
                    <p className="mt-1 text-[12px] text-slate-500">
                      ou glissez-déposez le fichier .zip ici
                    </p>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              />
              <div className="mt-4 rounded-lg bg-amber-50/40 border border-amber-200/60 px-4 py-3 text-[11.5px] text-amber-900">
                <strong>⚠️ Attention :</strong> selon la stratégie choisie,
                cet import pourra remplacer toutes les données actuelles. Une
                sauvegarde automatique sera créée avant l&apos;opération.
              </div>
            </div>
          )}

          {/* STEP 2 — Preview */}
          {step === "preview" && preview && (
            <div className="space-y-5">
              {/* File info */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
                <div className="flex items-center gap-3">
                  <FileArchive className="h-5 w-5 text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-slate-900 truncate">
                      {preview.fileName}
                    </p>
                    <p className="text-[11.5px] text-slate-500 mt-0.5">
                      {preview.fileSizeMb} Mo compressé · {preview.totalSizeMb}{" "}
                      Mo décompressé · {preview.fileCount} fichiers
                    </p>
                  </div>
                </div>
              </div>

              {/* Counts */}
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Données détectées
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <CountCard icon={Building2} label="Organisations" value={preview.preview.companies} color="text-blue-600 bg-blue-50" />
                  <CountCard icon={Users} label="Agents" value={preview.preview.agents} color="text-violet-600 bg-violet-50" />
                  <CountCard icon={Users} label="Contacts" value={preview.preview.contacts} color="text-emerald-600 bg-emerald-50" />
                  <CountCard icon={GitMerge} label="Files d'attente" value={preview.preview.groups} color="text-amber-600 bg-amber-50" />
                  <CountCard icon={TicketIcon} label="Tickets (estim.)" value={`~${preview.preview.estimatedTickets.toLocaleString("fr-CA")}`} color="text-rose-600 bg-rose-50" />
                  <CountCard icon={BookOpen} label="Cat. KB" value={preview.preview.solutionCategories} color="text-cyan-600 bg-cyan-50" />
                </div>
              </div>

              {/* Strategy */}
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Stratégie d&apos;import
                </h3>
                <div className="space-y-2">
                  <StrategyCard
                    selected={strategy === "overwrite"}
                    onClick={() => setStrategy("overwrite")}
                    title="Écraser"
                    description="Remplace toutes les données existantes par celles du fichier. Une sauvegarde est créée automatiquement."
                    accent="danger"
                  />
                  <StrategyCard
                    selected={strategy === "merge"}
                    onClick={() => setStrategy("merge")}
                    title="Fusionner"
                    description="Met à jour les éléments existants (par email/nom) et ajoute les nouveaux. Plus lent mais préserve l'historique."
                    accent="primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 — Importing */}
          {step === "importing" && (
            <div className="py-12 text-center">
              <Loader2 className="h-12 w-12 text-blue-600 mx-auto animate-spin" />
              <p className="mt-4 text-[15px] font-semibold text-slate-700">
                Import en cours...
              </p>
              <p className="mt-1 text-[12.5px] text-slate-500">
                Cela peut prendre plusieurs minutes pour ~14 000 tickets
              </p>
              <p className="mt-3 text-[11px] text-slate-400">
                Veuillez ne pas fermer cette fenêtre
              </p>
            </div>
          )}

          {/* STEP 4 — Result */}
          {step === "result" && result && (
            <div className="space-y-4">
              {result.succeeded ? (
                <>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-[14px] font-semibold text-emerald-900">
                        Import réussi
                      </p>
                      <p className="text-[12px] text-emerald-700">
                        Durée : {(result.durationMs / 1000).toFixed(1)} secondes
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <CountCard icon={Building2} label="Organisations" value={result.organizations} color="text-blue-600 bg-blue-50" />
                    <CountCard icon={Users} label="Agents" value={result.agents} color="text-violet-600 bg-violet-50" />
                    <CountCard icon={Users} label="Contacts" value={result.contacts} color="text-emerald-600 bg-emerald-50" />
                    <CountCard icon={GitMerge} label="Files d'attente" value={result.queues} color="text-amber-600 bg-amber-50" />
                    <CountCard icon={TicketIcon} label="Tickets" value={result.tickets} color="text-rose-600 bg-rose-50" />
                    <CountCard icon={MessageSquare} label="Conversations" value={result.ticketComments} color="text-fuchsia-600 bg-fuchsia-50" />
                    <CountCard icon={Monitor} label="Actifs" value={result.assets} color="text-slate-600 bg-slate-50" />
                    <CountCard icon={BookOpen} label="Articles KB" value={result.kbArticles} color="text-cyan-600 bg-cyan-50" />
                    {result.warnings > 0 && (
                      <CountCard icon={AlertTriangle} label="Avertissements" value={result.warnings} color="text-amber-600 bg-amber-50" />
                    )}
                  </div>

                  {result.backupFile && (
                    <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600 font-mono break-all">
                      Sauvegarde : {result.backupFile}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
                    <AlertTriangle className="h-6 w-6 text-red-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-red-900">
                        Échec de l&apos;import
                      </p>
                      <p className="text-[12px] text-red-700 mt-0.5 break-words">
                        {result.errorMessage}
                      </p>
                      {result.backupFile && (
                        <p className="text-[11px] text-red-600 mt-2">
                          Une sauvegarde a été créée :{" "}
                          <span className="font-mono">{result.backupFile}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              Annuler
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Retour
              </Button>
              <Button
                variant="primary"
                onClick={handleImport}
              >
                <Upload className="h-3.5 w-3.5" strokeWidth={2.5} />
                Lancer l&apos;import
              </Button>
            </>
          )}
          {step === "result" && (
            <Button variant="primary" onClick={handleClose}>
              Fermer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDot({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all",
          active && "bg-blue-600 text-white ring-4 ring-blue-100",
          done && !active && "bg-emerald-100 text-emerald-700",
          !active && !done && "bg-slate-100 text-slate-400"
        )}
      >
        {done ? <CheckCircle2 className="h-3 w-3" /> : "•"}
      </div>
      <span
        className={cn(
          "text-[11.5px] font-medium",
          active ? "text-slate-900" : done ? "text-slate-600" : "text-slate-400"
        )}
      >
        {label}
      </span>
    </div>
  );
}

function StepArrow() {
  return <ArrowRight className="h-3 w-3 text-slate-300 mx-2" />;
}

function CountCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Database;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 flex items-center gap-3">
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", color)}>
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </div>
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <p className="text-[16px] font-semibold tabular-nums text-slate-900">
          {value}
        </p>
      </div>
    </div>
  );
}

function StrategyCard({
  selected,
  onClick,
  title,
  description,
  accent,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
  accent: "primary" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border-2 px-4 py-3 text-left transition-all",
        selected
          ? accent === "danger"
            ? "border-red-300 bg-red-50/40 ring-2 ring-red-100"
            : "border-blue-300 bg-blue-50/40 ring-2 ring-blue-100"
          : "border-slate-200 hover:border-slate-300"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className={cn(
            "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
            selected
              ? accent === "danger"
                ? "border-red-500 bg-red-500"
                : "border-blue-500 bg-blue-500"
              : "border-slate-300"
          )}
        >
          {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>
        <span className="text-[13.5px] font-semibold text-slate-900">
          {title}
        </span>
      </div>
      <p className="text-[11.5px] text-slate-500 ml-6">{description}</p>
    </button>
  );
}
