"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, Upload, Building2, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import { VisibilityPicker } from "@/components/shared/visibility-picker";
import type { Visibility } from "@/components/shared/visibility-picker";
import { SyncBadge } from "@/components/shared/sync-badge";
import { PageLoader } from "@/components/ui/page-loader";
import { SoftwareProceduresSection } from "@/components/software/software-procedures-section";
import { AiInlinePanel } from "@/components/shared/ai-inline-panel";
import type { AiAction } from "@/components/shared/ai-actions-bar";

interface Template {
  id: string;
  name: string;
  vendor: string | null;
  version: string | null;
  body: string;
  schemaVersion: number;
  visibilityDefault: Visibility;
  category: { id: string; name: string; icon: string; color: string } | null;
  installers: Array<{ id: string; title: string; filename: string; sizeBytes: number; scope: "GLOBAL" | "ORG"; _count: { downloadLinks: number } }>;
  licenses: Array<{ id: string; scope: string; licenseKey: string | null; seats: number | null; endDate: string | null }>;
  instances: Array<{ id: string; name: string; organizationId: string; syncState: "IN_SYNC" | "DRIFTED" | "DETACHED"; templateSchemaVersion: number | null; organization: { id: string; name: string; slug: string } }>;
}

interface Cat { id: string; name: string; icon: string }

export default function SoftwareTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Template | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/software/templates/${params.id}`);
    if (r.ok) setData(await r.json());
    const rc = await fetch(`/api/v1/software/categories`);
    if (rc.ok) setCats(await rc.json());
    setDirty(false);
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  function patch<K extends keyof Template>(k: K, v: Template[K]) {
    setData((x) => (x ? { ...x, [k]: v } : x));
    setDirty(true);
  }

  async function save() {
    if (!data || !dirty) return;
    setSaving(true);
    const res = await fetch(`/api/v1/software/templates/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        vendor: data.vendor,
        version: data.version,
        body: data.body,
        categoryId: data.category?.id ?? null,
        visibilityDefault: data.visibilityDefault,
      }),
    });
    setSaving(false);
    if (res.ok) await load();
  }

  async function archive() {
    if (!data) return;
    if (!confirm(`Archiver le modèle « ${data.name} » ?`)) return;
    const res = await fetch(`/api/v1/software/templates/${data.id}`, { method: "DELETE" });
    if (res.ok) router.push("/software");
  }

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingTitle, setPendingTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  function onFilePicked(file: File) { setPendingFile(file); setPendingTitle(file.name); }
  async function confirmUpload() {
    if (!data || !pendingFile || !pendingTitle.trim()) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", pendingFile);
    form.append("title", pendingTitle.trim());
    const r = await fetch(`/api/v1/software/templates/${data.id}/installers`, { method: "POST", body: form });
    setUploading(false);
    if (r.ok) { setPendingFile(null); setPendingTitle(""); await load(); }
  }

  if (!data) return <PageLoader />;

  const drifted = data.instances.filter((i) => i.syncState === "DRIFTED").length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <Link href="/software" className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={archive}><Trash2 className="h-4 w-4 mr-1.5" /> Archiver</Button>
          <Button size="sm" disabled={!dirty || saving} onClick={save}>
            <Save className="h-4 w-4 mr-1.5" />{saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
            <Package className="h-3.5 w-3.5" /> Catalogue global · v{data.schemaVersion} · {data.instances.length} déploiement(s)
            {drifted > 0 && <span className="ml-1 text-amber-700">· {drifted} désynchronisé(s)</span>}
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Input value={data.name} onChange={(e) => patch("name", e.target.value)} className="text-[20px] font-semibold border-transparent shadow-none px-0 focus-visible:ring-0" />
              <div className="mt-1 grid gap-2 md:grid-cols-2">
                <Input value={data.vendor ?? ""} onChange={(e) => patch("vendor", e.target.value)} placeholder="Éditeur" />
                <Input value={data.version ?? ""} onChange={(e) => patch("version", e.target.value)} placeholder="Version de référence" />
              </div>
            </div>
            <VisibilityPicker value={data.visibilityDefault} onChange={(v) => patch("visibilityDefault", v)} />
          </div>
          <div>
            <label className="text-[11.5px] text-slate-500">Catégorie</label>
            <select
              value={data.category?.id ?? ""}
              onChange={(e) => {
                const c = cats.find((x) => x.id === e.target.value);
                patch("category", c ? { id: c.id, name: c.name, icon: c.icon, color: "#8B5CF6" } : null);
              }}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
            >
              <option value="">—</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="p-4">
              <AiInlinePanel kind="software_template" id={data.id}
                onApply={(cap: AiAction, text: string) => {
                  if (cap === "correct" || cap === "rewrite" || cap === "restructure") patch("body", text);
                }}
              />
            </div>
          </Card>

          <Card>
            <div className="p-5 space-y-3">
              <h3 className="text-[14px] font-semibold text-slate-900">Documentation globale</h3>
              <AdvancedRichEditor value={data.body} onChange={(html) => patch("body", html)} placeholder="Texte enrichi — images, tableaux, code, listes." minHeight="280px" />
            </div>
          </Card>

          <SoftwareProceduresSection softwareTemplateId={data.id} />

          <Card>
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-[14px] font-semibold text-slate-900">Installeurs globaux</h3>
                <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()} className="gap-1.5">
                  <Upload className="h-4 w-4" /> Téléverser
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onFilePicked(f); e.target.value = ""; }}
                />
              </div>
              {pendingFile && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <p className="text-[11.5px] text-slate-600">Fichier : <strong>{pendingFile.name}</strong> ({(pendingFile.size / 1048576).toFixed(1)} Mo)</p>
                  <Input value={pendingTitle} onChange={(e) => setPendingTitle(e.target.value)} placeholder="Titre de l'installeur" />
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => { setPendingFile(null); setPendingTitle(""); }}>Annuler</Button>
                    <Button type="button" size="sm" disabled={!pendingTitle.trim() || uploading} onClick={confirmUpload}>{uploading ? "Téléversement…" : "Téléverser"}</Button>
                  </div>
                </div>
              )}
              {data.installers.length === 0 ? (
                <p className="text-[12.5px] text-slate-500">Aucun installeur global.</p>
              ) : (
                <div className="space-y-2">
                  {data.installers.map((i) => (
                    <div key={i.id} className="rounded-md border border-slate-200 bg-white p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-slate-900 truncate">{i.title}</div>
                        <div className="text-[11.5px] text-slate-500 truncate">{i.filename} · {(i.sizeBytes / 1048576).toFixed(1)} Mo</div>
                      </div>
                      <span className="text-[11px] text-slate-500">{i._count.downloadLinks} lien(s)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        <div>
          <Card>
            <div className="p-4">
              <h3 className="text-[13px] font-semibold text-slate-900 mb-3">Déployé chez ({data.instances.length})</h3>
              {data.instances.length === 0 ? (
                <p className="text-[12.5px] text-slate-500">Pas encore déployé.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.instances.map((i) => (
                    <Link key={i.id} href={`/software/${i.id}`} className="block py-2 hover:bg-slate-50/60 rounded">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-[12.5px] font-medium text-slate-900 truncate">{i.organization.name}</span>
                        </div>
                        <SyncBadge state={i.syncState} />
                      </div>
                      <div className="text-[11px] text-slate-500 pl-5">{i.name} · v{i.templateSchemaVersion ?? "?"}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
