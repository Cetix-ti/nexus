"use client";

import { useState } from "react";
import { Plus, Trash2, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Tag {
  id: string;
  name: string;
  color: string;
  ticketCount: number;
}

const TAG_COLORS = [
  { name: "Bleu", value: "#3B82F6" },
  { name: "Violet", value: "#8B5CF6" },
  { name: "Vert", value: "#10B981" },
  { name: "Orange", value: "#F59E0B" },
  { name: "Rouge", value: "#EF4444" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Rose", value: "#EC4899" },
  { name: "Slate", value: "#64748B" },
  { name: "Lime", value: "#84CC16" },
  { name: "Indigo", value: "#6366F1" },
];

const initialTags: Tag[] = [
  { id: "t1", name: "urgent", color: "#EF4444", ticketCount: 24 },
  { id: "t2", name: "vip-client", color: "#F59E0B", ticketCount: 18 },
  { id: "t3", name: "production", color: "#DC2626", ticketCount: 42 },
  { id: "t4", name: "retour-client", color: "#3B82F6", ticketCount: 56 },
  { id: "t5", name: "escalade", color: "#8B5CF6", ticketCount: 12 },
  { id: "t6", name: "documentation", color: "#10B981", ticketCount: 31 },
  { id: "t7", name: "post-mortem", color: "#64748B", ticketCount: 8 },
  { id: "t8", name: "amélioration", color: "#06B6D4", ticketCount: 27 },
  { id: "t9", name: "bug", color: "#EC4899", ticketCount: 45 },
  { id: "t10", name: "formation", color: "#84CC16", ticketCount: 19 },
  { id: "t11", name: "audit", color: "#6366F1", ticketCount: 14 },
  { id: "t12", name: "maintenance", color: "#10B981", ticketCount: 36 },
];

export function TagsSection() {
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0].value);
  const [search, setSearch] = useState("");

  function addTag() {
    if (!newName.trim()) return;
    setTags((prev) => [
      ...prev,
      {
        id: `t${Date.now()}`,
        name: newName.trim().toLowerCase().replace(/\s+/g, "-"),
        color: newColor,
        ticketCount: 0,
      },
    ]);
    setNewName("");
  }

  function deleteTag(id: string) {
    setTags((prev) => prev.filter((t) => t.id !== id));
  }

  const filtered = tags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
          Tags
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Étiquetez vos tickets pour les organiser et les retrouver facilement
        </p>
      </div>

      {/* Create new tag */}
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-[13px] font-semibold text-slate-700">
            Créer un nouveau tag
          </h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-[12px] font-medium text-slate-700">
                Nom du tag
              </label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="ex: urgent, vip-client, escalade"
                onKeyDown={(e) => e.key === "Enter" && addTag()}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-slate-700">
                Couleur
              </label>
              <div className="flex items-center gap-1.5">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setNewColor(c.value)}
                    className={`h-7 w-7 rounded-md transition-all ${
                      newColor === c.value
                        ? "ring-2 ring-offset-2 ring-slate-900 scale-110"
                        : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
            <Button variant="primary" size="md" onClick={addTag}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Ajouter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="flex items-center justify-between">
        <Input
          placeholder="Rechercher un tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          iconLeft={<TagIcon className="h-3.5 w-3.5" />}
          className="max-w-xs"
        />
        <p className="text-[12px] text-slate-500 tabular-nums">
          {filtered.length} tag{filtered.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* Tags grid */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap gap-2">
            {filtered.map((tag) => (
              <div
                key={tag.id}
                className="group inline-flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white pl-2 pr-1 py-1.5 hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-[12.5px] font-medium text-slate-700">
                  {tag.name}
                </span>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {tag.ticketCount}
                </span>
                <button
                  onClick={() => deleteTag(tag.id)}
                  className="h-5 w-5 inline-flex items-center justify-center rounded-md text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-[13px] text-slate-400 italic py-4">
                Aucun tag trouvé.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
