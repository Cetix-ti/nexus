"use client";

// ============================================================================
// ImportScriptFromInstanceModal — assistant 2 étapes pour créer un script
// générique à partir d'un script déjà adapté à un client.
//
// Étape 1 (Analyse) : agent colle son script + sélectionne org + langage,
//   → POST /extract-vars retourne le code générique + variables détectées.
// Étape 2 (Validation) : agent revoie/édite les variables et le code,
//   → POST /import-from-instance crée le ScriptTemplate + ScriptInstance.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Loader2, Sparkles, Check, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Org { id: string; name: string }
interface ExtractedVariable {
  name: string;
  description: string;
  type: string;
  resolvedValue: string;
}
interface ExtractResult {
  genericCode: string;
  variables: ExtractedVariable[];
  notes: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (args: { templateId: string; instanceId: string; organizationName: string }) => void;
}

const LANGS: Array<{ value: string; label: string }> = [
  { value: "powershell", label: "PowerShell" },
  { value: "bash", label: "Bash" },
  { value: "python", label: "Python" },
  { value: "batch", label: "Batch (Windows)" },
  { value: "javascript", label: "JavaScript / Node" },
  { value: "other", label: "Autre" },
];

export function ImportScriptFromInstanceModal({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<"input" | "review">("input");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [language, setLanguage] = useState("powershell");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("input");
    setOrgId("");
    setLanguage("powershell");
    setTitle("");
    setCode("");
    setResult(null);
    setError(null);
    fetch("/api/v1/organizations?limit=500")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setOrgs(Array.isArray(d) ? d : d?.items ?? []))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  async function analyze() {
    setError(null);
    if (!code.trim()) { setError("Colle d'abord ton script."); return; }
    if (!orgId) { setError("Sélectionne le client d'origine."); return; }
    if (!title.trim()) { setError("Donne un titre au script générique."); return; }
    setAnalyzing(true);
    try {
      const r = await fetch("/api/v1/policies/scripts/extract-vars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language, organizationId: orgId }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${r.status}`);
        return;
      }
      const d = (await r.json()) as ExtractResult;
      setResult(d);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setAnalyzing(false);
    }
  }

  function updateVar(idx: number, patch: Partial<ExtractedVariable>) {
    setResult((prev) => prev ? {
      ...prev,
      variables: prev.variables.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
    } : prev);
  }
  function removeVar(idx: number) {
    setResult((prev) => prev ? {
      ...prev,
      variables: prev.variables.filter((_, i) => i !== idx),
    } : prev);
  }

  async function create() {
    if (!result) return;
    setError(null);
    setCreating(true);
    try {
      const r = await fetch("/api/v1/policies/scripts/import-from-instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          organizationId: orgId,
          language,
          genericCode: result.genericCode,
          variables: result.variables,
          notes: result.notes,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${r.status}`);
        return;
      }
      const d = await r.json();
      onCreated?.({ templateId: d.templateId, instanceId: d.instanceId, organizationName: d.organizationName });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setCreating(false);
    }
  }

  const orgName = orgs.find((o) => o.id === orgId)?.name;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Importer depuis un script client"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl my-8 rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Importer un script depuis une version client
              </h2>
              <p className="text-[12.5px] text-slate-500 mt-0.5">
                {step === "input"
                  ? "L'IA extrait les variables et produit un template générique"
                  : `Validation — ${result?.variables.length ?? 0} variable(s) détectée(s)`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 text-red-700 text-[12.5px] px-3 py-2 ring-1 ring-red-200">
              {error}
            </div>
          )}

          {step === "input" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[12px] font-medium text-slate-700 mb-1 block">Titre du template *</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Audit AD - groupes vides" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-slate-700 mb-1 block">Langage *</label>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
                    {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-700 mb-1 block">Client d&apos;origine *</label>
                <select value={orgId} onChange={(e) => setOrgId(e.target.value)} required className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
                  <option value="">— Choisir le client dont vient ce script —</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Les valeurs spécifiques à ce client seront sauvegardées comme déploiement initial du template.
                </p>
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-700 mb-1 block">Script adapté au client *</label>
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  rows={14}
                  className="w-full rounded border border-slate-300 bg-slate-50 p-3 text-[12.5px] font-mono leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="# Colle ici le script qui marche déjà chez le client.&#10;# L'IA va identifier les valeurs spécifiques (hostnames, paths, IDs)&#10;# et les transformer en {{variables}}."
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={analyze} disabled={analyzing} className="gap-1.5">
                  {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {analyzing ? "Analyse en cours…" : "Analyser avec l'IA"}
                </Button>
              </div>
            </>
          )}

          {step === "review" && result && (
            <>
              {result.notes && (
                <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-[12px] text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="whitespace-pre-wrap">{result.notes}</span>
                </div>
              )}

              <div>
                <h3 className="text-[13px] font-semibold text-slate-900 mb-2">
                  Variables détectées ({result.variables.length})
                </h3>
                {result.variables.length === 0 ? (
                  <p className="text-[12px] italic text-slate-500">Aucune valeur spécifique au client trouvée. Le code générique = le code source.</p>
                ) : (
                  <div className="space-y-2">
                    {result.variables.map((v, idx) => (
                      <div key={idx} className="rounded-md border border-slate-200 bg-slate-50/40 p-2.5 space-y-1.5">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <div className="sm:col-span-3">
                            <Input
                              value={v.name}
                              onChange={(e) => updateVar(idx, { name: e.target.value })}
                              className="h-8 text-[12px] font-mono"
                              placeholder="nom_variable"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <select
                              value={v.type}
                              onChange={(e) => updateVar(idx, { type: e.target.value })}
                              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]"
                            >
                              {["path","hostname","ip","port","user","domain","id","secret","url","string","number"].map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-3">
                            <Input
                              value={v.resolvedValue}
                              onChange={(e) => updateVar(idx, { resolvedValue: e.target.value })}
                              className={`h-8 text-[12px] font-mono ${v.type === "secret" ? "text-rose-700" : ""}`}
                              placeholder="valeur client"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <Input
                              value={v.description}
                              onChange={(e) => updateVar(idx, { description: e.target.value })}
                              className="h-8 text-[12px]"
                              placeholder="description"
                            />
                          </div>
                          <div className="sm:col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => removeVar(idx)}
                              className="h-8 w-8 inline-flex items-center justify-center text-slate-400 hover:text-rose-600"
                              title="Retirer cette variable"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-[13px] font-semibold text-slate-900 mb-2">Code générique</h3>
                <textarea
                  value={result.genericCode}
                  onChange={(e) => setResult({ ...result, genericCode: e.target.value })}
                  rows={14}
                  className="w-full rounded border border-slate-300 bg-slate-50 p-3 text-[12.5px] font-mono leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Le code source pour <strong>{orgName}</strong> sera reconstruit automatiquement en remplaçant chaque <code>{"{{"}variable{"}}"}</code> par sa valeur.
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => setStep("input")} className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" /> Retour
                </Button>
                <Button onClick={create} disabled={creating} className="gap-1.5">
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {creating ? "Création…" : "Créer template + déploiement client"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
