"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, CheckCircle, AlertCircle, Info, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import { VisibilityPicker } from "@/components/shared/visibility-picker";
import type { Visibility } from "@/components/shared/visibility-picker";
import { SyncBadge } from "@/components/shared/sync-badge";
import { AiActionsBar, type AiAction } from "@/components/shared/ai-actions-bar";
import { VersionTimeline, type VersionEntry } from "@/components/shared/version-timeline";
import { RelationsPanel } from "@/components/shared/relations-panel";
import { PageLoader } from "@/components/ui/page-loader";

interface Detail {
  id: string;
  title: string;
  summary: string | null;
  body: string;
  categoryId: string | null;
  tags: string[];
  visibility: Visibility;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  syncState: "IN_SYNC" | "DRIFTED" | "DETACHED";
  version: number;
  updatedAt: string;
  aiCategorySuggested: boolean;
  organization: { id: string; name: string; slug: string };
  category: { id: string; name: string; icon: string; color: string } | null;
  author: { firstName: string; lastName: string } | null;
  updatedBy: { firstName: string; lastName: string } | null;
  template: { id: string; title: string; version: number } | null;
  versions: Array<{
    id: string;
    version: number;
    createdAt: string;
    changeNote: string | null;
    author: { firstName: string; lastName: string } | null;
  }>;
}

interface Category { id: string; name: string; icon: string; color: string }

