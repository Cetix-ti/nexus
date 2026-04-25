"use client";

// ============================================================================
// AddSoftwareModal — modal réutilisable pour créer un logiciel sans quitter
// la page courante. Utilisé depuis l'onglet "Logiciels" d'une organisation
// (pré-rempli avec orgId, mode "instance"), peut aussi servir ailleurs.
//
// Wrap la même logique que /software/new, mais en modal pour éviter le
// redirect en plein milieu d'un workflow d'organisation.
// ============================================================================

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Org { id: string; name: string }
interface Cat { id: string; name: string; icon: string }

interface CreatedItem { id: string; name: string }

interface Props {
  open: boolean;
  onClose: () => void;
  /** Si fourni, le modal ouvre directement en mode "instance" pour cette org. */
  organizationId?: string | null;
  organizationName?: string;
  onCreated?: (item: CreatedItem & { mode: "template" | "instance" }) => void;
}

export function AddSoftwareModal({ open, onClose, organizationId, organizationName, onCreated }: Props) {
  const presetOrg = organizationId ?? "";
  const [mode, setMode] = useState<"instance" | "template">(presetOrg ? "instance" : "template");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [orgId, setOrgId] = useState(presetOrg);
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [version, setVersion] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Reset entre ouvertures
    setName(""); setVendor(""); setVersion(""); setCategoryId(""); setBody("");
    setError(null);
    setOrgId(presetOrg);
    setMode(presetOrg ? "instance" : "template");

    void (async () => {
      const [r1, r2] = await Promise.all([
        fetch("/api/v1/organizations?limit=500").catch(() => null),
        fetch("/api/v1/software/categories").catch(() => null),
      ]);
      if (r1?.ok) {
        const d = await r1.json();
        setOrgs(Array.isArray(d) ? d : d?.items ?? []);
      }
      if (r2?.ok) setCats(await r2.json());
    })();
  }, [open, presetOrg]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Nom requis."); return; }
    if (mode === "instance" && !orgId) { setError("Organisation requise."); return; }
    setSaving(true);
    const endpoint = mode === "template" ? "/api/v1/software/templates" : "/api/v1/software/instances";
    const payload =
      mode === "template"
        ? { name: name.trim(), vendor: vendor || null, version: version || null, categoryId: categoryId || null, body }
        : {
            organizationId: orgId,
            name: name.trim(),
            vendor: vendor || null,
            version: version || null,
            categoryId: categoryId || null,
            bodyOverride: body,
          };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? `Erreur HTTP ${res.status}`);
      return;
    }
    const created = await res.json();
    onCreated?.({ id: created.id, name: created.name ?? name.trim(), mode });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ajouter un logiciel"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl my-8 rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">Nouveau logiciel</h2>
            {organizationName && (
              <p className="text-[12.5px] text-slate-500 mt-0.5">{organizationName}</p>
            )}
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
          {error && <div className="rounded-md bg-red-50 text-red-700 text-[12.5px] px-3 py-2 ring-1 ring-red-200">{error}</div>}

          <div className="flex gap-1.5 flex-wrap">
            {(["template", "instance"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset ${
                  mode === m ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200"
                }`}
              >
                {m === "template" ? "Catalogue global" : "Déploiement client"}
              </button>
            ))}
          </div>

          {mode === "instance" && !presetOrg && (
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Organisation *</label>
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                required
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
              >
                <option value="">— Choisir —</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Nom *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Éditeur / Fournisseur</label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Version</label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Catégorie</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
              >
                <option value="">—</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Documentation</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Markdown / notes" className="font-mono text-[12.5px]" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>Annuler</Button>
            <Button size="sm" type="submit" disabled={saving}>{saving ? "Création…" : "Créer"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
