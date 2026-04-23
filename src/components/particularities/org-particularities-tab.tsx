"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Search, Lock, UserCheck, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SyncBadge } from "@/components/shared/sync-badge";
import { cn } from "@/lib/utils";

interface ParticularityRow {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  visibility: "INTERNAL" | "CLIENT_ADMIN" | "CLIENT_ALL";
  syncState: "IN_SYNC" | "DRIFTED" | "DETACHED";
  updatedAt: string;
  category: { id: string; name: string; icon: string; color: string } | null;
  template: { id: string; title: string; version: number } | null;
  author: { firstName: string; lastName: string } | null;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  slug: string;
}

export function OrgParticularitiesTab({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [items, setItems] = useState<ParticularityRow[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  async function load() {
    const [r1, r2] = await Promise.all([
      fetch(`/api/v1/particularities?orgId=${organizationId}&limit=200`),
      fetch(`/api/v1/particularity-categories`),
    ]);
    if (r1.ok) setItems(await r1.json());
    if (r2.ok) setCategories(await r2.json());
  }

  useEffect(() => {
    setItems(null);
    void load();
  }, [organizationId]);

  const filtered = useMemo(() => {
    if (!items) return null;
    let x = items;
    if (activeCategory) x = x.filter((i) => i.category?.id === activeCategory);
    if (search.trim()) {
      const s = search.toLowerCase();
      x = x.filter(
        (i) =>
          i.title.toLowerCase().includes(s) ||
          (i.summary ?? "").toLowerCase().includes(s) ||
          i.tags.some((t) => t.toLowerCase().includes(s)),
      );
    }
    return x;
  }, [items, activeCategory, search]);

  const groups = useMemo(() => {
    if (!filtered) return [];
    const map = new Map<string, { cat: Category | null; items: ParticularityRow[] }>();
    for (const it of filtered) {
      const key = it.category?.id ?? "__uncat__";
      if (!map.has(key)) {
        const cat = categories.find((c) => c.id === it.category?.id) ?? null;
        map.set(key, { cat, items: [] });
      }
      map.get(key)!.items.push(it);
    }
    return Array.from(map.values()).sort((a, b) => (a.cat?.name ?? "~").localeCompare(b.cat?.name ?? "~"));
  }, [filtered, categories]);

  const driftedCount = items?.filter((i) => i.syncState === "DRIFTED").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-slate-900">Particularités</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Connaissances opérationnelles spécifiques à {organizationName}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {driftedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 px-2.5 py-1 text-[12px] font-medium">
              {driftedCount} à réviser
            </span>
          )}
          <Link href={`/particularities/new?orgId=${organizationId}`}>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Ajouter</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher titre, description, tag…"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset transition-colors",
              activeCategory === null
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
            )}
          >
            Toutes ({items?.length ?? 0})
          </button>
          {categories.map((c) => {
            const count = items?.filter((i) => i.category?.id === c.id).length ?? 0;
            if (count === 0) return null;
            const active = activeCategory === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCategory(active ? null : c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset transition-colors",
                  active
                    ? "text-white"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
                )}
                style={active ? { backgroundColor: c.color, borderColor: c.color } : undefined}
              >
                <span>{c.icon}</span>
                {c.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Liste */}
      {items === null ? (
        <Card>
          <div className="p-6 text-[12.5px] text-slate-500">Chargement…</div>
        </Card>
      ) : filtered && filtered.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            <p className="text-[14px] font-medium text-slate-700">Aucune particularité pour ce client</p>
            <p className="mt-1 text-[12.5px] text-slate-500">
              Documentez contraintes, quirks, exceptions ou contextes spécifiques qui aident à mieux supporter ce client.
            </p>
            <Link href={`/particularities/new?orgId=${organizationId}`} className="mt-4 inline-block">
              <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Créer la première</Button>
            </Link>
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
                    <h3 className="text-[13px] font-semibold" style={{ color: g.cat.color }}>
                      {g.cat.name}
                    </h3>
                  </>
                ) : (
                  <h3 className="text-[13px] font-semibold text-slate-500">Sans catégorie</h3>
                )}
                <span className="text-[11.5px] text-slate-400">· {g.items.length}</span>
              </div>
              <div className="grid gap-2">
                {g.items.map((it) => (
                  <ParticularityRow key={it.id} row={it} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ParticularityRow({ row }: { row: ParticularityRow }) {
  const VisIcon = row.visibility === "INTERNAL" ? Lock : row.visibility === "CLIENT_ADMIN" ? UserCheck : Eye;
  return (
    <Link
      href={`/particularities/${row.id}`}
      className="group block rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 hover:border-slate-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[13.5px] font-medium text-slate-900 group-hover:text-blue-700 truncate">
              {row.title}
            </h4>
            <VisIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {row.template && <SyncBadge state={row.syncState} />}
          </div>
          {row.summary && (
            <p className="mt-1 text-[12.5px] text-slate-600 line-clamp-2">{row.summary}</p>
          )}
          {row.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {row.tags.slice(0, 4).map((t) => (
                <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-slate-600">{t}</span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right text-[11px] text-slate-400">
          {new Date(row.updatedAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}
          {row.author && (
            <div className="mt-0.5 text-[10.5px]">{row.author.firstName} {row.author.lastName[0]}.</div>
          )}
        </div>
      </div>
    </Link>
  );
}
