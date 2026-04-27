"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Plus, Search, Lightbulb, Building2, Library } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SyncBadge } from "@/components/shared/sync-badge";
import { PageLoader } from "@/components/ui/page-loader";
import { NewParticularityModal } from "@/components/particularities/new-particularity-modal";

interface Row {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  visibility: "INTERNAL" | "CLIENT_ADMIN" | "CLIENT_ALL";
  syncState: "IN_SYNC" | "DRIFTED" | "DETACHED";
  updatedAt: string;
  organization: { id: string; name: string; slug: string };
  category: { id: string; name: string; icon: string; color: string } | null;
  template: { id: string; title: string } | null;
}

interface Category { id: string; name: string; icon: string; color: string; slug: string }
interface Organization { id: string; name: string; slug: string }

function Content() {
  const search = useSearchParams();
  const orgFilter = search.get("orgId");
  const [items, setItems] = useState<Row[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(orgFilter);
  const [showNew, setShowNew] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (orgId) params.set("orgId", orgId);
    if (catId) params.set("categoryId", catId);
    if (q.trim()) params.set("search", q.trim());
    params.set("limit", "200");
    const [r1, r2, r3] = await Promise.all([
      fetch(`/api/v1/particularities?${params.toString()}`),
      fetch(`/api/v1/particularity-categories`),
      fetch(`/api/v1/organizations?limit=500`).catch(() => null),
    ]);
    if (r1.ok) setItems(await r1.json());
    if (r2.ok) setCategories(await r2.json());
    if (r3?.ok) {
      const data = await r3.json();
      setOrgs(Array.isArray(data) ? data : data?.items ?? []);
    }
  }

  useEffect(() => { setItems(null); void load(); }, [orgId, catId]);
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const driftedCount = items?.filter((i) => i.syncState === "DRIFTED").length ?? 0;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
            <Lightbulb className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-[20px] font-semibold text-slate-900">Particularités clientes</h1>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              Bibliothèque transversale — connaissances opérationnelles par client et modèles réutilisables.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/particularities/templates">
            <Button variant="outline" size="sm" className="gap-1.5"><Library className="h-4 w-4" /> Modèles</Button>
          </Link>
          <Button size="sm" className="gap-1.5" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> Nouveau
          </Button>
        </div>
      </div>

      {driftedCount > 0 && (
        <div className="rounded-lg bg-amber-50 text-amber-900 border border-amber-200 px-3.5 py-2.5 text-[12.5px]">
          <span className="font-medium">{driftedCount}</span> particularités sont à réviser — leur modèle global a évolué depuis leur instanciation.
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="pl-8" />
        </div>
        <select
          value={orgId ?? ""}
          onChange={(e) => setOrgId(e.target.value || null)}
          className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px] text-slate-700 max-w-xs"
        >
          <option value="">Toutes les organisations</option>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select
          value={catId ?? ""}
          onChange={(e) => setCatId(e.target.value || null)}
          className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px] text-slate-700 max-w-xs"
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </div>

      {items === null ? (
        <Card><div className="p-6 text-[12.5px] text-slate-500">Chargement…</div></Card>
      ) : items.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            <p className="text-[14px] font-medium text-slate-700">Aucun résultat</p>
            <p className="mt-1 text-[12.5px] text-slate-500">Ajustez vos filtres ou créez une nouvelle particularité.</p>
          </div>
        </Card>
      ) : null}

      <NewParticularityModal
        open={showNew}
        onOpenChange={setShowNew}
        defaultOrganizationId={orgId ?? undefined}
      />

      {items !== null && items.length > 0 && (
        <Card>
          <div className="divide-y divide-slate-100">
            {items.map((r) => (
              <Link
                key={r.id}
                href={`/particularities/${r.id}`}
                className="block px-4 py-3 hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.category && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: r.category.color }}>
                          <span>{r.category.icon}</span>
                          {r.category.name}
                        </span>
                      )}
                      <h3 className="text-[13.5px] font-medium text-slate-900 truncate">{r.title}</h3>
                      {r.template && <SyncBadge state={r.syncState} />}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-500">
                      <Building2 className="h-3 w-3" />
                      <span>{r.organization.name}</span>
                      {r.tags.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="truncate">{r.tags.slice(0, 4).join(" · ")}</span>
                        </>
                      )}
                    </div>
                    {r.summary && <p className="mt-1 text-[12.5px] text-slate-600 line-clamp-2">{r.summary}</p>}
                  </div>
                  <div className="shrink-0 text-[11px] text-slate-400">
                    {new Date(r.updatedAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}
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

export default function ParticularitiesListPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Content />
    </Suspense>
  );
}
