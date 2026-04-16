"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  Star,
  Mail,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  X,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPROVER_SCOPE_LABELS,
  type OrgApprover,
  type ApproverScope,
} from "@/lib/approvers/types";

interface OrgApproversSectionProps {
  organizationId: string;
  organizationName: string;
}

interface FormState {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  jobTitle: string;
  level: number;
  isPrimary: boolean;
  scope: ApproverScope;
  scopeMinAmount?: number;
  notifyByEmail: boolean;
  notifyBySms: boolean;
}

const EMPTY_FORM: FormState = {
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  jobTitle: "",
  level: 1,
  isPrimary: false,
  scope: "all_tickets",
  notifyByEmail: true,
  notifyBySms: false,
};

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
        checked ? "bg-blue-600" : "bg-slate-300"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow translate-y-0.5",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function OrgApproversSection({
  organizationId,
  organizationName,
}: OrgApproversSectionProps) {
  const [approvers, setApprovers] = useState<OrgApprover[]>([]);
  const [orgContacts, setOrgContacts] = useState<
    { id: string; firstName: string; lastName: string; email: string; phone?: string; jobTitle?: string }[]
  >([]);

  useEffect(() => {
    fetch(`/api/v1/approvers?organizationId=${organizationId}`)
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setApprovers(data))
      .catch((e) => console.error("Erreur de chargement des approbateurs", e));
    fetch(`/api/v1/contacts?organizationId=${organizationId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        setOrgContacts(
          data.map((c: any) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            phone: c.phone,
            jobTitle: c.jobTitle,
          }))
        );
      })
      .catch(() => {});
  }, [organizationId]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setCreating(true);
  }

  function startEdit(a: OrgApprover) {
    setForm({
      contactName: a.contactName,
      contactEmail: a.contactEmail,
      contactPhone: a.contactPhone || "",
      jobTitle: a.jobTitle || "",
      level: a.level,
      isPrimary: a.isPrimary,
      scope: a.scope,
      scopeMinAmount: a.scopeMinAmount,
      notifyByEmail: a.notifyByEmail,
      notifyBySms: a.notifyBySms,
    });
    setEditingId(a.id);
    setCreating(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
  }

  async function saveApprover() {
    if (!form.contactName.trim() || !form.contactEmail.trim()) return;
    try {
      if (editingId) {
        const res = await fetch(`/api/v1/approvers/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const updated = (await res.json()) as OrgApprover;
        setApprovers((prev) => prev.map((a) => (a.id === editingId ? updated : a)));
      } else if (creating) {
        const res = await fetch("/api/v1/approvers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, organizationId, addedBy: "Vous" }),
        });
        const created = (await res.json()) as OrgApprover;
        setApprovers((prev) => [...prev, created]);
      }
      cancelEdit();
    } catch (e) {
      alert("Erreur : " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function deleteApprover(id: string) {
    if (!confirm("Retirer cet approbateur ?")) return;
    await fetch(`/api/v1/approvers/${id}`, { method: "DELETE" });
    setApprovers((prev) => prev.filter((a) => a.id !== id));
  }

  async function setPrimary(id: string) {
    await fetch(`/api/v1/approvers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setPrimary", organizationId }),
    });
    setApprovers((prev) => prev.map((a) => ({ ...a, isPrimary: a.id === id })));
  }

  const isEditing = editingId !== null || creating;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 ring-1 ring-inset ring-violet-200/60 shrink-0">
              <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Approbateurs des tickets
              </h3>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Personnes pouvant approuver les tickets de {organizationName}{" "}
                avant leur prise en charge par l&apos;équipe
              </p>
            </div>
          </div>
          {!isEditing && (
            <Button variant="primary" size="sm" onClick={startCreate}>
              <Plus className="h-3 w-3" strokeWidth={2.5} />
              Nouvel approbateur
            </Button>
          )}
        </div>

        {/* Form */}
        {isEditing && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-3">
            <h4 className="text-[13px] font-semibold text-slate-900">
              {editingId ? "Modifier l'approbateur" : "Nouvel approbateur"}
            </h4>
            <div className="grid grid-cols-1 gap-3">
              <ContactAutocomplete
                contacts={orgContacts}
                onPick={(c) => {
                  setForm({
                    ...form,
                    contactName: `${c.firstName} ${c.lastName}`,
                    contactEmail: c.email,
                    contactPhone: c.phone || "",
                    jobTitle: c.jobTitle || "",
                  });
                }}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Nom complet"
                value={form.contactName}
                onChange={(e) =>
                  setForm({ ...form, contactName: e.target.value })
                }
                placeholder="Robert Martin"
              />
              <Input
                label="Email"
                type="email"
                value={form.contactEmail}
                onChange={(e) =>
                  setForm({ ...form, contactEmail: e.target.value })
                }
                placeholder="robert@acme.com"
              />
              <Input
                label="Téléphone"
                value={form.contactPhone}
                onChange={(e) =>
                  setForm({ ...form, contactPhone: e.target.value })
                }
                placeholder="+1 514 555-0210"
              />
              <Input
                label="Titre du poste"
                value={form.jobTitle}
                onChange={(e) =>
                  setForm({ ...form, jobTitle: e.target.value })
                }
                placeholder="Directeur TI"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Niveau hiérarchique
                </label>
                <Select
                  value={String(form.level)}
                  onValueChange={(v) =>
                    setForm({ ...form, level: parseInt(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Niveau 1 — Premier approbateur</SelectItem>
                    <SelectItem value="2">Niveau 2 — Approbateur secondaire</SelectItem>
                    <SelectItem value="3">Niveau 3 — Final / escalade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Périmètre d&apos;approbation
                </label>
                <Select
                  value={form.scope}
                  onValueChange={(v) =>
                    setForm({ ...form, scope: v as ApproverScope })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPROVER_SCOPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.scope === "specific_amounts" && (
              <Input
                label="Montant minimum ($)"
                type="number"
                value={form.scopeMinAmount || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    scopeMinAmount: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="5000"
              />
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setForm({ ...form, isPrimary: !form.isPrimary })}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors",
                  form.isPrimary
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                <Star
                  className={cn(
                    "h-3.5 w-3.5",
                    form.isPrimary && "fill-amber-500 text-amber-500"
                  )}
                />
                Approbateur principal
              </button>
            </div>
            <div className="space-y-2 pt-2 border-t border-blue-200">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Notifications
              </p>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-slate-700 inline-flex items-center gap-1.5">
                  <Mail className="h-3 w-3 text-slate-400" />
                  Par courriel
                </span>
                <Toggle
                  checked={form.notifyByEmail}
                  onChange={(v) => setForm({ ...form, notifyByEmail: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-slate-700 inline-flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-slate-400" />
                  Par SMS
                </span>
                <Toggle
                  checked={form.notifyBySms}
                  onChange={(v) => setForm({ ...form, notifyBySms: v })}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-blue-200">
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                <X className="h-3 w-3" />
                Annuler
              </Button>
              <Button variant="primary" size="sm" onClick={saveApprover}>
                Enregistrer
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        {approvers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
            <ShieldCheck className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-[13px] font-medium text-slate-600">
              Aucun approbateur configuré
            </p>
            <p className="text-[12px] text-slate-400 mt-0.5">
              Les tickets de ce client ne nécessiteront pas d&apos;approbation
            </p>
          </div>
        ) : (
          <div className="space-y-2 -mx-1">
            {approvers.map((a) => (
              <div
                key={a.id}
                className="group flex items-center gap-3 rounded-lg border border-slate-200/80 bg-white p-3 hover:bg-slate-50/60 transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white text-[11px] font-semibold ring-2 ring-white shadow-sm shrink-0">
                  {getInitials(a.contactName)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-[13.5px] font-semibold text-slate-900">
                      {a.contactName}
                    </h4>
                    {a.isPrimary && (
                      <Badge variant="warning">
                        <Crown className="h-2.5 w-2.5" strokeWidth={2.5} />
                        Principal
                      </Badge>
                    )}
                    <Badge variant="default">Niveau {a.level}</Badge>
                  </div>
                  <p className="text-[11.5px] text-slate-500 truncate">
                    {a.jobTitle && `${a.jobTitle} · `}
                    {a.contactEmail}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-[10.5px] text-slate-500 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-2.5 w-2.5" />
                      {APPROVER_SCOPE_LABELS[a.scope]}
                      {a.scope === "specific_amounts" && a.scopeMinAmount && (
                        <span> ≥ {a.scopeMinAmount.toLocaleString("fr-CA")} $</span>
                      )}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                      {a.totalApproved}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <XCircle className="h-2.5 w-2.5 text-red-500" />
                      {a.totalRejected}
                    </span>
                    {a.averageResponseHours && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {a.averageResponseHours}h moy.
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!a.isPrimary && (
                    <button
                      onClick={() => setPrimary(a.id)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                      title="Définir comme principal"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(a)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteApprover(a.id)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg bg-blue-50/40 border border-blue-200/60 px-3 py-2.5 text-[11.5px] text-blue-900">
          💡 Lors de la création d&apos;un ticket, ces approbateurs seront
          proposés dans la section « Approbation requise ». Leur scope est
          appliqué automatiquement (un approbateur « priorité élevée » ne sera
          proposé que pour les tickets critiques).
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ContactAutocomplete — combobox semi-automatique sur les contacts d'une
// organisation. Tri alphabétique par défaut (lastName, firstName), filtrage
// substring case-insensitive, sélection au clic ou avec Enter.
// ---------------------------------------------------------------------------
interface ContactAutocompleteContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobTitle?: string;
}

function ContactAutocomplete({
  contacts,
  onPick,
}: {
  contacts: ContactAutocompleteContact[];
  onPick: (c: ContactAutocompleteContact) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Tri alphabétique stable (lastName puis firstName, locale fr-CA pour
  // gérer les accents correctement).
  const sortedContacts = useMemo(() => {
    return [...contacts].sort((a, b) => {
      const cmp = a.lastName.localeCompare(b.lastName, "fr-CA");
      if (cmp !== 0) return cmp;
      return a.firstName.localeCompare(b.firstName, "fr-CA");
    });
  }, [contacts]);

  const filtered = useMemo(() => {
    if (!query.trim()) return sortedContacts;
    const q = query.toLowerCase();
    return sortedContacts.filter((c) =>
      `${c.firstName} ${c.lastName} ${c.email} ${c.jobTitle ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [sortedContacts, query]);

  // Ferme le dropdown au clic en dehors.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(c: ContactAutocompleteContact) {
    onPick(c);
    setQuery(`${c.firstName} ${c.lastName}`);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
        Sélectionner un contact existant
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered.length === 1) {
            e.preventDefault();
            pick(filtered[0]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Tapez un nom, une fonction, un email…"
        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-slate-400">
              Aucun contact trouvé
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-blue-50/60"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-900 truncate">
                    {c.firstName} {c.lastName}
                  </div>
                  <div className="text-[11.5px] text-slate-500 truncate">
                    {c.email}
                    {c.jobTitle ? ` · ${c.jobTitle}` : ""}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-500">
        Les champs ci-dessous se rempliront automatiquement. Vous pouvez les
        ajuster avant d&apos;enregistrer.
      </p>
    </div>
  );
}
