"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Upload, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageLoader } from "@/components/ui/page-loader";

type Kind = "gpo" | "gpo-import" | "gpo-instance" | "script" | "script-instance" | "document";

interface Org { id: string; name: string }

function Content() {
  const router = useRouter();
  const params = useSearchParams();
  const [kind, setKind] = useState<Kind>((params.get("kind") as Kind) || "gpo");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState(params.get("orgId") ?? "");
  const [subcategory, setSubcategory] = useState(params.get("subcategory") ?? "PWD_AD");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<"COMPUTER" | "USER" | "MIXED">("COMPUTER");
  const [nameStem, setNameStem] = useState("");
  const [language, setLanguage] = useState<"POWERSHELL" | "BASH" | "PYTHON" | "BATCH" | "OTHER">("POWERSHELL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Import GPO
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [importId, setImportId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/v1/organizations?limit=500").catch(() => null);
      if (r?.ok) {
        const d = await r.json();
        setOrgs(Array.isArray(d) ? d : d?.items ?? []);
      }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSaving(true);
    let res: Response | null = null;
    if (kind === "gpo") {
      if (!nameStem.trim()) { setError("Nom requis."); setSaving(false); return; }
      res = await fetch("/api/v1/policies/gpo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameStem: nameStem.trim(), scope }),
      });
    } else if (kind === "gpo-instance") {
      if (!orgId || !nameStem.trim()) { setError("Organisation et nom requis."); setSaving(false); return; }
      res = await fetch("/api/v1/policies/gpo-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId, nameStem: nameStem.trim(), scope }),
      });
    } else if (kind === "script") {
      if (!title.trim()) { setError("Titre requis."); setSaving(false); return; }
      res = await fetch("/api/v1/policies/scripts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), language }),
      });
    } else if (kind === "script-instance") {
      if (!orgId || !title.trim()) { setError("Organisation et titre requis."); setSaving(false); return; }
      res = await fetch("/api/v1/policies/script-instances", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId, title: title.trim(), language }),
      });
    } else if (kind === "document") {
      if (!orgId || !title.trim()) { setError("Organisation et titre requis."); setSaving(false); return; }
      res = await fetch("/api/v1/policies/documents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId, title: title.trim(), subcategory }),
      });
    }
    setSaving(false);
    if (!res?.ok) {
      const err = await res?.json().catch(() => ({})); setError((err as any)?.error ?? "Erreur"); return;
    }
    const data = await res.json();
    if (kind === "gpo") router.push(`/policies/gpo/${data.id}`);
    else if (kind === "gpo-instance") router.push(`/policies/instances/gpo/${data.id}`);
    else if (kind === "script") router.push(`/policies/scripts/${data.id}`);
    else if (kind === "script-instance") router.push(`/policies/instances/scripts/${data.id}`);
    else router.push(`/policies/documents/${data.id}`);
  }

  async function uploadGpo(file: File) {
    setImporting(true); setError(null);
    const form = new FormData();
    form.append("file", file);
    if (orgId) form.append("organizationId", orgId);
    const r = await fetch("/api/v1/policies/gpo/import", { method: "POST", body: form });
    setImporting(false);
    if (!r.ok) { const err = await r.json().catch(() => ({})); setError((err as any)?.error ?? "Erreur"); return; }
    const d = await r.json();
    setAnalysis(d.analysis);
    setImportId(d.import.id);
  }

  async function acceptImport() {
    if (!importId) return;
    const r = await fetch(`/api/v1/policies/gpo/import/${importId}/accept`, { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      router.push(`/policies/gpo/${d.template.id}`);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <Link href="/policies" className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>
      <h1 className="text-[20px] font-semibold text-slate-900">Nouvelle politique</h1>

      <div className="flex flex-wrap gap-1.5">
        {([
          ["gpo", "Modèle GPO"],
          ["gpo-import", "Importer GPO"],
          ["gpo-instance", "Instance GPO client"],
          ["script", "Modèle Script"],
          ["script-instance", "Script client"],
          ["document", "Fiche de politique"],
        ] as Array<[Kind, string]>).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`rounded-md px-3 py-1.5 text-[12px] font-medium ring-1 ring-inset ${
              kind === k ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200"
            }`}>
            {label}
          </button>
        ))}
      </div>

      <Card>
        <div className="p-5 space-y-4">
          {error && <div className="rounded-md bg-red-50 text-red-700 text-[12.5px] px-3 py-2 ring-1 ring-red-200">{error}</div>}

          {kind === "gpo-import" ? (
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-medium text-slate-700 mb-1 block">Organisation (optionnelle)</label>
                <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
                  <option value="">— Aucune, ajouter au catalogue global —</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={importing} className="gap-1.5">
                  <Upload className="h-4 w-4" /> {importing ? "Analyse IA en cours…" : "Choisir le fichier GPO (XML/backup)"}
                </Button>
                <input ref={fileInput} type="file" accept=".xml,.zip,.cab,text/xml,application/xml" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadGpo(f); e.target.value = ""; }} />
                <p className="mt-1 text-[11.5px] text-slate-500">L'IA analyse le contenu et propose un nom, scope, description, procédure, variables et dépendances.</p>
              </div>

              {analysis && (
                <div className="rounded-md bg-violet-50 border border-violet-200 p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-violet-900">
                    <Sparkles className="h-3.5 w-3.5" /> Analyse IA
                  </div>
                  {analysis.nameSuggested && <div><span className="text-[11.5px] text-slate-500">Nom suggéré :</span> <strong>{analysis.nameSuggested}</strong></div>}
                  {analysis.scopeSuggested && <div><span className="text-[11.5px] text-slate-500">Scope :</span> <strong>{analysis.scopeSuggested}</strong></div>}
                  {analysis.description && <div className="text-[12.5px] text-slate-800">{analysis.description}</div>}
                  {analysis.variables?.length > 0 && (
                    <div>
                      <div className="text-[11.5px] font-semibold text-slate-600 mb-1">Variables détectées ({analysis.variables.length})</div>
                      <ul className="text-[11.5px] text-slate-700 list-disc pl-5 space-y-0.5">
                        {analysis.variables.map((v: any) => <li key={v.key}><code>{v.key}</code> — {v.label} <span className="text-slate-500">(ex : {v.example})</span></li>)}
                      </ul>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => setAnalysis(null)}>Ignorer</Button>
                    <Button size="sm" onClick={acceptImport}>Créer le modèle GPO à partir de cette analyse</Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {(kind === "gpo-instance" || kind === "script-instance" || kind === "document") && (
                <div>
                  <label className="text-[12px] font-medium text-slate-700 mb-1 block">Organisation *</label>
                  <select value={orgId} onChange={(e) => setOrgId(e.target.value)} required className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
                    <option value="">— Choisir —</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}

              {(kind === "gpo" || kind === "gpo-instance") && (
                <>
                  <div>
                    <label className="text-[12px] font-medium text-slate-700 mb-1 block">Nom (sans préfixe) *</label>
                    <Input value={nameStem} onChange={(e) => setNameStem(e.target.value)} placeholder="ex : baseline_endpoint" required />
                    <p className="mt-1 text-[11px] text-slate-500">Préfixe auto : <code>c_</code> (ordinateur), <code>u_</code> (utilisateur), <code>cu_</code> (mixte).</p>
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-slate-700 mb-1 block">Scope *</label>
                    <div className="flex gap-1.5">
                      {(["COMPUTER", "USER", "MIXED"] as const).map((s) => (
                        <button type="button" key={s} onClick={() => setScope(s)} className={`rounded-md px-2.5 py-1 text-[12px] ring-1 ring-inset ${
                          scope === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200"
                        }`}>
                          {s === "COMPUTER" ? "Ordinateur" : s === "USER" ? "Utilisateur" : "Mixte"}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {(kind === "script" || kind === "script-instance") && (
                <>
                  <div>
                    <label className="text-[12px] font-medium text-slate-700 mb-1 block">Titre *</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-slate-700 mb-1 block">Langage *</label>
                    <select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
                      <option value="POWERSHELL">PowerShell</option>
                      <option value="BASH">Bash</option>
                      <option value="PYTHON">Python</option>
                      <option value="BATCH">Batch</option>
                      <option value="OTHER">Autre</option>
                    </select>
                  </div>
                </>
              )}

              {kind === "document" && (
                <>
                  <div>
                    <label className="text-[12px] font-medium text-slate-700 mb-1 block">Sous-catégorie *</label>
                    <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
                      <option value="PWD_AD">Politique mot de passe AD</option>
                      <option value="PWD_ENTRA">Politique mot de passe Entra</option>
                      <option value="PRIVILEGED_ACCESS">Accès privilégiés</option>
                      <option value="M365_ROLES">Rôles M365 / Entra</option>
                      <option value="KEEPASS">Coffre KeePass</option>
                      <option value="BACKUP_REPLICATION">Sauvegardes & réplication</option>
                      <option value="OTHER">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-slate-700 mb-1 block">Titre *</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Link href="/policies"><Button variant="outline" size="sm" type="button">Annuler</Button></Link>
                <Button size="sm" type="submit" disabled={saving}>{saving ? "Création…" : "Créer"}</Button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function NewPolicyPage() {
  return <Suspense fallback={<PageLoader />}><Content /></Suspense>;
}
