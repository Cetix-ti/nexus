"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, Plus, Trash2, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";

interface Procedure {
  id: string;
  title: string;
  kind: "INSTALL" | "CONFIG" | "UNINSTALL" | "TROUBLESHOOT" | "UPGRADE" | "OTHER";
  body: string;
  version: number;
  softwareTemplateId: string | null;
  softwareInstanceId: string | null;
}

const KIND_LABELS: Record<Procedure["kind"], string> = {
  INSTALL: "Installation", CONFIG: "Configuration", UNINSTALL: "Désinstallation",
  TROUBLESHOOT: "Dépannage", UPGRADE: "Mise à jour", OTHER: "Autre",
};

interface Props {
  softwareTemplateId?: string;
  softwareInstanceId?: string;
  /** Si instance, on charge aussi les procédures du template lié pour héritage. */
  inheritedFromTemplateId?: string | null;
}

export function SoftwareProceduresSection({ softwareTemplateId, softwareInstanceId, inheritedFromTemplateId }: Props) {
  const [own, setOwn] = useState<Procedure[]>([]);
  const [inherited, setInherited] = useState<Procedure[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (softwareTemplateId) params.set("templateId", softwareTemplateId);
    if (softwareInstanceId) params.set("instanceId", softwareInstanceId);
    const r = await fetch(`/api/v1/software/procedures?${params.toString()}`);
    if (r.ok) setOwn(await r.json());
    if (softwareInstanceId && inheritedFromTemplateId) {
      const r2 = await fetch(`/api/v1/software/procedures?templateId=${inheritedFromTemplateId}`);
      if (r2.ok) setInherited(await r2.json());
    }
  }, [softwareTemplateId, softwareInstanceId, inheritedFromTemplateId]);

  useEffect(() => { void load(); }, [load]);

  async function create(form: { title: string; kind: Procedure["kind"]; body: string }) {
    const r = await fetch(`/api/v1/software/procedures`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, softwareTemplateId, softwareInstanceId }),
    });
    if (r.ok) { setCreating(false); await load(); }
  }
  async function remove(id: string) {
    if (!confirm("Supprimer cette procédure ?")) return;
    const r = await fetch(`/api/v1/software/procedures/${id}`, { method: "DELETE" });
    if (r.ok) await load();
  }

  return (
    <Card>
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-slate-900 inline-flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-slate-500" /> Procédures
          </h3>
          <Button size="sm" variant="outline" onClick={() => setCreating((v) => !v)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Procédure
          </Button>
        </div>

        {creating && <NewProcedureForm onCancel={() => setCreating(false)} onSubmit={create} />}

        {own.length === 0 && inherited.length === 0 && !creating && (
          <p className="text-[12.5px] text-slate-500">Aucune procédure.</p>
        )}

        {own.map((p) => (
          <ProcedureItem key={p.id} proc={p} isOwn open={openId === p.id} onToggle={() => setOpenId((x) => x === p.id ? null : p.id)} onRemove={() => remove(p.id)} onSaved={load} />
        ))}

        {inherited.length > 0 && own.length === 0 && (
          <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 p-3">
            <div className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Héritées du modèle global</div>
            <div className="space-y-2">
              {inherited.map((p) => (
                <ProcedureItem key={p.id} proc={p} isOwn={false} open={openId === p.id} onToggle={() => setOpenId((x) => x === p.id ? null : p.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ProcedureItem({ proc, isOwn, open, onToggle, onRemove, onSaved }: {
  proc: Procedure; isOwn: boolean; open: boolean; onToggle: () => void; onRemove?: () => void; onSaved?: () => void;
}) {
  const [title, setTitle] = useState(proc.title);
  const [kind, setKind] = useState(proc.kind);
  const [body, setBody] = useState(proc.body);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!isOwn || !dirty) return;
    setSaving(true);
    const r = await fetch(`/api/v1/software/procedures/${proc.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, kind, body }),
    });
    setSaving(false);
    if (r.ok) { setDirty(false); onSaved?.(); }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <button className="w-full p-3 text-left flex items-center justify-between gap-3" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200">{KIND_LABELS[proc.kind]}</span>
          <span className="text-[13px] font-medium">{proc.title}</span>
          <span className="text-[10.5px] text-slate-400">v{proc.version}</span>
        </div>
        {isOwn && onRemove && (
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
        )}
      </button>
      {open && (
        <div className="border-t border-slate-100 p-3 space-y-2">
          {isOwn ? (
            <>
              <div className="grid gap-2 md:grid-cols-3">
                <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="md:col-span-2" />
                <select value={kind} onChange={(e) => { setKind(e.target.value as Procedure["kind"]); setDirty(true); }} className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
                  {(Object.entries(KIND_LABELS) as Array<[Procedure["kind"], string]>).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <AdvancedRichEditor value={body} onChange={(html) => { setBody(html); setDirty(true); }} placeholder="Étapes détaillées, captures, commandes." minHeight="200px" />
              <div className="flex justify-end">
                <Button size="sm" disabled={!dirty || saving} onClick={save}><Save className="h-4 w-4 mr-1.5" />{saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}</Button>
              </div>
            </>
          ) : (
            <div className="prose prose-sm max-w-none text-[13px] text-slate-700" dangerouslySetInnerHTML={{ __html: proc.body }} />
          )}
        </div>
      )}
    </div>
  );
}

function NewProcedureForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (f: { title: string; kind: Procedure["kind"]; body: string }) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Procedure["kind"]>("INSTALL");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    await onSubmit({ title: title.trim(), kind, body });
    setSaving(false);
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="grid gap-2 md:grid-cols-3">
        <Input placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} className="md:col-span-2" />
        <select value={kind} onChange={(e) => setKind(e.target.value as Procedure["kind"])} className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
          {(Object.entries(KIND_LABELS) as Array<[Procedure["kind"], string]>).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <AdvancedRichEditor value={body} onChange={setBody} placeholder="Étapes détaillées, captures, commandes." minHeight="200px" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Annuler</Button>
        <Button size="sm" onClick={submit} disabled={!title.trim() || saving}>{saving ? "Création…" : "Créer"}</Button>
      </div>
    </div>
  );
}
