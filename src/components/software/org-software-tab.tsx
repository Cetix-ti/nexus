"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Search, Package, UserCog, Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SyncBadge } from "@/components/shared/sync-badge";
import { AddSoftwareModal } from "@/components/software/add-software-modal";

interface Row {
  id: string;
  name: string;
  vendor: string | null;
  version: string | null;
  syncState: "IN_SYNC" | "DRIFTED" | "DETACHED";
  updatedAt: string;
  category: { id: string; name: string; icon: string; color: string } | null;
  template: { id: string; name: string } | null;
  responsibleClientContact: { firstName: string; lastName: string } | null;
  responsibleCetixUser: { firstName: string; lastName: string } | null;
  _count: { installers: number; licenses: number };
}

export function OrgSoftwareTab({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const [items, setItems] = useState<Row[] | null>(null);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    const r = await fetch(`/api/v1/software/instances?orgId=${organizationId}`);
    if (r.ok) setItems(await r.json());
  }
  useEffect(() => { setItems(null); void load(); }, [organizationId]);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(s) || (i.vendor ?? "").toLowerCase().includes(s));
  }, [items, search]);

  const groups = useMemo(() => {
    if (!filtered) return [];
    const map = new Map<string, { cat: Row["category"]; items: Row[] }>();
    for (const it of filtered) {
      const key = it.category?.id ?? "__uncat__";
      if (!map.has(key)) map.set(key, { cat: it.category, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.values()).sort((a, b) => (a.cat?.name ?? "~").localeCompare(b.cat?.name ?? "~"));
  }, [filtered]);

  const drifted = items?.filter((i) => i.syncState === "DRIFTED").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-slate-900">Logiciels</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">Logiciels déployés et responsabilités pour {organizationName}.</p>
        </div>
        <div className="flex items-center gap-2">
          {drifted > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 px-2.5 py-1 text-[12px] font-medium">
              {drifted} à réviser
            </span>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un logiciel…" className="pl-8" />
      </div>

      {items === null ? (
        <Card><div className="p-6 text-[12.5px] text-slate-500">Chargement…</div></Card>
      ) : filtered && filtered.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            <Package className="h-8 w-8 text-slate-400 mx-auto mb-3" />
            <p className="text-[14px] font-medium text-slate-700">Aucun logiciel déployé</p>
            <p className="mt-1 text-[12.5px] text-slate-500">Ajoutez un logiciel depuis le catalogue global ou créez une fiche spécifique à ce client.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.cat?.id ?? "uncat"}>
              <div className="flex items-center gap-2 mb-2">
                {g.cat ? (
                  <>
                    <span className="text-[15px]">{g.cat.icon}</span>
                    <h3 className="text-[13px] font-semibold" style={{ color: g.cat.color }}>{g.cat.name}</h3>
                  </>
                ) : (
                  <h3 className="text-[13px] font-semibold text-slate-500">Sans catégorie</h3>
                )}
                <span className="text-[11.5px] text-slate-400">· {g.items.length}</span>
              </div>
              <div className="grid gap-2">
                {g.items.map((i) => (
                  <Link key={i.id} href={`/software/${i.id}`} className="group block rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 hover:border-slate-300 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-[13.5px] font-medium text-slate-900 group-hover:text-blue-700 truncate">
                            {i.name}
                          </h4>
                          {i.version && <span className="text-[11px] text-slate-400">v{i.version}</span>}
                          {i.template && <SyncBadge state={i.syncState} />}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-slate-500 flex items-center gap-2 flex-wrap">
                          {i.vendor && <span>{i.vendor}</span>}
                          {(i.responsibleClientContact || i.responsibleCetixUser) && (
                            <span className="inline-flex items-center gap-0.5">
                              <UserCog className="h-3 w-3" />
                              {i.responsibleCetixUser && `${i.responsibleCetixUser.firstName} ${i.responsibleCetixUser.lastName[0]}.`}
                              {i.responsibleCetixUser && i.responsibleClientContact && " / "}
                              {i.responsibleClientContact && `${i.responsibleClientContact.firstName} ${i.responsibleClientContact.lastName[0]}.`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-[11px] text-slate-400">
                        <div>{i._count.installers} installeur(s)</div>
                        <div>{i._count.licenses} licence(s)</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <AddSoftwareModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        organizationId={organizationId}
        organizationName={organizationName}
        onCreated={() => { void load(); }}
      />
    </div>
  );
}
