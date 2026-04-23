"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Send, Trash2, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import { VisibilityPicker } from "@/components/shared/visibility-picker";
import type { Visibility } from "@/components/shared/visibility-picker";
import { SyncBadge } from "@/components/shared/sync-badge";
import { PageLoader } from "@/components/ui/page-loader";

interface Template {
  id: string;
  title: string;
  summary: string | null;
  body: string;
  tags: string[];
  categoryId: string | null;
  visibilityDefault: Visibility;
  version: number;
  updatedAt: string;
  category: { id: string; name: string; icon: string; color: string } | null;
  instances: Array<{
    id: string;
    title: string;
    syncState: "IN_SYNC" | "DRIFTED" | "DETACHED";
    templateVersion: number | null;
    organization: { id: string; name: string; slug: string };
  }>;
}

interface Organization { id: string; name: string }
interface Category { id: string; name: string; icon: string; color: string }

export default function TemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [t, setT] = useState<Template | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());
  const [autoCategorize, setAutoCategorize] = useState(true);

  const load = useCallback(async () => {
    const [r1, r2, r3] = await Promise.all([
      fetch(`/api/v1/particularity-templates/${params.id}`),
      fetch(`/api/v1/particularity-categories`),
      fetch(`/api/v1/organizations?limit=500`),
    ]);
    if (r1.ok) setT(await r1.json());
    if (r2.ok) setCats(await r2.json());
    if (r3.ok) {
      const data = await r3.json();
      setOrgs(Array.isArray(data) ? data : data?.items ?? []);
    }
    setDirty(false);
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  function patch<K extends keyof Template>(key: K, value: Template[K]) {
    setT((x) => (x ? { ...x, [key]: value } : x));
    setDirty(true);
  }

  async function save() {
    if (!t || !dirty) return;
    setSaving(true);
    const res = await fetch(`/api/v1/particularity-templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: t.title,
        summary: t.summary,
        body: t.body,
        tags: t.tags,
        categoryId: t.categoryId,
        visibilityDefault: t.visibilityDefault,
      }),
    });
    setSaving(false);
    if (res.ok) await load();
  }

  async function archive() {
    if (!t) return;
    if (!confirm(`Archiver le modèle « ${t.title} » ?`)) return;
    const res = await fetch(`/api/v1/particularity-templates/${t.id}`, { method: "DELETE" });
    if (res.ok) router.push("/particularities/templates");
  }

  async function apply() {
    if (!t || selectedOrgs.size === 0) return;
    setApplying(true);
    const res = await fetch(`/api/v1/particularities/bulk-apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: t.id,
        toOrgIds: Array.from(selectedOrgs),
        variables: {},
        autoCategorize,
      }),
    });
    setApplying(false);
    if (res.ok) {
      const r = await res.json();
      alert(`${r.count} particularité(s) créée(s).`);
      setApplyOpen(false);
      setSelectedOrgs(new Set());
      await load();
    }
  }

  if (!t) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <Link href="/particularities/templates" className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
          <ArrowLeft className="h-4 w-4" /> Modèles
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setApplyOpen((v) => !v)} className="gap-1.5">
            <Send className="h-4 w-4" /> Appliquer à…
          </Button>
          <Button variant="outline" size="sm" onClick={archive}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Archiver
          </Button>
          <Button size="sm" disabled={!dirty || saving} onClick={save}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="text-[12.5px] text-slate-500">Modèle global · v{t.version} · {t.instances.length} instance(s)</div>
              <Input
                value={t.title}
                onChange={(e) => patch("title", e.target.value)}
                className="mt-1 text-[20px] font-semibold border-transparent shadow-none px-0 focus-visible:ring-0"
              />
            </div>
            <VisibilityPicker value={t.visibilityDefault} onChange={(v) => patch("visibilityDefault", v)} />
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Résumé</label>
            <Textarea value={t.summary ?? ""} onChange={(e) => patch("summary", e.target.value)} rows={2} />
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Contenu</label>
            <AdvancedRichEditor
              value={t.body}
              onChange={(html) => patch("body", html)}
              placeholder="Texte enrichi. Utilisez {{variable}} pour les valeurs à adapter par client."
              minHeight="320px"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Catégorie par défaut</label>
              <select
                value={t.categoryId ?? ""}
                onChange={(e) => patch("categoryId", e.target.value || null)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
              >
                <option value="">Sans catégorie</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Tags par défaut</label>
              <Input
                value={t.tags.join(", ")}
                onChange={(e) => patch("tags", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))}
              />
            </div>
          </div>
        </div>
      </Card>

      {applyOpen && (
        <Card>
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">Appliquer à des clients</h3>
              <button onClick={() => setApplyOpen(false)} className="text-slate-500 text-[12.5px]">Fermer</button>
            </div>
            <p className="text-[12.5px] text-slate-600">
              Une particularité sera créée chez chaque client sélectionné, liée à ce modèle.
              {autoCategorize && " L'IA proposera une catégorie spécifique par client."}
            </p>
            <label className="inline-flex items-center gap-2 text-[12.5px] text-slate-700">
              <input type="checkbox" checked={autoCategorize} onChange={(e) => setAutoCategorize(e.target.checked)} />
              Catégoriser automatiquement chaque instance (IA)
            </label>
            <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 divide-y divide-slate-100">
              {orgs.map((o) => {
                const checked = selectedOrgs.has(o.id);
                return (
                  <label key={o.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-[12.5px]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedOrgs((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(o.id); else n.delete(o.id);
                          return n;
                        });
                      }}
                    />
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    {o.name}
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setApplyOpen(false)}>Annuler</Button>
              <Button size="sm" disabled={selectedOrgs.size === 0 || applying} onClick={apply}>
                {applying ? "Application…" : `Appliquer à ${selectedOrgs.size} client(s)`}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-4">
          <h3 className="text-[13px] font-semibold text-slate-900 mb-3">Instances liées ({t.instances.length})</h3>
          {t.instances.length === 0 ? (
            <p className="text-[12.5px] text-slate-500">Ce modèle n'est encore appliqué à aucun client.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {t.instances.map((i) => (
                <Link key={i.id} href={`/particularities/${i.id}`} className="block px-2 py-2 hover:bg-slate-50/60 rounded">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="text-[12.5px] font-medium text-slate-900">{i.organization.name}</span>
                      <span className="text-[12px] text-slate-500 truncate">· {i.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-400">v{i.templateVersion ?? "?"}</span>
                      <SyncBadge state={i.syncState} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
