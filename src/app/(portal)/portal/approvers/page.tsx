"use client";

// ============================================================================
// /portal/approvers — page de gestion de la cascade d'approbateurs
// pour l'administrateur du portail client.
//
// Permet d'ajouter/retirer/réordonner les approbateurs d'une organisation,
// et de configurer le délai d'escalade automatique vers le niveau suivant
// quand une approbation reste sans réponse.
// ============================================================================

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Mail, Clock, ShieldCheck, ChevronUp, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/page-loader";
import { PortalAccessRestricted } from "@/components/portal/access-restricted";
import { usePortalUser } from "@/lib/portal/use-portal-user";

interface Approver {
  id: string;
  contactId: string | null;
  contactName: string;
  contactEmail: string;
  jobTitle: string | null;
  level: number;
  isPrimary: boolean;
  scope: string;
  scopeMinAmount: number | null;
  escalateAfterHours: number | null;
  notifyByEmail: boolean;
  isActive: boolean;
  averageResponseHours: number | null;
  totalApproved: number;
  totalRejected: number;
}

interface ContactOption { id: string; name: string; email: string; jobTitle: string | null }

const ESCALATION_OPTIONS = [
  { value: null, label: "Pas d'escalade automatique" },
  { value: 4,   label: "Après 4 heures" },
  { value: 8,   label: "Après 8 heures (1 journée)" },
  { value: 24,  label: "Après 24 heures" },
  { value: 48,  label: "Après 48 heures (2 jours)" },
  { value: 72,  label: "Après 72 heures (3 jours)" },
  { value: 168, label: "Après 1 semaine" },
];

