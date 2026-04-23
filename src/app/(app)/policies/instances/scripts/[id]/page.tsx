"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, Building2, FileCode2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import { VisibilityPicker } from "@/components/shared/visibility-picker";
import { SyncBadge } from "@/components/shared/sync-badge";
import { PageLoader } from "@/components/ui/page-loader";

export default function ScriptInstanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/policies/script-instances/${id}`);
    if (r.ok) setD(await r.json());
    setDirty(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  function patch(k: string, v: any) { setD((x: any) => ({ ...x, [k]: v })); setDirty(true); }

  async function save() {
    if (!d || !dirty) return;
    setSaving(true);
    const r = await fetch(`/api/v1/policies/script-instances/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: d.title, bodyCode: d.bodyCode, bodyDocMarkdown: d.bodyDocMarkdown,
        runAs: d.runAs, schedule: d.schedule, visibility: d.visibility,
      }),
    });
    setSaving(false);
    if (r.ok) await load();
  }

  async function remove() {
    if (!confirm("Supprimer cette variante ?")) return;
    const r = await fetch(`/api/v1/policies/script-instances/${id}`, { method: "DELETE" });
    if (r.ok) router.push(`/organisations/${d.organization.slug}`);
  }

  if (!d) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <Link href={`/organisations/${d.organization.slug}`} className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
          <ArrowLeft className="h-4 w-4" /> {d.organization.name}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={remove}><Trash2 className="h-4 w-4 mr-1.5" /> Supprimer</Button>
          <Button size="sm" disabled={!dirty || saving} onClick={save}><Save className="h-4 w-4 mr-1.5" />{saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}</Button>
        </div>
      </div>

      <Card>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
            <FileCode2 className="h-3.5 w-3.5" /> <Building2 className="h-3.5 w-3.5" /> {d.organization.name} · {d.language}
            {d.template && <SyncBadge state={d.syncState} />}
          </div>
          <div className="flex items-start justify-between gap-3">
            <Input value={d.title} onChange={(e) => patch("title", e.target.value)} className="flex-1 text-[18px] font-semibold border-transparent shadow-none px-0 focus-visible:ring-0" />
            <VisibilityPicker value={d.visibility} onChange={(v) => patch("visibility", v)} />
          </div>
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
  );
}
