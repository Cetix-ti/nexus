"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, Building2, ShieldCheck } from "lucide-react";
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

const SCOPE_PREFIX = { COMPUTER: "c_", USER: "u_", MIXED: "cu_" } as const;

export default function GpoTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/policies/gpo/${id}`);
    if (r.ok) setD(await r.json());
    setDirty(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  function patch(k: string, v: any) { setD((x: any) => ({ ...x, [k]: v })); setDirty(true); }

  async function save() {
    if (!d || !dirty) return;
    setSaving(true);
    const r = await fetch(`/api/v1/policies/gpo/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nameStem: d.nameStem, nameOverride: d.nameOverride, scope: d.scope,
        description: d.description, body: d.body, deploymentProcedure: d.deploymentProcedure,
        visibilityDefault: d.visibilityDefault,
      }),
    });
    setSaving(false);
    if (r.ok) await load();
  }

  async function archive() {
    if (!confirm("Archiver ce modèle GPO ?")) return;
    const r = await fetch(`/api/v1/policies/gpo/${id}`, { method: "DELETE" });
    if (r.ok) router.push("/policies");
  }

  if (!d) return <PageLoader />;

  const computedName = d.nameOverride?.trim() || `${SCOPE_PREFIX[d.scope as "COMPUTER" | "USER" | "MIXED"]}${d.nameStem}`;

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
            <ShieldCheck className="h-3.5 w-3.5" /> Modèle GPO · v{d.schemaVersion} · {d.instances?.length ?? 0} instance(s)
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <code className="text-[13px] font-semibold text-slate-900 bg-slate-100 px-2 py-1 rounded">{computedName}</code>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <label className="text-[11.5px] text-slate-500">Nom (sans préfixe)</label>
                  <Input value={d.nameStem} onChange={(e) => patch("nameStem", e.target.value)} />
                </div>
                <div>
                  <label className="text-[11.5px] text-slate-500">Scope</label>
                  <select value={d.scope} onChange={(e) => patch("scope", e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
                    <option value="COMPUTER">Ordinateur (c_)</option>
                    <option value="USER">Utilisateur (u_)</option>
                    <option value="MIXED">Mixte (cu_)</option>
                  </select>
                </div>
              </div>
              <div className="mt-2">
                <label className="text-[11.5px] text-slate-500">Nom override (écrase le nom auto)</label>
                <Input value={d.nameOverride ?? ""} onChange={(e) => patch("nameOverride", e.target.value)} placeholder="laisser vide pour nom auto" />
              </div>
            </div>
            <VisibilityPicker value={d.visibilityDefault} onChange={(v) => patch("visibilityDefault", v)} />
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="p-5 space-y-3">
              <h3 className="text-[14px] font-semibold text-slate-900">Description</h3>
              <Textarea value={d.description ?? ""} onChange={(e) => patch("description", e.target.value)} rows={4} />
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <AiInlinePanel kind="gpo_template" id={d.id}
                onApply={(cap: AiAction, text: string) => {
                  if (cap === "correct" || cap === "rewrite" || cap === "restructure") patch("body", text);
                  else if (cap === "summarize") patch("description", text);
                }}
              />
            </div>
          </Card>

          <Card>
            <div className="p-5 space-y-3">
              <h3 className="text-[14px] font-semibold text-slate-900">Documentation</h3>
              <AdvancedRichEditor value={d.body} onChange={(html: string) => patch("body", html)} placeholder="Contexte, scope, effets attendus." minHeight="240px" />
            </div>
          </Card>
          <Card>
            <div className="p-5 space-y-3">
              <h3 className="text-[14px] font-semibold text-slate-900">Procédure de déploiement</h3>
              <AdvancedRichEditor value={d.deploymentProcedure ?? ""} onChange={(html: string) => patch("deploymentProcedure", html)} placeholder="Étapes numérotées, captures, tables." minHeight="240px" />
            </div>
          </Card>
        </div>

        <div>
          <Card>
            <div className="p-4">
              <h3 className="text-[13px] font-semibold text-slate-900 mb-3">Déployée chez ({d.instances?.length ?? 0})</h3>
              {(d.instances ?? []).length === 0 ? (
                <p className="text-[12.5px] text-slate-500">Pas encore déployée.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {d.instances.map((i: any) => (
                    <Link key={i.id} href={`/policies/instances/gpo/${i.id}`} className="block py-2 hover:bg-slate-50/60 rounded">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-[12.5px] font-medium text-slate-900 truncate">{i.organization.name}</span>
                        </div>
                        <SyncBadge state={i.syncState} />
                      </div>
                      <div className="text-[11px] text-slate-500 pl-5">{i.computedName}</div>
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
