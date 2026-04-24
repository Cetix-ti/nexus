"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookText, Pencil, X, ChevronDown, ChevronRight } from "lucide-react";

type Kind = "gpo" | "scripts" | "ad_groups";

const KIND_LABELS: Record<Kind, string> = {
  gpo: "Nomenclature des noms de GPO",
  scripts: "Nomenclature des noms de scripts",
  ad_groups: "Nomenclature des groupes Active Directory",
};

interface NomenclatureValue {
  content: string;
  updatedAt: string;
  updatedByUserId: string | null;
}

interface Props {
  kind: Kind;
  /** Replié par défaut. Stocké en localStorage par kind pour persister entre visites. */
  defaultOpen?: boolean;
}

export function NomenclatureSection({ kind, defaultOpen = false }: Props) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canEdit = role === "SUPER_ADMIN";

  const [value, setValue] = useState<NomenclatureValue | null>(null);
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    return window.localStorage.getItem(`nomenclature.${kind}.open`) === "1" || defaultOpen;
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch(`/api/v1/settings/nomenclature`);
    if (r.ok) {
      const data = await r.json();
      setValue(data[kind] ?? { content: "", updatedAt: "", updatedByUserId: null });
    }
  }
  useEffect(() => { void load(); }, [kind]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    try { window.localStorage.setItem(`nomenclature.${kind}.open`, next ? "1" : "0"); } catch { /* ignore */ }
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/v1/settings/nomenclature`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, content: draft }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(`Erreur : ${err.error ?? `HTTP ${r.status}`}`);
        return;
      }
      const json = await r.json();
      setValue(json.value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="bg-amber-50/30 border-amber-200/70">
      <div className="px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={toggleOpen}
          className="inline-flex items-center gap-2 text-[13px] font-medium text-amber-900 hover:text-amber-950"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <BookText className="h-4 w-4 text-amber-700" />
          {KIND_LABELS[kind]}
        </button>
        {open && canEdit && !editing && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => { setDraft(value?.content ?? ""); setEditing(true); }}
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            Modifier
          </Button>
        )}
      </div>
      {open && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={14}
                className="w-full rounded border border-slate-300 bg-white p-3 text-[13px] font-mono leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Définit la nomenclature, les conventions de nommage, les exemples concrets…"
              />
              <p className="text-[11.5px] text-slate-500">
                Texte libre. Les retours à la ligne et l&apos;indentation sont préservés.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Annuler
                </Button>
                <Button type="button" size="sm" onClick={save} disabled={saving}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </div>
            </div>
          ) : value && value.content.trim() ? (
            <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-800 font-sans">
              {value.content}
            </pre>
          ) : (
            <p className="text-[12.5px] italic text-slate-500">
              {canEdit
                ? "Aucune nomenclature définie. Cliquez sur Modifier pour l'ajouter."
                : "Aucune nomenclature documentée pour le moment."}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
