"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, FileCode2, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import { VisibilityPicker } from "@/components/shared/visibility-picker";
import { SyncBadge } from "@/components/shared/sync-badge";
import { PageLoader } from "@/components/ui/page-loader";
import { AiInlinePanel } from "@/components/shared/ai-inline-panel";
import type { AiAction } from "@/components/shared/ai-actions-bar";

export default function ScriptTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/policies/scripts/${id}`);
    if (r.ok) setD(await r.json());
    setDirty(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  function patch(k: string, v: any) { setD((x: any) => ({ ...x, [k]: v })); setDirty(true); }

  async function save() {
    if (!d || !dirty) return;
    setSaving(true);
    const r = await fetch(`/api/v1/policies/scripts/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: d.title, bodyCode: d.bodyCode, bodyDocMarkdown: d.bodyDocMarkdown,
        runAs: d.runAs, schedule: d.schedule, visibilityDefault: d.visibilityDefault,
      }),
    });
    setSaving(false);
    if (r.ok) await load();
  }

  async function archive() {
    if (!confirm("Archiver ce script ?")) return;
    const r = await fetch(`/api/v1/policies/scripts/${id}`, { method: "DELETE" });
    if (r.ok) router.push("/policies");
  }

  if (!d) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <Link href="/policies" className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
          <ArrowLeft className="h-4 w-4" /> Politiques
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={archive}><Trash2 className="h-4 w-4 mr-1.5" /> Archiver</Button>
          <Button size="sm" disabled={!dirty || saving} onClick={save}><Save className="h-4 w-4 mr-1.5" />{saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}</Button>
        </div>
      </div>

      <Card>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
            <FileCode2 className="h-3.5 w-3.5" /> Modèle Script · {d.language} · v{d.schemaVersion}
          </div>
          <div className="flex items-start justify-between gap-3">
            <Input value={d.title} onChange={(e) => patch("title", e.target.value)} className="flex-1 text-[18px] font-semibold border-transparent shadow-none px-0 focus-visible:ring-0" />
            <VisibilityPicker value={d.visibilityDefault} onChange={(v) => patch("visibilityDefault", v)} />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={d.runAs ?? ""} onChange={(e) => patch("runAs", e.target.value)} placeholder="Exécuté en tant que (SYSTEM, USER, …)" />
            <Input value={d.schedule ?? ""} onChange={(e) => patch("schedule", e.target.value)} placeholder="Planification (cron-like)" />
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="p-4">
              <AiInlinePanel kind="script_template" id={d.id}
                onApply={(cap: AiAction, text: string) => {
                  if (cap === "correct" || cap === "rewrite" || cap === "restructure") patch("bodyDocMarkdown", text);
                }}
              />
            </div>
          </Card>

          <Card>
            <div className="p-5 space-y-3">
              <h3 className="text-[14px] font-semibold">Code</h3>
              <Textarea value={d.bodyCode} onChange={(e) => patch("bodyCode", e.target.value)} rows={20} className="font-mono text-[12px]" />
            </div>
          </Card>
          <Card>
            <div className="p-5 space-y-3">
              <h3 className="text-[14px] font-semibold">Documentation</h3>
              <AdvancedRichEditor value={d.bodyDocMarkdown ?? ""} onChange={(html: string) => patch("bodyDocMarkdown", html)} placeholder="Pré-requis, usage, paramètres, exemples." minHeight="240px" />
            </div>
          </Card>
        </div>

        <div>
          <Card>
            <div className="p-4">
              <h3 className="text-[13px] font-semibold text-slate-900 mb-3">Variantes client ({d.instances?.length ?? 0})</h3>
              {(d.instances ?? []).length === 0 ? (
                <p className="text-[12.5px] text-slate-500">Aucune variante.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {d.instances.map((i: any) => (
                    <Link key={i.id} href={`/policies/instances/scripts/${i.id}`} className="block py-2 hover:bg-slate-50/60 rounded">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-[12.5px] font-medium text-slate-900 truncate">{i.organization.name}</span>
                        </div>
                        <SyncBadge state={i.syncState} />
                      </div>
                      <div className="text-[11px] text-slate-500 pl-5">{i.title}</div>
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
