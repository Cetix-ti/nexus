"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings2, Plus, Trash2, X } from "lucide-react";

interface Props {
  /** Notifie le parent quand la liste change pour rafraîchir le datalist. */
  onChange?: (providers: string[]) => void;
}

export function IspProvidersManager({ onChange }: Props) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "SUPER_ADMIN") return null;

  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<string[] | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/v1/settings/isp-providers");
    if (r.ok) {
      const d = await r.json();
      setProviders(Array.isArray(d.providers) ? d.providers : []);
    }
  }
  useEffect(() => { if (open) void load(); }, [open]);

  async function persist(next: string[]) {
    setSaving(true);
    try {
      const r = await fetch("/api/v1/settings/isp-providers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providers: next }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(`Erreur : ${err.error ?? `HTTP ${r.status}`}`);
        return;
      }
      const d = await r.json();
      const list = Array.isArray(d.providers) ? d.providers : [];
      setProviders(list);
      onChange?.(list);
    } finally {
      setSaving(false);
    }
  }

  async function add() {
    const v = draft.trim();
    if (!v || providers === null) return;
    if (providers.some((p) => p.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    await persist([...providers, v]);
    setDraft("");
  }

  async function remove(name: string) {
    if (providers === null) return;
    if (!confirm(`Retirer « ${name} » de la liste ?`)) return;
    await persist(providers.filter((p) => p !== name));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Gérer la liste des fournisseurs ISP"
        className="inline-flex items-center gap-1 text-[11.5px] text-blue-700 hover:text-blue-900 hover:underline"
      >
        <Settings2 className="h-3 w-3" /> Gérer la liste
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Gérer les fournisseurs ISP"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-lg shadow-xl border border-slate-200 p-4 sm:p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-semibold text-slate-900">Fournisseurs ISP</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-end gap-2 mb-3">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ajouter un fournisseur (ex: Distributel)"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }}
                label="Ajouter"
              />
              <Button type="button" size="sm" onClick={add} disabled={!draft.trim() || saving} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </Button>
            </div>
            <div className="border-t border-slate-200 pt-3">
              {providers === null ? (
                <p className="text-[12.5px] text-slate-500">Chargement…</p>
              ) : providers.length === 0 ? (
                <p className="text-[12.5px] italic text-slate-500">Liste vide.</p>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {providers.map((p) => (
                    <li key={p} className="flex items-center justify-between py-2">
                      <span className="text-[13px] text-slate-800">{p}</span>
                      <button
                        type="button"
                        onClick={() => remove(p)}
                        disabled={saving}
                        title="Retirer"
                        className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">
              Liste utilisée comme suggestions dans le formulaire des liens Internet. Les utilisateurs peuvent toujours saisir une valeur libre.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