export default function ParticularityDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiResult, setAiResult] = useState<{ capability: AiAction; text?: string; data?: unknown; error?: string } | null>(null);

  const load = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      fetch(`/api/v1/particularities/${params.id}`),
      fetch(`/api/v1/particularity-categories`),
    ]);
    if (r1.ok) setData(await r1.json());
    if (r2.ok) setCats(await r2.json());
    setDirty(false);
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  function patch<K extends keyof Detail>(key: K, value: Detail[K]) {
    setData((d) => (d ? { ...d, [key]: value } : d));
    setDirty(true);
  }

  async function save() {
    if (!data || !dirty) return;
    setSaving(true);
    const res = await fetch(`/api/v1/particularities/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        summary: data.summary,
        body: data.body,
        categoryId: data.categoryId,
        tags: data.tags,
        visibility: data.visibility,
        status: data.status,
      }),
    });
    setSaving(false);
    if (res.ok) { await load(); }
  }

  async function remove() {
    if (!data) return;
    if (!confirm(`Supprimer la particularité « ${data.title} » ?`)) return;
    const res = await fetch(`/api/v1/particularities/${data.id}`, { method: "DELETE" });
    if (res.ok) router.push("/particularities");
  }

  async function markReviewed() {
    if (!data) return;
    const res = await fetch(`/api/v1/particularities/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastReviewed: true }),
    });
    if (res.ok) await load();
  }

  async function runAi(action: AiAction) {
    if (!data) return;
    setAiResult({ capability: action });
    const res = await fetch(`/api/v1/particularities/${data.id}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capability: action }),
    });
    const json = await res.json();
    if (!json.ok) {
      setAiResult({ capability: action, error: json.error ?? "IA indisponible" });
      return;
    }
    setAiResult({ capability: action, text: json.text, data: json.data });
  }

  function applyAiSuggestion() {
    if (!data || !aiResult) return;
    if (aiResult.capability === "correct" || aiResult.capability === "rewrite" || aiResult.capability === "restructure") {
      if (aiResult.text) patch("body", aiResult.text);
    } else if (aiResult.capability === "summarize") {
      if (aiResult.text) patch("summary", aiResult.text);
    } else if (aiResult.capability === "suggest_tags") {
      const tags = (aiResult.data as { tags?: string[] })?.tags;
      if (Array.isArray(tags)) patch("tags", tags);
    } else if (aiResult.capability === "suggest_category") {
      const name = (aiResult.data as { categoryName?: string })?.categoryName;
      const match = cats.find((c) => c.name === name);
      if (match) patch("categoryId", match.id);
    }
    setAiResult(null);
  }

  async function restoreVersion(versionId: string) {
    if (!data) return;
    if (!confirm("Restaurer cette version ? Le contenu courant sera écrasé (un snapshot sera conservé).")) return;
    const res = await fetch(`/api/v1/particularities/${data.id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    if (res.ok) await load();
  }

  if (!data) return <PageLoader />;

  const versionEntries: VersionEntry[] = data.versions.map((v) => ({
    id: v.id,
    version: v.version,
    createdAt: v.createdAt,
    authorName: v.author ? `${v.author.firstName} ${v.author.lastName[0]}.` : null,
    changeNote: v.changeNote,
  }));

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <Link href={`/particularities?orgId=${data.organization.id}`} className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
          <ArrowLeft className="h-4 w-4" /> Toutes les particularités
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={markReviewed}>
            <CheckCircle className="h-4 w-4 mr-1.5" /> Marquer révisée
          </Button>
          <Button variant="outline" size="sm" onClick={remove}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Supprimer
          </Button>
          <Button size="sm" disabled={!dirty || saving} onClick={save}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
                <Building2 className="h-3.5 w-3.5" />
                <Link href={`/organisations/${data.organization.slug}`} className="hover:text-blue-600">
                  {data.organization.name}
                </Link>
                <span>·</span>
                <span>v{data.version}</span>
                {data.template && (
                  <>
                    <span>·</span>
                    <Link href={`/particularities/templates/${data.template.id}`} className="hover:text-blue-600">
                      Modèle « {data.template.title} » v{data.template.version}
                    </Link>
                    <SyncBadge state={data.syncState} />
                  </>
                )}
              </div>
              {/* Titre éditable inline. Bordure transparente par défaut
                  pour ne pas alourdir la page, mais visible au hover/focus
                  pour signaler l'affordance d'édition (auparavant le champ
                  ressemblait à du texte statique → les utilisateurs ne
                  réalisaient pas qu'ils pouvaient le renommer). */}
              <Input
                value={data.title}
                onChange={(e) => patch("title", e.target.value)}
                title="Cliquer pour modifier le titre"
                className="mt-2 text-[20px] font-semibold px-2 -ml-2 border border-transparent hover:border-slate-200 focus-visible:border-slate-300 focus-visible:ring-1 focus-visible:ring-slate-200 transition-colors"
              />
            </div>
            <VisibilityPicker
              value={data.visibility}
              onChange={(v) => patch("visibility", v)}
              allow={["INTERNAL", "CLIENT_ADMIN"]}
            />
          </div>

          {data.syncState === "DRIFTED" && data.template && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2.5">
              <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
              <div className="text-[12.5px] text-amber-900">
                Le modèle global « {data.template.title} » a évolué depuis. Cette instance peut être réalignée ou détachée.
              </div>
            </div>
          )}

          <AiActionsBar
            actions={["correct", "rewrite", "restructure", "summarize", "suggest_category", "suggest_tags", "detect_missing"]}
            onRun={runAi}
          />

          {aiResult && (
            <AiResultPanel result={aiResult} onApply={applyAiSuggestion} onDismiss={() => setAiResult(null)} />
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[12px] font-medium text-slate-700 mb-1 block">Résumé</label>
                <Textarea
                  value={data.summary ?? ""}
                  onChange={(e) => patch("summary", e.target.value)}
                  rows={2}
                />
              </div>

              <div>
                <label className="text-[12px] font-medium text-slate-700 mb-1 block">Contenu</label>
                <AdvancedRichEditor
                  value={data.body}
                  onChange={(html) => patch("body", html)}
                  placeholder="Texte enrichi — images, listes, tableaux, code, encadrés supportés."
                  minHeight="360px"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-[12px] font-medium text-slate-700 mb-1 block">
                    Catégorie {data.aiCategorySuggested && <span className="text-violet-600 text-[11px]">· suggérée par l'IA</span>}
                  </label>
                  <select
                    value={data.categoryId ?? ""}
                    onChange={(e) => patch("categoryId", e.target.value || null)}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
                  >
                    <option value="">Sans catégorie</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-slate-700 mb-1 block">Tags</label>
                  <Input
                    value={data.tags.join(", ")}
                    onChange={(e) => patch("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
                    placeholder="séparés par des virgules"
                  />
                </div>
              </div>

              <div>
                <label className="text-[12px] font-medium text-slate-700 mb-1 block">Statut</label>
                <div className="flex gap-1.5">
                  {(["DRAFT", "ACTIVE", "ARCHIVED"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => patch("status", s)}
                      className={`rounded-md px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset transition-colors ${
                        data.status === s
                          ? "bg-slate-900 text-white ring-slate-900"
                          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {s === "DRAFT" ? "Brouillon" : s === "ACTIVE" ? "Actif" : "Archivé"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <RelationsPanel sourceType="particularity" sourceId={data.id} />
          <Card>
            <div className="p-4">
              <h3 className="text-[13px] font-semibold text-slate-900 mb-3">Historique</h3>
              <VersionTimeline versions={versionEntries} onRestore={restoreVersion} />
            </div>
          </Card>
          <Card>
            <div className="p-4 text-[12px] text-slate-600 space-y-1.5">
              {data.author && (
                <div><span className="text-slate-500">Auteur :</span> {data.author.firstName} {data.author.lastName}</div>
              )}
              {data.updatedBy && (
                <div><span className="text-slate-500">Dernière édition :</span> {data.updatedBy.firstName} {data.updatedBy.lastName}</div>
              )}
              <div><span className="text-slate-500">Mise à jour :</span> {new Date(data.updatedAt).toLocaleString("fr-CA")}</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AiResultPanel({
  result,
  onApply,
  onDismiss,
}: {
  result: { capability: AiAction; text?: string; data?: unknown; error?: string };
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (result.error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
        <div className="flex-1 text-[12.5px] text-red-800">{result.error}</div>
        <button onClick={onDismiss} className="text-red-600 hover:text-red-800 text-[12px]">Fermer</button>
      </div>
    );
  }
  if (!result.text && !result.data) {
    return (
      <div className="rounded-lg bg-violet-50 border border-violet-200 px-3.5 py-2.5 text-[12.5px] text-violet-800">
        Analyse IA en cours…
      </div>
    );
  }
  const data = result.data as any;
  return (
    <div className="rounded-lg bg-violet-50 border border-violet-200 px-3.5 py-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <Info className="h-4 w-4 text-violet-600 mt-0.5" />
        <div className="flex-1 text-[12.5px] text-violet-900">
          {result.text && <pre className="whitespace-pre-wrap font-sans">{result.text}</pre>}
          {result.capability === "suggest_category" && data?.categoryName && (
            <div>
              Catégorie proposée : <strong>{data.categoryName}</strong>
              {data.confidence && <span className="text-violet-700"> ({data.confidence})</span>}
              {data.reasoning && <p className="mt-1 text-[12px] text-violet-700">{data.reasoning}</p>}
            </div>
          )}
          {result.capability === "suggest_tags" && Array.isArray(data?.tags) && (
            <div className="flex flex-wrap gap-1.5">
              {data.tags.map((t: string) => (
                <span key={t} className="rounded bg-white px-2 py-0.5 text-[11px] ring-1 ring-violet-200">{t}</span>
              ))}
            </div>
          )}
          {result.capability === "detect_missing" && Array.isArray(data?.missing) && (
            <ul className="list-disc pl-5 space-y-0.5">
              {data.missing.length === 0
                ? <li>Rien à signaler — la fiche est complète.</li>
                : data.missing.map((m: any, i: number) => (
                    <li key={i}><strong>{m.field}</strong>{m.reason && ` — ${m.reason}`}</li>
                  ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDismiss}>Ignorer</Button>
        {(result.capability === "correct" ||
          result.capability === "rewrite" ||
          result.capability === "restructure" ||
          result.capability === "summarize" ||
          result.capability === "suggest_category" ||
          result.capability === "suggest_tags") && (
          <Button size="sm" onClick={onApply}>Appliquer</Button>
        )}
      </div>
    </div>
  );
}
