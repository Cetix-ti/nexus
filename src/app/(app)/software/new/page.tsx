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

interface Org { id: string; name: string }
interface Cat { id: string; name: string; icon: string }

function Content() {
  const router = useRouter();
  const search = useSearchParams();
  const presetOrg = search.get("orgId") ?? "";
  const [mode, setMode] = useState<"instance" | "template">(presetOrg ? "instance" : "template");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [orgId, setOrgId] = useState(presetOrg);
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [version, setVersion] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [r1, r2] = await Promise.all([
        fetch("/api/v1/organizations?limit=500").catch(() => null),
        fetch("/api/v1/software/categories"),
      ]);
      if (r1?.ok) {
        const d = await r1.json();
        setOrgs(Array.isArray(d) ? d : d?.items ?? []);
      }
      if (r2.ok) setCats(await r2.json());
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Nom requis."); return; }
    if (mode === "instance" && !orgId) { setError("Organisation requise."); return; }
    setSaving(true);
    const endpoint = mode === "template" ? "/api/v1/software/templates" : "/api/v1/software/instances";
    const payload =
      mode === "template"
        ? { name: name.trim(), vendor: vendor || null, version: version || null, categoryId: categoryId || null, body }
        : {
            organizationId: orgId,
            name: name.trim(),
            vendor: vendor || null,
            version: version || null,
            categoryId: categoryId || null,
            bodyOverride: body,
          };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Erreur");
      return;
    }
    const created = await res.json();
    router.push(mode === "template" ? `/software/templates/${created.id}` : `/software/${created.id}`);
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <Link href="/software" className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>
      <h1 className="text-[20px] font-semibold text-slate-900">Nouveau logiciel</h1>

      <Card>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <div className="rounded-md bg-red-50 text-red-700 text-[12.5px] px-3 py-2 ring-1 ring-red-200">{error}</div>}

          <div className="flex gap-1.5">
            {(["template", "instance"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset ${
                  mode === m ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200"
                }`}
              >
                {m === "template" ? "Catalogue global" : "Déploiement client"}
              </button>
            ))}
          </div>

          {mode === "instance" && (
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Organisation *</label>
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} required className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
                <option value="">— Choisir —</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Nom *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Éditeur / Fournisseur</label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Version</label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Catégorie</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]">
                <option value="">—</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Documentation</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} placeholder="Markdown / notes" className="font-mono text-[12.5px]" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Link href="/software"><Button variant="outline" size="sm" type="button">Annuler</Button></Link>
            <Button size="sm" type="submit" disabled={saving}>{saving ? "Création…" : "Créer"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function NewSoftwarePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Content />
    </Suspense>
  );
}
