"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, Building2, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import { VisibilityPicker } from "@/components/shared/visibility-picker";
import { SyncBadge } from "@/components/shared/sync-badge";
import { PageLoader } from "@/components/ui/page-loader";

const SCOPE_PREFIX = { COMPUTER: "c_", USER: "u_", MIXED: "cu_" } as const;

export default function GpoInstanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/policies/gpo-instances/${id}`);
    if (r.ok) setD(await r.json());
    setDirty(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  function patch(k: string, v: any) { setD((x: any) => ({ ...x, [k]: v })); setDirty(true); }

  async function save() {
    if (!d || !dirty) return;
    setSaving(true);
    const r = await fetch(`/api/v1/policies/gpo-instances/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nameStem: d.nameStem, nameOverride: d.nameOverride, scope: d.scope,
        description: d.description, bodyOverride: d.bodyOverride, visibility: d.visibility, status: d.status,
      }),
    });
    setSaving(false);
    if (r.ok) await load();
  }

  async function requestApproval() {
    const r = await fetch(`/api/v1/approvals`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: d.organizationId, targetType: "gpo_instance", targetId: d.id,
        action: "deploy", justification: "Demande de déploiement GPO chez le client",
      }),
    });
    if (r.ok) {
      await fetch(`/api/v1/policies/gpo-instances/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PENDING_APPROVAL" }),
      });
      await load();
    }
  }

  async function remove() {
    if (!confirm("Supprimer cette instance GPO ?")) return;
    const r = await fetch(`/api/v1/policies/gpo-instances/${id}`, { method: "DELETE" });
    if (r.ok) router.push(`/organisations/${d.organization.slug}`);
  }

  if (!d) return <PageLoader />;

  const computedName = d.computedName || `${SCOPE_PREFIX[d.scope as "COMPUTER" | "USER" | "MIXED"]}${d.nameStem}`;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <Link href={`/organisations/${d.organization.slug}`} className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
          <ArrowLeft className="h-4 w-4" /> {d.organization.name}
        </Link>
        <div className="flex items-center gap-2">
          {d.status === "DRAFT" && <Button size="sm" variant="outline" onClick={requestApproval} className="gap-1.5"><Send className="h-4 w-4" /> Demander approbation</Button>}
          <Button variant="outline" size="sm" onClick={remove}><Trash2 className="h-4 w-4 mr-1.5" /> Supprimer</Button>
          <Button size="sm" disabled={!dirty || saving} onClick={save}><Save className="h-4 w-4 mr-1.5" />{saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}</Button>
        </div>
      </div>

      <Card>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
            <Building2 className="h-3.5 w-3.5" /> {d.organization.name} · statut : <strong>{d.status}</strong>
            {d.template && <><span>·</span><SyncBadge state={d.syncState} /></>}
          </div>
          <code className="text-[15px] font-semibold text-slate-900 bg-slate-100 px-2 py-1 rounded inline-block">{computedName}</code>
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={d.nameStem} onChange={(e) => patch("nameStem", e.target.value)} placeholder="Nom sans préfixe" />
            <select value={d.scope} onChange={(e) => patch("scope", e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
              <option value="COMPUTER">Ordinateur (c_)</option>
              <option value="USER">Utilisateur (u_)</option>
              <option value="MIXED">Mixte (cu_)</option>
            </select>
          </div>
          <Input value={d.nameOverride ?? ""} onChange={(e) => patch("nameOverride", e.target.value)} placeholder="Nom override (optionnel)" />
          <div className="flex items-center gap-2">
            <VisibilityPicker value={d.visibility} onChange={(v) => patch("visibility", v)} />
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-5 space-y-3">
          <h3 className="text-[14px] font-semibold">Description</h3>
          <Textarea value={d.description ?? ""} onChange={(e) => patch("description", e.target.value)} rows={4} />
        </div>
      </Card>
      <Card>
        <div className="p-5 space-y-3">
          <h3 className="text-[14px] font-semibold">Documentation propre au client (override)</h3>
          <AdvancedRichEditor value={d.bodyOverride ?? ""} onChange={(html: string) => patch("bodyOverride", html)} placeholder={d.template ? "Vide = hérite du modèle global." : "Texte enrichi."} minHeight="240px" />
        </div>
      </Card>
    </div>
  );
}
