"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VisibilityPicker } from "@/components/shared/visibility-picker";
import type { Visibility } from "@/components/shared/visibility-picker";

interface Organization { id: string; name: string }
interface Category { id: string; name: string; icon: string; color: string }

/**
 * NewParticularityModal — modale d'amorce pour créer une particularité.
 *
 * On y saisit uniquement les méta de base (org, titre, catégorie, résumé,
 * tags, visibilité). Le corps riche n'est PAS dans la modale : après
 * création, on redirige vers `/particularities/[id]` qui héberge l'éditeur
 * complet (AdvancedRichEditor + outils IA + versioning). C'est plus rapide
 * pour ouvrir une fiche, et l'auteur travaille ensuite sur le corps avec
 * tous les outils dans le bon contexte.
 */
export function NewParticularityModal({
  open,
  onOpenChange,
  /** Pré-remplit l'org (utilisé depuis la fiche org > onglet Particularités). */
  defaultOrganizationId,
  /** Pré-remplit la catégorie (rare). */
  defaultCategoryId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultOrganizationId?: string;
  defaultCategoryId?: string;
}) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [orgId, setOrgId] = useState(defaultOrganizationId ?? "");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "");
  const [summary, setSummary] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("INTERNAL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset à chaque ouverture (sinon les valeurs d'une création précédente
  // restent collées). On garde defaultOrganizationId pour le contexte org.
  useEffect(() => {
    if (open) {
      setOrgId(defaultOrganizationId ?? "");
      setCategoryId(defaultCategoryId ?? "");
      setTitle("");
      setSummary("");
      setTagsInput("");
      setVisibility("INTERNAL");
      setError(null);
    }
  }, [open, defaultOrganizationId, defaultCategoryId]);

  // Charge orgs + catégories quand la modale s'ouvre (lazy — évite de
  // toucher l'API tant que personne n'a cliqué "Ajouter").
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const [r1, r2] = await Promise.all([
        fetch("/api/v1/organizations?limit=500").catch(() => null),
        fetch("/api/v1/particularity-categories").catch(() => null),
      ]);
      if (cancelled) return;
      if (r1?.ok) {
        const data = await r1.json();
        setOrgs(Array.isArray(data) ? data : data?.items ?? []);
      }
      if (r2?.ok) setCats(await r2.json());
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !title.trim()) {
      setError("Organisation et titre sont requis.");
      return;
    }
    setSaving(true);
    setError(null);
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const res = await fetch("/api/v1/particularities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: orgId,
        title: title.trim(),
        categoryId: categoryId || null,
        summary: summary || null,
        // Pas de body ici : la fiche détail (où on est redirigé) gère le
        // corps avec l'éditeur riche complet.
        body: "",
        tags,
        visibility,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Erreur lors de la création");
      return;
    }
    const created = await res.json();
    onOpenChange(false);
    router.push(`/particularities/${created.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle particularité</DialogTitle>
          <DialogDescription>
            Saisissez les informations de base. La description riche se rédige sur la fiche après création.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 text-red-700 text-[12.5px] px-3 py-2 ring-1 ring-red-200">
              {error}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Organisation *</label>
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                required
                disabled={!!defaultOrganizationId}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px] disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">— Choisir —</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Catégorie</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
              >
                <option value="">— Sans catégorie —</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Titre *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Imprimantes de la mairie en VLAN 40 séparé"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Résumé court</label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="Une phrase pour situer rapidement (facultatif)"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Tags</label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="séparés par des virgules"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Visibilité</label>
            <VisibilityPicker
              value={visibility}
              onChange={setVisibility}
              allow={["INTERNAL", "CLIENT_ADMIN"]}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" type="button" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button size="sm" type="submit" disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Création…" : "Créer et rédiger"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
