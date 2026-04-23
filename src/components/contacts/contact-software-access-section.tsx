"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Package, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Access {
  id: string;
  accessLevel: "USER" | "ADMIN" | "APPROVER" | "NONE";
  grantedAt: string; revokedAt: string | null;
  note: string | null;
  instance: {
    id: string; name: string; vendor: string | null; version: string | null;
    category: { name: string; icon: string; color: string } | null;
  };
}

interface SoftwareOption {
  id: string; name: string; vendor: string | null;
}

const LEVEL_LABELS = { USER: "Utilisateur", ADMIN: "Administrateur", APPROVER: "Approbateur", NONE: "Aucun" } as const;
const LEVEL_COLORS: Record<Access["accessLevel"], string> = {
  USER: "bg-slate-100 text-slate-700 ring-slate-200",
  ADMIN: "bg-red-50 text-red-700 ring-red-200",
  APPROVER: "bg-amber-50 text-amber-800 ring-amber-200",
  NONE: "bg-slate-50 text-slate-400 ring-slate-200",
};

export function ContactSoftwareAccessSection({ contactId, organizationId }: { contactId: string; organizationId: string }) {
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [options, setOptions] = useState<SoftwareOption[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ softwareInstanceId: string; accessLevel: Access["accessLevel"]; note: string }>({
    softwareInstanceId: "", accessLevel: "USER", note: "",
  });

  const load = useCallback(async () => {
    const [rA, rO] = await Promise.all([
      fetch(`/api/v1/contacts/${contactId}/software-access`),
      fetch(`/api/v1/software/instances?orgId=${organizationId}`),
    ]);
    if (rA.ok) setAccesses(await rA.json());
    if (rO.ok) setOptions(await rO.json());
  }, [contactId, organizationId]);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!form.softwareInstanceId) return;
    const r = await fetch(`/api/v1/contacts/${contactId}/software-access`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (r.ok) { setAdding(false); setForm({ softwareInstanceId: "", accessLevel: "USER", note: "" }); await load(); }
  }
  async function revoke(id: string) {
    if (!confirm("Révoquer cet accès ?")) return;
    const r = await fetch(`/api/v1/contacts/${contactId}/software-access/${id}`, { method: "DELETE" });
    if (r.ok) await load();
  }

  const existingIds = new Set(accesses.map((a) => a.instance.id));
  const availableOptions = options.filter((o) => !existingIds.has(o.id));

  return (
    <Card>
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-slate-900 inline-flex items-center gap-1.5">
            <Package className="h-4 w-4 text-slate-500" /> Logiciels attribués
          </h3>
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)} disabled={availableOptions.length === 0} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </Button>
        </div>

        {adding && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="grid gap-2 md:grid-cols-2">
              <select value={form.softwareInstanceId} onChange={(e) => setForm({ ...form, softwareInstanceId: e.target.value })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
                <option value="">— Choisir un logiciel —</option>
                {availableOptions.map((o) => <option key={o.id} value={o.id}>{o.name}{o.vendor ? ` (${o.vendor})` : ""}</option>)}
              </select>
              <select value={form.accessLevel} onChange={(e) => setForm({ ...form, accessLevel: e.target.value as Access["accessLevel"] })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
                {Object.entries(LEVEL_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <input className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]" placeholder="Note (optionnelle)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Annuler</Button>
              <Button size="sm" onClick={add} disabled={!form.softwareInstanceId}>Ajouter</Button>
            </div>
          </div>
        )}

        {accesses.length === 0 ? (
          <p className="text-[12.5px] text-slate-500">Aucun accès logiciel attribué à ce contact.</p>
        ) : (
          <div className="space-y-1.5">
            {accesses.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                <Link href={`/software/${a.instance.id}`} className="flex-1 min-w-0 flex items-center gap-2">
                  {a.instance.category && <span style={{ color: a.instance.category.color }}>{a.instance.category.icon}</span>}
                  <span className="text-[13px] font-medium text-slate-900">{a.instance.name}</span>
                  {a.instance.vendor && <span className="text-[11.5px] text-slate-500">— {a.instance.vendor}</span>}
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${LEVEL_COLORS[a.accessLevel]}`}>{LEVEL_LABELS[a.accessLevel]}</span>
                  <button onClick={() => revoke(a.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
