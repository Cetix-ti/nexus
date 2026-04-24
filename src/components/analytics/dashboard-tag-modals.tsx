"use client";

// Deux modals liées aux balises (tags) de dashboards :
//   - ManageTagsModal   : CRUD global des balises (renommer, couleur, suppr)
//   - AssignTagsModal   : attache/détache des balises à un dashboard,
//                         avec création rapide inline.

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Tag as TagIcon, Plus, Check, Trash2, Pencil } from "lucide-react";
import {
  type TagDef,
  TAG_COLOR_KEYS,
  DEFAULT_TAG_COLOR,
  tagStyle,
} from "@/lib/analytics/dashboard-tags";

// ---------------------------------------------------------------------------
// ManageTagsModal — CRUD global
// ---------------------------------------------------------------------------
interface ManageProps {
  open: boolean;
  onClose: () => void;
  tags: TagDef[];
  onSave: (tags: TagDef[]) => void;
}

export function ManageTagsModal({ open, onClose, tags, onSave }: ManageProps) {
  const [draft, setDraft] = useState<TagDef[]>(tags);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(DEFAULT_TAG_COLOR);

  useEffect(() => { if (open) setDraft(tags); }, [open, tags]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function addTag() {
    const name = newName.trim();
    if (!name) return;
    const id = `tag_${Date.now()}`;
    setDraft((prev) => [...prev, { id, name, color: newColor }]);
    setNewName("");
    setNewColor(DEFAULT_TAG_COLOR);
  }

  function updateTag(id: string, patch: Partial<TagDef>) {
    setDraft((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeTag(id: string) {
    setDraft((prev) => prev.filter((t) => t.id !== id));
  }

  function apply() {
    const cleaned = draft
      .map((t) => ({ ...t, name: t.name.trim() }))
      .filter((t) => t.name.length > 0);
    onSave(cleaned);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50">
      <div className="relative w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[85vh] bg-white sm:rounded-xl shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
          <h2 className="text-[15px] font-semibold text-slate-900 inline-flex items-center gap-2">
            <TagIcon className="h-4 w-4 text-blue-600" /> Gérer les balises
          </h2>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-100" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-100 shrink-0 space-y-2">
          <p className="text-[11.5px] text-slate-500">
            Les balises servent à classer tes dashboards : Finances, Rapport mensuel, etc.
          </p>
          <div className="flex items-center gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="Nom de la balise…"
              className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <button
              onClick={addTag}
              disabled={!newName.trim()}
              className="h-[34px] px-2.5 rounded-md bg-blue-600 text-white text-[12.5px] hover:bg-blue-700 disabled:opacity-40 inline-flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Ajouter
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {draft.length === 0 ? (
            <div className="px-3 py-6 text-[12.5px] text-slate-500 text-center">Aucune balise.</div>
          ) : (
            draft.map((t) => <TagRow key={t.id} tag={t} onChange={(p) => updateTag(t.id, p)} onRemove={() => removeTag(t.id)} />)
          )}
        </div>

        <div className="border-t border-slate-200 px-4 py-3 shrink-0 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-[13px] rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Annuler
          </button>
          <button onClick={apply} className="text-[13px] rounded bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800">
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function TagRow({ tag, onChange, onRemove }: { tag: TagDef; onChange: (p: Partial<TagDef>) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const st = tagStyle(tag.color);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  function commit() {
    const clean = name.trim();
    if (clean && clean !== tag.name) onChange({ name: clean });
    else setName(tag.name);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />
      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setName(tag.name); setEditing(false); }
          }}
          autoFocus
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:border-blue-500 focus:outline-none"
        />
      ) : (
        <span className={`flex-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${st.bg} ${st.fg} ${st.ring} max-w-max`}>
          {tag.name}
        </span>
      )}
      <ColorPicker value={tag.color} onChange={(c) => onChange({ color: c })} />
      {!editing && (
        <button
          onClick={() => setEditing(true)}
          className="h-7 w-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"
          title="Renommer"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        onClick={onRemove}
        className="h-7 w-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center"
        title="Supprimer la balise"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const st = tagStyle(value);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`h-[30px] w-[30px] rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-50`}
        title="Couleur"
      >
        <span className={`h-3.5 w-3.5 rounded-full ${st.dot}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-[152px] rounded-md border border-slate-200 bg-white shadow-lg p-1.5 grid grid-cols-5 gap-1">
          {TAG_COLOR_KEYS.map((key) => {
            const s = tagStyle(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => { onChange(key); setOpen(false); }}
                className={`h-6 w-6 rounded-full ${s.dot} ring-2 ${value === key ? "ring-slate-900" : "ring-transparent"} hover:ring-slate-400`}
                title={key}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssignTagsModal — attache/détache les balises d'un dashboard
// ---------------------------------------------------------------------------
interface AssignProps {
  open: boolean;
  onClose: () => void;
  itemName?: string;
  currentTagIds: string[];
  allTags: TagDef[];
  onSaveAssignment: (tagIds: string[]) => void;
  /** Permet d'ajouter une nouvelle balise à la liste globale sans quitter la modal. */
  onCreateTag: (tag: TagDef) => void;
}

export function AssignTagsModal({
  open, onClose, itemName, currentTagIds, allTags, onSaveAssignment, onCreateTag,
}: AssignProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(currentTagIds));
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(DEFAULT_TAG_COLOR);

  useEffect(() => { if (open) setSelected(new Set(currentTagIds)); }, [open, currentTagIds]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sortedTags = useMemo(
    () => [...allTags].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [allTags],
  );

  if (!open) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addInline() {
    const name = newName.trim();
    if (!name) return;
    const id = `tag_${Date.now()}`;
    const tag: TagDef = { id, name, color: newColor };
    onCreateTag(tag);
    setSelected((prev) => new Set([...prev, id]));
    setNewName("");
    setNewColor(DEFAULT_TAG_COLOR);
  }

  function apply() {
    onSaveAssignment(Array.from(selected));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50">
      <div className="relative w-full sm:max-w-md h-full sm:h-auto sm:max-h-[85vh] bg-white sm:rounded-xl shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-900 inline-flex items-center gap-2">
              <TagIcon className="h-4 w-4 text-blue-600" /> Balises
            </h2>
            {itemName && <p className="text-[12px] text-slate-500 mt-0.5 truncate">{itemName}</p>}
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-100" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sortedTags.length === 0 ? (
            <div className="px-3 py-6 text-[12.5px] text-slate-500 text-center">
              Aucune balise encore créée. Ajoute-en une ci-dessous.
            </div>
          ) : (
            sortedTags.map((t) => {
              const checked = selected.has(t.id);
              const st = tagStyle(t.color);
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left border transition-colors ${
                    checked ? "border-blue-500 bg-blue-50/40" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className={`h-4 w-4 shrink-0 rounded border ${checked ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white"} flex items-center justify-center`}>
                    {checked && <Check className="h-3 w-3" />}
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${st.bg} ${st.fg} ${st.ring}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {t.name}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-slate-100 px-3 py-2 shrink-0 space-y-1.5">
          <p className="text-[10.5px] text-slate-500 uppercase tracking-wider">Créer une nouvelle balise</p>
          <div className="flex items-center gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addInline(); } }}
              placeholder="Nom…"
              className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-[12.5px] focus:border-blue-500 focus:outline-none"
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <button
              onClick={addInline}
              disabled={!newName.trim()}
              className="h-[30px] px-2.5 rounded-md bg-blue-600 text-white text-[12px] hover:bg-blue-700 disabled:opacity-40 inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Créer
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200 px-4 py-3 shrink-0 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-[13px] rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Annuler
          </button>
          <button onClick={apply} className="text-[13px] rounded bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800">
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
