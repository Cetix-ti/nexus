"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, Building2, Sparkles, Check, X, Send, GitMerge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import { PageLoader } from "@/components/ui/page-loader";
import { CATEGORY_LABELS, IMPACT_LABELS, STATUS_LABELS, CLIENT_SAFE_CATEGORIES } from "@/components/changes/change-helpers";
import type { ChangeCategory, ChangeImpact, ChangeStatus } from "@prisma/client";
import { AiInlinePanel } from "@/components/shared/ai-inline-panel";
import type { AiAction } from "@/components/shared/ai-actions-bar";
import { RelationsPanel } from "@/components/shared/relations-panel";

interface Detail {
  id: string; title: string; summary: string | null; body: string;
  category: ChangeCategory; impact: ChangeImpact; status: ChangeStatus;
  changeDate: string; publishedAt: string | null; aiConfidence: number | null; manualEntry: boolean;
  visibility: "INTERNAL" | "CLIENT_ADMIN" | "CLIENT_ALL"; exposeToClientAdmin: boolean;
  organization: { id: string; name: string; slug: string };
  author: { firstName: string; lastName: string } | null;
  approver: { firstName: string; lastName: string } | null;
  sources: unknown;
  mergedInto: { id: string; title: string } | null;
  mergedFrom: Array<{ id: string; title: string; changeDate: string }>;
  linkedTicketIds: string[];
}

