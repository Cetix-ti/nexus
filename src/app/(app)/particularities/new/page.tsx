"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VisibilityPicker } from "@/components/shared/visibility-picker";
import type { Visibility } from "@/components/shared/visibility-picker";
import { PageLoader } from "@/components/ui/page-loader";

interface Organization { id: string; name: string }
interface Category { id: string; name: string; icon: string; color: string }

function Content() {
  const router = useRouter();
  const search = useSearchParams();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [orgId, setOrgId] = useState(search.get("orgId") ?? "");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("INTERNAL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [r1, r2] = await Promise.all([
        fetch("/api/v1/organizations?limit=500").catch(() => null),
        fetch("/api/v1/particularity-categories"),
      ]);
      if (r1?.ok) {
        const data = await r1.json();
        setOrgs(Array.isArray(data) ? data : data?.items ?? []);
      }
      if (r2.ok) setCats(await r2.json());
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !title.trim()) {
      setError("Organisation et titre sont requis.");
      return;
    }
    setSaving(true);
    setError(null);
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const res = await fetch("/api/v1/particularities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: orgId,
        title: title.trim(),
        categoryId: categoryId || null,
        summary: summary || null,
        body,
        tags,
        visibility,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Erreur lors de la création");
      return;
    }
    const created = await res.json();
    router.push(`/particularities/${created.id}`);
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/particularities" className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
          <ArrowLeft className="h-4 w-4" /> Retour aux particularités
        </Link>
      </div>

      <div>
        <h1 className="text-[20px] font-semibold text-slate-900">Nouvelle particularité</h1>
        <p className="mt-0.5 text-[12.5px] text-slate-500">Documenter une connaissance opérationnelle propre à un client.</p>
      </div>

      <Card>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <div className="rounded-md bg-red-50 text-red-700 text-[12.5px] px-3 py-2 ring-1 ring-red-200">{error}</div>}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Organisation *</label>
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                required
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
              >
                <option value="">— Choisir —</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Catégorie</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
              >
                <option value="">— Sans catégorie —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Titre *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Imprimantes de la mairie en VLAN 40 séparé" required />
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Résumé court</label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="Une phrase pour situer rapidement"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Description</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="Markdown supporté — vous pourrez passer à l'éditeur riche depuis la fiche après création."
              className="font-mono text-[12.5px]"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Tags</label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="séparés par des virgules"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Visibilité</label>
            <VisibilityPicker
              value={visibility}
              onChange={setVisibility}
              allow={["INTERNAL", "CLIENT_ADMIN"]}
            />
            <p className="mt-1 text-[11.5px] text-slate-500">
              Privée = agents uniquement. Publique = admin client sur le portail.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Link href="/particularities"><Button variant="outline" size="sm" type="button">Annuler</Button></Link>
            <Button size="sm" type="submit" disabled={saving}>{saving ? "Création…" : "Créer la particularité"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function NewParticularityPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Content />
    </Suspense>
  );
}
