"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Library } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/page-loader";

interface Row {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  version: number;
  updatedAt: string;
  category: { id: string; name: string; icon: string; color: string } | null;
  _count: { instances: number };
}

export default function TemplatesListPage() {
  const [items, setItems] = useState<Row[] | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", summary: "" });

  async function load() {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    const r = await fetch(`/api/v1/particularity-templates?${params.toString()}`);
    if (r.ok) setItems(await r.json());
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const r = await fetch(`/api/v1/particularity-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title.trim(), summary: form.summary || null }),
    });
    if (r.ok) {
      const t = await r.json();
      window.location.href = `/particularities/templates/${t.id}`;
    }
  }

  if (items === null) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/particularities" className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
          <ArrowLeft className="h-4 w-4" /> Particularités
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center">
            <Library className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-[20px] font-semibold text-slate-900">Modèles réutilisables</h1>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              Contenu maître applicable à plusieurs clients. Les instances dérivées reflètent l'alignement.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nouveau modèle
        </Button>
      </div>

      {creating && (
        <Card>
          <form onSubmit={createTemplate} className="p-4 space-y-3">
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Titre</label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Nom du modèle" required />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Résumé (optionnel)</label>
              <Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setCreating(false)}>Annuler</Button>
              <Button size="sm" type="submit">Créer</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="relative max-w-md">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un modèle…" />
      </div>

      {items.length === 0 ? (
        <Card><div className="p-10 text-center text-[13px] text-slate-500">Aucun modèle — créez le premier pour démarrer une bibliothèque réutilisable.</div></Card>
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {items.map((t) => (
              <Link key={t.id} href={`/particularities/templates/${t.id}`} className="block px-4 py-3 hover:bg-slate-50/60">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {t.category && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: t.category.color }}>
                          <span>{t.category.icon}</span>{t.category.name}
                        </span>
                      )}
                      <h3 className="text-[13.5px] font-medium text-slate-900 truncate">{t.title}</h3>
                      <span className="text-[11px] text-slate-400">v{t.version}</span>
                    </div>
                    {t.summary && <p className="mt-0.5 text-[12.5px] text-slate-600 line-clamp-2">{t.summary}</p>}
                  </div>
                  <div className="shrink-0 text-[11px] text-slate-500">
                    {t._count.instances} {t._count.instances <= 1 ? "instance" : "instances"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