export default function PortalApproversPage() {
  const { permissions, organizationName } = usePortalUser();
  const isAdmin = permissions.portalRole === "admin";

  const [approvers, setApprovers] = useState<Approver[] | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/v1/portal/approvers", { cache: "no-store" });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${r.status}`);
      }
      const d = await r.json();
      setApprovers(d.approvers);
      setContacts(d.contacts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setApprovers([]);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin]);

  if (!isAdmin) return <PortalAccessRestricted title="Approbateurs" />;
  if (approvers === null) return <PageLoader />;

  async function patchApprover(id: string, patch: Partial<Approver>) {
    setBusy(id);
    setError(null);
    try {
      const r = await fetch("/api/v1/portal/approvers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${r.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function removeApprover(id: string, name: string) {
    if (!window.confirm(`Retirer ${name} de la cascade d'approbateurs ?`)) return;
    setBusy(id);
    setError(null);
    try {
      const r = await fetch(`/api/v1/portal/approvers?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${r.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // Tri par level croissant pour visualiser la cascade.
  const sorted = [...approvers].sort((a, b) => a.level - b.level || a.contactName.localeCompare(b.contactName));
  const usedContactIds = new Set(approvers.map((a) => a.contactId).filter(Boolean) as string[]);
  const availableContacts = contacts.filter((c) => !usedContactIds.has(c.id));

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900">
            Cascade d&apos;approbateurs
          </h1>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Configure les approbateurs pour {organizationName} et le délai avant escalade automatique au niveau supérieur.
          </p>
        </div>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-[12.5px] font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Ajouter un approbateur
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 ring-1 ring-red-200 px-4 py-2.5 text-[13px] text-red-800">
          {error}
        </div>
      )}

      {showAdd && (
        <AddApproverForm
          contacts={availableContacts}
          onCancel={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); void load(); }}
          existingLevels={approvers.map((a) => a.level)}
        />
      )}

      {sorted.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-slate-500 text-[13px]">
            Aucun approbateur configuré. Ajoutez le premier pour activer le workflow d&apos;approbation des billets.
          </div>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {sorted.map((a, idx) => (
              <li key={a.id} className="p-4 sm:p-5">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-semibold text-slate-900">{a.contactName}</span>
                      <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold px-2 py-0.5">
                        Niveau {a.level}
                      </span>
                      {a.isPrimary && (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold px-2 py-0.5">
                          Primaire
                        </span>
                      )}
                      {!a.isActive && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold px-2 py-0.5">
                          Inactif
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-slate-500 flex-wrap">
                      <Mail className="h-3 w-3" />
                      <span>{a.contactEmail}</span>
                      {a.jobTitle && (<><span>·</span><span>{a.jobTitle}</span></>)}
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                      <div>
                        <label className="block text-[10.5px] font-medium uppercase tracking-wider text-slate-500 mb-1">
                          Niveau (cascade)
                        </label>
                        <input
                          type="number" min={1} max={9}
                          defaultValue={a.level}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value);
                            if (v && v !== a.level) patchApprover(a.id, { level: v });
                          }}
                          className="w-20 h-7 text-[12.5px] rounded-md border border-slate-200 bg-white px-2"
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] font-medium uppercase tracking-wider text-slate-500 mb-1">
                          Délai d&apos;escalade
                        </label>
                        <select
                          value={a.escalateAfterHours ?? ""}
                          onChange={(e) => {
                            const v = e.target.value === "" ? null : parseInt(e.target.value);
                            patchApprover(a.id, { escalateAfterHours: v });
                          }}
                          className="w-full h-7 text-[12.5px] rounded-md border border-slate-200 bg-white px-2"
                        >
                          {ESCALATION_OPTIONS.map((o) => (
                            <option key={String(o.value)} value={o.value ?? ""}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {idx > 0 && (
                      <button
                        onClick={() => patchApprover(a.id, { level: Math.max(1, a.level - 1) })}
                        disabled={busy === a.id}
                        className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-blue-700 hover:bg-blue-50"
                        title="Monter d'un niveau"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                    )}
                    {idx < sorted.length - 1 && (
                      <button
                        onClick={() => patchApprover(a.id, { level: a.level + 1 })}
                        disabled={busy === a.id}
                        className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-blue-700 hover:bg-blue-50"
                        title="Descendre d'un niveau"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => removeApprover(a.id, a.contactName)}
                      disabled={busy === a.id}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"
                      title="Retirer"
                    >
                      {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-[12px] text-amber-900">
        <p className="font-semibold mb-1 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" /> Comment fonctionne l&apos;escalade ?
        </p>
        <p>
          Quand une approbation reste sans réponse au niveau N pendant le délai configuré, Nexus la bascule automatiquement au niveau N+1 et lui envoie un courriel. Le niveau N reçoit aussi un rappel. Si plusieurs approbateurs partagent le même niveau, ils reçoivent tous la notification.
        </p>
      </div>
    </div>
  );
}

function AddApproverForm({
  contacts, onCancel, onSaved, existingLevels,
}: {
  contacts: ContactOption[];
  onCancel: () => void;
  onSaved: () => void;
  existingLevels: number[];
}) {
  const [contactId, setContactId] = useState<string>("");
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [level, setLevel] = useState<number>(
    Math.max(1, ...existingLevels) + (existingLevels.length > 0 ? 1 : 0),
  );
  const [escalateAfterHours, setEscalateAfterHours] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const useManual = !contactId;

  async function submit() {
    if (useManual && (!manualName.trim() || !manualEmail.trim())) {
      setErr("Nom et courriel requis pour un approbateur externe.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const body = useManual
        ? { contactName: manualName.trim(), contactEmail: manualEmail.trim(),
            level, escalateAfterHours }
        : { contactId, level, escalateAfterHours };
      const r = await fetch("/api/v1/portal/approvers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${r.status}`);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="p-4 sm:p-5 space-y-3">
        <h3 className="text-[14px] font-semibold text-slate-900">Ajouter un approbateur</h3>

        <div>
          <label className="block text-[12px] font-medium text-slate-700 mb-1">
            Contact existant (recommandé)
          </label>
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-[13px]"
            disabled={contacts.length === 0}
          >
            <option value="">— Approbateur externe (saisir manuellement) —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.email}
                {c.jobTitle ? ` — ${c.jobTitle}` : ""}
              </option>
            ))}
          </select>
          {contacts.length === 0 && (
            <p className="mt-1 text-[11px] text-slate-500 italic">
              Tous les contacts actifs de l&apos;organisation sont déjà approbateurs. Vous pouvez ajouter un approbateur externe ci-dessous.
            </p>
          )}
        </div>

        {useManual && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <div>
              <label className="block text-[11.5px] font-medium text-slate-700 mb-1">Nom complet</label>
              <input
                type="text" value={manualName} onChange={(e) => setManualName(e.target.value)}
                className="w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-[12.5px]"
                placeholder="ex. Marie Tremblay"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-slate-700 mb-1">Courriel</label>
              <input
                type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)}
                className="w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-[12.5px]"
                placeholder="marie@externe.com"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-medium text-slate-700 mb-1">
              Niveau (cascade)
            </label>
            <input
              type="number" min={1} max={9}
              value={level} onChange={(e) => setLevel(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-[13px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-slate-700 mb-1">
              Délai d&apos;escalade
            </label>
            <select
              value={escalateAfterHours ?? ""}
              onChange={(e) => setEscalateAfterHours(e.target.value === "" ? null : parseInt(e.target.value))}
              className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-[13px]"
            >
              {ESCALATION_OPTIONS.map((o) => (
                <option key={String(o.value)} value={o.value ?? ""}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {err && (
          <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-[12px] text-red-800">{err}</div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onCancel} disabled={submitting}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-slate-700 hover:bg-slate-100"
          >
            Annuler
          </button>
          <button
            onClick={submit} disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Ajouter
          </button>
        </div>
      </div>
    </Card>
  );
}
