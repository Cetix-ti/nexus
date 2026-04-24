"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Search, Package, Library, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/page-loader";

interface Template {
  id: string;
  name: string;
  vendor: string | null;
  version: string | null;
  schemaVersion: number;
  updatedAt: string;
  category: { id: string; name: string; icon: string; color: string } | null;
  _count: { instances: number; installers: number; licenses: number };
}

interface Instance {
  id: string;
  name: string;
  vendor: string | null;
  version: string | null;
  syncState: "IN_SYNC" | "DRIFTED" | "DETACHED";
  updatedAt: string;
  organization: { id: string; name: string; slug: string };
  category: { id: string; name: string; icon: string; color: string } | null;
  template: { id: string; name: string } | null;
  _count: { installers: number; licenses: number };
}

interface Category { id: string; name: string; icon: string; color: string }

function Content() {
  const search = useSearchParams();
  const orgFilter = search.get("orgId");
  const [tab, setTab] = useState<"instances" | "templates">(orgFilter ? "instances" : "templates");
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [instances, setInstances] = useState<Instance[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(orgFilter);

  async function load() {
    const p = new URLSearchParams();
    if (catId) p.set("categoryId", catId);
    if (q.trim()) p.set("search", q.trim());
    if (orgId) p.set("orgId", orgId);
    const [rT, rI, rC] = await Promise.all([
      fetch(`/api/v1/software/templates?${p.toString()}`),
      fetch(`/api/v1/software/instances?${p.toString()}`),
      fetch(`/api/v1/software/categories`),
    ]);
    if (rT.ok) setTemplates(await rT.json());
    if (rI.ok) setInstances(await rI.json());
    if (rC.ok) setCats(await rC.json());
  }

  useEffect(() => {
    setTemplates(null); setInstances(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catId, orgId]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center">
            <Package className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-[20px] font-semibold text-slate-900">Logiciels</h1>
            <p className="mt-0.5 text-[12.5px] text-slate-500">Catalogue global + parc déployé chez les clients.</p>
          </div>
        </div>
        <Link href="/software/new">
          <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nouveau</Button>
        </Link>
      </div>

      {/* Onglets internes */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto -mx-6 px-6 sm:-mx-0 sm:px-0">
        <button
          onClick={() => setTab("templates")}
          className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px ${
            tab === "templates" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Library className="inline h-3.5 w-3.5 mr-1" /> Catalogue global {templates && <span className="text-slate-400">({templates.length})</span>}
        </button>
        <button
          onClick={() => setTab("instances")}
          className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px ${
            tab === "instances" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Building2 className="inline h-3.5 w-3.5 mr-1" /> Parc client {instances && <span className="text-slate-400">({instances.length})</span>}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="pl-8" />
        </div>
        <select
          value={catId ?? ""}
          onChange={(e) => setCatId(e.target.value || null)}
          className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]"
        >
          <option value="">Toutes catégories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </div>

      {tab === "templates" ? (
        templates === null ? <PageLoader />
        : templates.length === 0 ? <EmptyCard text="Aucun logiciel dans le catalogue global." />
        : (
          <Card>
            <div className="divide-y divide-slate-100">
              {templates.map((t) => (
                <Link key={t.id} href={`/software/templates/${t.id}`} className="block px-4 py-3 hover:bg-slate-50/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {t.category && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: t.category.color }}>
                            <span>{t.category.icon}</span>{t.category.name}
                          </span>
                        )}
                        <h3 className="text-[13.5px] font-medium text-slate-900">{t.name}</h3>
                        {t.version && <span className="text-[11px] text-slate-400">v{t.version}</span>}
                      </div>
                      {t.vendor && <p className="mt-0.5 text-[12px] text-slate-600">{t.vendor}</p>}
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-500 text-right">
                      <div>{t._count.instances} déploiement(s)</div>
                      <div>{t._count.installers} installeur(s)</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )
      ) : instances === null ? <PageLoader />
      : instances.length === 0 ? <EmptyCard text="Aucun logiciel déployé chez les clients." />
      : (
        <Card>
          <div className="divide-y divide-slate-100">
            {instances.map((i) => (
              <Link key={i.id} href={`/software/${i.id}`} className="block px-4 py-3 hover:bg-slate-50/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {i.category && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: i.category.color }}>
                          <span>{i.category.icon}</span>{i.category.name}
                        </span>
                      )}
                      <h3 className="text-[13.5px] font-medium text-slate-900">{i.name}</h3>
                      {i.version && <span className="text-[11px] text-slate-400">v{i.version}</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-500">
                      <Building2 className="h-3 w-3" /> {i.organization.name}
                      {i.vendor && <><span>·</span>{i.vendor}</>}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] text-slate-500 text-right">
                    <div>{i._count.installers} installeur(s)</div>
                    <div>{i._count.licenses} licence(s)</div>
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

function EmptyCard({ text }: { text: string }) {
  return <Card><div className="p-10 text-center text-[13px] text-slate-500">{text}</div></Card>;
}

export default function SoftwareListPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Content />
    </Suspense>
  );
}
