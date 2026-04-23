"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageLoader } from "@/components/ui/page-loader";
import { CATEGORY_LABELS, IMPACT_LABELS, CLIENT_SAFE_CATEGORIES } from "@/components/changes/change-helpers";
import type { ChangeCategory, ChangeImpact } from "@prisma/client";

interface Org { id: string; name: string }

function Content() {
  const router = useRouter();
  const params = useSearchParams();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState(params.get("orgId") ?? "");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<ChangeCategory>("INFRASTRUCTURE");
  const [impact, setImpact] = useState<ChangeImpact>("MODERATE");
  const [changeDate, setChangeDate] = useState(new Date().toISOString().slice(0, 10));
  const [expose, setExpose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/v1/organizations?limit=500").catch(() => null);
      if (r?.ok) {
        const d = await r.json();
        setOrgs(Array.isArray(d) ? d : d?.items ?? []);
      }
    })();
  }, []);

  const canExpose = CLIENT_SAFE_CATEGORIES.includes(category);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!orgId || !title.trim()) { setError("Organisation et titre requis."); return; }
    setSaving(true);
    const res = await fetch("/api/v1/changes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: orgId, title: title.trim(), summary: summary || null, body,
        category, impact, changeDate,
        status: "APPROVED",
        visibility: expose ? "CLIENT_ADMIN" : "INTERNAL",
        exposeToClientAdmin: expose,
      }),
    });
    setSaving(false);
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError((err as any)?.error ?? "Erreur"); return; }
    const c = await res.json();
    router.push(`/changes/${c.id}`);
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <Link href="/changes" className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>
      <h1 className="text-[20px] font-semibold text-slate-900">Nouveau changement</h1>

      <Card>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <div className="rounded-md bg-red-50 text-red-700 text-[12.5px] px-3 py-2 ring-1 ring-red-200">{error}</div>}

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Organisation *</label>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} required className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
              <option value="">— Choisir —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Titre *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Ex : Remplacement FortiGate FG-100F → FG-200F" />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Catégorie</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ChangeCategory)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Impact</label>
              <select value={impact} onChange={(e) => setImpact(e.target.value as ChangeImpact)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
                {Object.entries(IMPACT_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Date du changement</label>
              <Input type="date" value={changeDate} onChange={(e) => setChangeDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Résumé</label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Détails</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="font-mono text-[12.5px]" />
          </div>

          <label className="flex items-start gap-2 text-[12.5px]">
            <input type="checkbox" checked={expose} onChange={(e) => setExpose(e.target.checked)} disabled={!canExpose} className="mt-0.5" />
            <div>
              <div className="font-medium text-slate-700">Exposer au portail client (rôle admin)</div>
              <div className="text-[11.5px] text-slate-500">
                {canExpose
                  ? "Ce changement sera visible pour les administrateurs de l'organisation cliente."
                  : `Cette catégorie (${CATEGORY_LABELS[category].label}) reste interne — option désactivée.`}
              </div>
            </div>
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Link href="/changes"><Button variant="outline" size="sm" type="button">Annuler</Button></Link>
            <Button size="sm" type="submit" disabled={saving}>{saving ? "Création…" : "Créer"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function NewChangePage() {
  return <Suspense fallback={<PageLoader />}><Content /></Suspense>;
}
