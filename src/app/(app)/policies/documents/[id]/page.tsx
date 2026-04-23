"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, Building2, Lock, KeyRound, Database, Globe, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import { VisibilityPicker, type Visibility } from "@/components/shared/visibility-picker";
import { PageLoader } from "@/components/ui/page-loader";
import { AiInlinePanel } from "@/components/shared/ai-inline-panel";
import type { AiAction } from "@/components/shared/ai-actions-bar";
import { RelationsPanel } from "@/components/shared/relations-panel";

const ICONS: Record<string, typeof Lock> = {
  PWD_AD: Lock, PWD_ENTRA: Lock, PRIVILEGED_ACCESS: KeyRound, M365_ROLES: Globe,
  KEEPASS: KeyRound, BACKUP_REPLICATION: Database, OTHER: FileText,
};
const INTERNAL_ONLY = new Set(["SCRIPT", "PRIVILEGED_ACCESS", "KEEPASS"]);

export default function PolicyDocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/policies/documents/${id}`);
    if (r.ok) setD(await r.json());
    setDirty(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  function patch(k: string, v: any) { setD((x: any) => ({ ...x, [k]: v })); setDirty(true); }

  async function save() {
    if (!d || !dirty) return;
    setSaving(true);
    const r = await fetch(`/api/v1/policies/documents/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: d.title, summary: d.summary, body: d.body,
        structuredFields: d.structuredFields, visibility: d.visibility, status: d.status,
      }),
    });
    setSaving(false);
    if (r.ok) await load();
  }

  async function remove() {
    if (!confirm("Supprimer cette fiche ?")) return;
    const r = await fetch(`/api/v1/policies/documents/${id}`, { method: "DELETE" });
    if (r.ok) router.push(`/organisations/${d.organization.slug}`);
  }

  if (!d) return <PageLoader />;
  const Icon = ICONS[d.subcategory] ?? FileText;
  const visibilityAllow: Visibility[] = INTERNAL_ONLY.has(d.subcategory) ? ["INTERNAL"] : ["INTERNAL", "CLIENT_ADMIN"];

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
            <Icon className="h-3.5 w-3.5" /> <Building2 className="h-3.5 w-3.5" /> {d.organization.name} · {d.subcategory.replace(/_/g, " ")}
          </div>
          <div className="flex items-start justify-between gap-3">
            <Input value={d.title} onChange={(e) => patch("title", e.target.value)} className="flex-1 text-[18px] font-semibold border-transparent shadow-none px-0 focus-visible:ring-0" />
            <VisibilityPicker value={d.visibility} onChange={(v) => patch("visibility", v)} allow={visibilityAllow} />
          </div>
          {INTERNAL_ONLY.has(d.subcategory) && (
            <p className="text-[11.5px] text-slate-500 italic">🔒 Cette sous-catégorie est forcée en visibilité INTERNE côté serveur.</p>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <AiInlinePanel kind="policy_document" id={d.id}
            onApply={(cap: AiAction, text: string) => {
              if (cap === "correct" || cap === "rewrite" || cap === "restructure") patch("body", text);
              else if (cap === "summarize") patch("summary", text);
            }}
          />
        </div>
      </Card>

      <Card>
        <div className="p-5 space-y-3">
          <h3 className="text-[14px] font-semibold">Résumé</h3>
          <Textarea value={d.summary ?? ""} onChange={(e) => patch("summary", e.target.value)} rows={3} />
        </div>
      </Card>
      <Card>
        <div className="p-5 space-y-3">
          <h3 className="text-[14px] font-semibold">Contenu</h3>
          <AdvancedRichEditor value={d.body} onChange={(html: string) => patch("body", html)} placeholder="Texte enrichi — images, listes, tableaux, encadrés." minHeight="280px" />
        </div>
      </Card>

      <RelationsPanel sourceType="policy_document" sourceId={d.id} />
    </div>
  );
}
