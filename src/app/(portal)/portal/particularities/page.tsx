"use client";

import { useEffect, useState } from "react";
import { Lightbulb, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/page-loader";
import { AiExplainButton } from "@/components/portal/ai-explain-button";
import { PortalAccessRestricted } from "@/components/portal/access-restricted";
import { usePortalUser } from "@/lib/portal/use-portal-user";

interface Row {
  id: string; title: string; summary: string | null; body: string;
  tags: string[]; visibility: string; updatedAt: string;
  category: { name: string; icon: string; color: string } | null;
}

export default function PortalParticularitiesPage() {
  const { permissions } = usePortalUser();
  const [items, setItems] = useState<Row[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!permissions.canSeeParticularities) return;
    void fetch("/api/portal/particularities").then(async (r) => {
      if (r.ok) setItems(await r.json());
      else setItems([]);
    });
  }, [permissions.canSeeParticularities]);

  if (!permissions.canSeeParticularities) return <PortalAccessRestricted title="Particularités" />;
  if (items === null) return <PageLoader />;

  const groups = new Map<string, { cat: Row["category"]; items: Row[] }>();
  for (const r of items) {
    const key = r.category?.name ?? "Autres";
    if (!groups.has(key)) groups.set(key, { cat: r.category, items: [] });
    groups.get(key)!.items.push(r);
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center"><Lightbulb className="h-5 w-5 text-amber-600" /></div>
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900">Particularités de votre organisation</h1>
          <p className="mt-0.5 text-[12.5px] text-slate-500">Informations utiles documentées par votre équipe Cetix pour mieux vous accompagner.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card><div className="p-10 text-center text-[13px] text-slate-500">Aucune particularité partagée pour le moment.</div></Card>
      ) : (
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([key, g]) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                {g.cat ? <><span>{g.cat.icon}</span><h2 className="text-[13.5px] font-semibold" style={{ color: g.cat.color }}>{g.cat.name}</h2></> : <h2 className="text-[13.5px] font-semibold text-slate-500">{key}</h2>}
                <span className="text-[11.5px] text-slate-400">· {g.items.length}</span>
              </div>
              <div className="space-y-2">
                {g.items.map((r) => (
                  <Card key={r.id}>
                    <div className="p-4">
                      <button className="w-full text-left" onClick={() => setOpenId((id) => id === r.id ? null : r.id)}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1">
                            <h3 className="text-[14px] font-medium text-slate-900">{r.title}</h3>
                            {r.summary && <p className="mt-0.5 text-[12.5px] text-slate-600">{r.summary}</p>}
                            {r.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {r.tags.slice(0, 6).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-slate-600">{t}</span>)}
                              </div>
                            )}
                          </div>
                          <span className="shrink-0 text-[11px] text-slate-400">{new Date(r.updatedAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}</span>
                        </div>
                      </button>
                      {openId === r.id && (
                        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                          <div className="prose prose-sm max-w-none text-[13px] text-slate-700" dangerouslySetInnerHTML={{ __html: r.body }} />
                          <AiExplainButton kind="particularity" id={r.id} />
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
