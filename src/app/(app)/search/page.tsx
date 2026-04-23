"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Lightbulb, ShieldCheck, Package, GitCommit, BookOpen, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/page-loader";

type HitType = "particularity" | "policy_document" | "software" | "change" | "article";
interface Hit {
  type: HitType; id: string; title: string; excerpt: string | null;
  orgId: string | null; orgName: string | null; url: string; rank: number;
}

const TYPE_META: Record<HitType, { label: string; icon: typeof Search; color: string }> = {
  particularity:   { label: "Particularité", icon: Lightbulb,   color: "#F59E0B" },
  policy_document: { label: "Politique",     icon: ShieldCheck, color: "#EF4444" },
  software:        { label: "Logiciel",      icon: Package,     color: "#8B5CF6" },
  change:          { label: "Changement",    icon: GitCommit,   color: "#3B82F6" },
  article:         { label: "Article KB",    icon: BookOpen,    color: "#10B981" },
};

function Content() {
  const params = useSearchParams();
  const router = useRouter();
  const initialQ = params.get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [groups, setGroups] = useState<Record<HitType, Hit[]> | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setGroups(null); setTotal(0); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await fetch(`/api/v1/search?q=${encodeURIComponent(q.trim())}`);
      if (r.ok) {
        const d = await r.json();
        setGroups(d.groups);
        setTotal(d.total);
      }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.replace(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-slate-900 flex items-center justify-center"><Search className="h-5 w-5 text-white" /></div>
        <div className="flex-1">
          <h1 className="text-[20px] font-semibold text-slate-900">Recherche fédérée</h1>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Particularités · Politiques · Logiciels · Changements · Base de connaissances
          </p>
        </div>
      </div>

      <form onSubmit={submit}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher dans tous les modules…"
            className="pl-10 h-11 text-[14px]"
          />
        </div>
      </form>

      {q.trim().length < 2 ? (
        <Card><div className="p-10 text-center text-[12.5px] text-slate-500">Tapez au moins 2 caractères pour lancer une recherche.</div></Card>
      ) : loading && !groups ? (
        <PageLoader />
      ) : total === 0 ? (
        <Card><div className="p-10 text-center text-[13px] text-slate-500">Aucun résultat pour « <strong>{q}</strong> ».</div></Card>
      ) : (
        <>
          <p className="text-[12.5px] text-slate-500">{total} résultat{total > 1 ? "s" : ""} — par type :</p>
          <div className="space-y-5">
            {(Object.keys(TYPE_META) as HitType[]).map((type) => {
              const hits = groups?.[type] ?? [];
              if (hits.length === 0) return null;
              const meta = TYPE_META[type];
              const Icon = meta.icon;
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4" style={{ color: meta.color }} />
                    <h2 className="text-[13.5px] font-semibold" style={{ color: meta.color }}>{meta.label}</h2>
                    <span className="text-[11.5px] text-slate-400">· {hits.length}</span>
                  </div>
                  <Card>
                    <div className="divide-y divide-slate-100">
                      {hits.map((h) => (
                        <Link key={`${h.type}-${h.id}`} href={h.url} className="block px-4 py-3 hover:bg-slate-50/60">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-[13.5px] font-medium text-slate-900">{h.title}</h3>
                              {h.excerpt && <p className="mt-0.5 text-[12px] text-slate-600 line-clamp-2">{h.excerpt}</p>}
                              {h.orgName && (
                                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
                                  <Building2 className="h-3 w-3" /> {h.orgName}
                                </p>
                              )}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return <Suspense fallback={<PageLoader />}><Content /></Suspense>;
}