export default function ChangeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<Array<{ id: string; title: string }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/changes/${id}`);
    if (r.ok) setD(await r.json());
    setDirty(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  function patch<K extends keyof Detail>(k: K, v: Detail[K]) {
    setD((x) => (x ? { ...x, [k]: v } : x));
    setDirty(true);
  }

  async function save() {
    if (!d || !dirty) return;
    setSaving(true);
    const r = await fetch(`/api/v1/changes/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: d.title, summary: d.summary, body: d.body,
        category: d.category, impact: d.impact, status: d.status,
        changeDate: d.changeDate, visibility: d.visibility, exposeToClientAdmin: d.exposeToClientAdmin,
      }),
    });
    setSaving(false);
    if (r.ok) await load();
    else { const err = await r.json().catch(() => ({})); alert(err.error ?? "Erreur"); }
  }

  async function approve() {
    const r = await fetch(`/api/v1/changes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve: true }) });
    if (r.ok) await load();
  }
  async function reject() {
    const r = await fetch(`/api/v1/changes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reject: true }) });
    if (r.ok) await load();
  }
  async function publish() {
    if (!d) return;
    const confirmExpose = d.visibility !== "INTERNAL"
      ? confirm("Ce changement sera visible pour le client (admin). Confirmer la publication ?")
      : true;
    if (!confirmExpose) return;
    const r = await fetch(`/api/v1/changes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publish: true }) });
    if (r.ok) await load();
  }
  async function remove() {
    if (!confirm("Supprimer ce changement ?")) return;
    const r = await fetch(`/api/v1/changes/${id}`, { method: "DELETE" });
    if (r.ok) router.push(`/organisations/${d?.organization.slug}`);
  }

  async function openMerge() {
    if (!d) return;
    setMergeOpen(true);
    const r = await fetch(`/api/v1/changes?orgId=${d.organization.id}`);
    if (r.ok) {
      const all = await r.json();
      setMergeCandidates(all.filter((c: any) => c.id !== d.id && !c.mergedIntoId));
    }
  }
  async function doMerge() {
    if (!d || selected.size === 0) return;
    const r = await fetch(`/api/v1/changes/${id}/merge`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceIds: Array.from(selected) }),
    });
    if (r.ok) { setMergeOpen(false); setSelected(new Set()); await load(); }
  }

  if (!d) return <PageLoader />;
  const cat = CATEGORY_LABELS[d.category];
  const imp = IMPACT_LABELS[d.impact];
  const st = STATUS_LABELS[d.status];
  const canExpose = CLIENT_SAFE_CATEGORIES.includes(d.category);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <Link href={`/organisations/${d.organization.slug}`} className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
          <ArrowLeft className="h-4 w-4" /> {d.organization.name}
        </Link>
        <div className="flex items-center gap-2">
          {d.status === "AI_SUGGESTED" && (
            <>
              <Button size="sm" variant="outline" onClick={reject}><X className="h-4 w-4 mr-1.5" /> Rejeter</Button>
              <Button size="sm" onClick={approve}><Check className="h-4 w-4 mr-1.5" /> Approuver</Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={openMerge}><GitMerge className="h-4 w-4 mr-1.5" /> Fusionner…</Button>
          {d.status === "APPROVED" && (
            <Button size="sm" onClick={publish}><Send className="h-4 w-4 mr-1.5" /> Publier</Button>
          )}
          <Button variant="outline" size="sm" onClick={remove}><Trash2 className="h-4 w-4 mr-1.5" /> Supprimer</Button>
          <Button size="sm" disabled={!dirty || saving} onClick={save}><Save className="h-4 w-4 mr-1.5" />{saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}</Button>
        </div>
      </div>

      <Card>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
            <span className="inline-flex items-center gap-1 font-medium" style={{ color: cat.color }}>{cat.icon} {cat.label}</span>
            <span className={`text-[11px] rounded px-1.5 py-0.5 ring-1 ring-inset ${imp.color}`}>{imp.label}</span>
            <span className={`text-[11px] rounded px-1.5 py-0.5 ring-1 ring-inset ${st.color}`}>{st.label}</span>
            {d.manualEntry && <span className="text-[11px] text-slate-500">manuel</span>}
            {d.aiConfidence !== null && <span className="inline-flex items-center gap-1 text-[11px] text-violet-700"><Sparkles className="h-3 w-3" /> confiance {Math.round((d.aiConfidence ?? 0) * 100)}%</span>}
          </div>
          <Input value={d.title} onChange={(e) => patch("title", e.target.value)} className="text-[20px] font-semibold border-transparent shadow-none px-0 focus-visible:ring-0" />
          <Textarea value={d.summary ?? ""} onChange={(e) => patch("summary", e.target.value)} rows={2} placeholder="Résumé en 1-2 phrases" />
        </div>
      </Card>

      {d.mergedInto && (
        <Card>
          <div className="p-4 text-[12.5px] text-slate-700">
            Ce changement a été fusionné dans <Link href={`/changes/${d.mergedInto.id}`} className="underline text-blue-700">{d.mergedInto.title}</Link>.
          </div>
        </Card>
      )}
      {d.mergedFrom.length > 0 && (
        <Card>
          <div className="p-4">
            <h3 className="text-[13px] font-semibold mb-2">Changements fusionnés dans celui-ci ({d.mergedFrom.length})</h3>
            <ul className="text-[12px] text-slate-700 list-disc pl-5 space-y-0.5">
              {d.mergedFrom.map((m) => <li key={m.id}>{m.title} ({new Date(m.changeDate).toLocaleDateString("fr-CA")})</li>)}
            </ul>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="p-4">
              <AiInlinePanel kind="change" id={d.id}
                onApply={(cap: AiAction, text: string) => {
                  if (cap === "correct" || cap === "rewrite" || cap === "restructure") patch("body", text);
                  else if (cap === "summarize") patch("summary", text);
                }}
              />
            </div>
          </Card>

          <Card>
            <div className="p-5 space-y-3">
              <h3 className="text-[14px] font-semibold">Détails</h3>
              <AdvancedRichEditor value={d.body} onChange={(html) => patch("body", html)} placeholder="Description détaillée, sources, impact, notes." minHeight="240px" />
            </div>
          </Card>

          {Array.isArray(d.sources) && d.sources.length > 0 && (
            <Card>
              <div className="p-4">
                <h3 className="text-[13px] font-semibold mb-2">Sources détectées</h3>
                <ul className="text-[12px] text-slate-700 space-y-1">
                  {(d.sources as Array<{ type: string; id: string; excerpt?: string }>).map((s, i) => (
                    <li key={i}>
                      <span className="uppercase tracking-wide text-[10px] text-slate-500 mr-1">{s.type}</span>
                      {s.excerpt && <span className="text-slate-600">— {s.excerpt.slice(0, 160)}…</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <RelationsPanel sourceType="change" sourceId={d.id} />
          <Card>
            <div className="p-4 space-y-3">
              <h3 className="text-[13px] font-semibold">Classification</h3>
              <div>
                <label className="text-[11.5px] text-slate-500">Catégorie</label>
                <select value={d.category} onChange={(e) => patch("category", e.target.value as ChangeCategory)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-slate-500">Impact</label>
                <select value={d.impact} onChange={(e) => patch("impact", e.target.value as ChangeImpact)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
                  {Object.entries(IMPACT_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-slate-500">Date du changement</label>
                <Input type="date" value={d.changeDate.slice(0, 10)} onChange={(e) => patch("changeDate", e.target.value)} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4 space-y-3">
              <h3 className="text-[13px] font-semibold">Exposition au client</h3>
              <label className="flex items-start gap-2 text-[12px]">
                <input type="checkbox" checked={d.exposeToClientAdmin} disabled={!canExpose}
                  onChange={(e) => { patch("exposeToClientAdmin", e.target.checked); patch("visibility", e.target.checked ? "CLIENT_ADMIN" : "INTERNAL"); }}
                  className="mt-0.5" />
                <div>
                  <div className="font-medium text-slate-700">Visible par l'admin client</div>
                  <div className="text-[11.5px] text-slate-500">
                    {canExpose ? "À la publication, visible dans le portail client (rôle admin)." : `Catégorie ${cat.label} : reste interne.`}
                  </div>
                </div>
              </label>
            </div>
          </Card>
        </div>
      </div>

      {mergeOpen && (
        <Card>
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">Fusionner d'autres changements dans celui-ci</h3>
              <button onClick={() => setMergeOpen(false)} className="text-slate-500 text-[12.5px]">Fermer</button>
            </div>
            {mergeCandidates.length === 0 ? (
              <p className="text-[12.5px] text-slate-500">Aucun candidat disponible.</p>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 divide-y divide-slate-100">
                  {mergeCandidates.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-[12.5px]">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={(e) => {
                        setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; });
                      }} />
                      {c.title}
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setMergeOpen(false)}>Annuler</Button>
                  <Button size="sm" disabled={selected.size === 0} onClick={doMerge}>Fusionner {selected.size} changement{selected.size > 1 ? "s" : ""}</Button>
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
