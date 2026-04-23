"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Save, Trash2, Building2, Upload, Link as LinkIcon, Copy, KeyRound,
  Package, UserCog, Globe,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import { AiInlinePanel } from "@/components/shared/ai-inline-panel";
import type { AiAction } from "@/components/shared/ai-actions-bar";
import { VisibilityPicker } from "@/components/shared/visibility-picker";
import type { Visibility } from "@/components/shared/visibility-picker";
import { SyncBadge } from "@/components/shared/sync-badge";
import { RelationsPanel } from "@/components/shared/relations-panel";
import { PageLoader } from "@/components/ui/page-loader";
import { SoftwareProceduresSection } from "@/components/software/software-procedures-section";

interface Installer {
  id: string;
  title: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  scope: "GLOBAL" | "ORG";
  createdAt: string;
  _count: { downloadLinks: number };
}

interface License {
  id: string;
  scope: "GLOBAL_POOL" | "ORG" | "PER_SEAT" | "PER_USER";
  licenseKey: string | null;
  seats: number | null;
  usedSeats: number | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
}

interface Instance {
  id: string;
  name: string;
  vendor: string | null;
  version: string | null;
  bodyOverride: string | null;
  visibility: Visibility;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  syncState: "IN_SYNC" | "DRIFTED" | "DETACHED";
  allowEnglishUI: boolean | null;
  organization: { id: string; name: string; slug: string };
  category: { id: string; name: string; icon: string; color: string } | null;
  template: { id: string; name: string; schemaVersion: number; body: string; vendor: string | null; version: string | null } | null;
  responsibleClientContact: { id: string; firstName: string; lastName: string; email: string } | null;
  responsibleCetixUser: { id: string; firstName: string; lastName: string; email: string } | null;
  installers: Installer[];
  licenses: License[];
  updatedBy: { firstName: string; lastName: string } | null;
}

interface Cat { id: string; name: string; icon: string }
interface Contact { id: string; firstName: string; lastName: string }
interface AgentUser { id: string; firstName: string; lastName: string }

export default function SoftwareInstanceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Instance | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [orgContacts, setOrgContacts] = useState<Contact[]>([]);
  const [cetixUsers, setCetixUsers] = useState<AgentUser[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/software/instances/${params.id}`);
    if (!r.ok) return;
    const d = await r.json();
    setData(d);
    setDirty(false);
    if (!cats.length) {
      const rc = await fetch(`/api/v1/software/categories`);
      if (rc.ok) setCats(await rc.json());
    }
    // Contacts de l'org (pour responsable client)
    const rcon = await fetch(`/api/v1/contacts?organizationId=${d.organization.id}&limit=500`).catch(() => null);
    if (rcon?.ok) {
      const data = await rcon.json();
      setOrgContacts(Array.isArray(data) ? data : data?.items ?? []);
    }
    const ru = await fetch(`/api/v1/users?limit=500`).catch(() => null);
    if (ru?.ok) {
      const data = await ru.json();
      setCetixUsers(Array.isArray(data) ? data : data?.items ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  function patch<K extends keyof Instance>(k: K, v: Instance[K]) {
    setData((x) => (x ? { ...x, [k]: v } : x));
    setDirty(true);
  }

  async function save() {
    if (!data || !dirty) return;
    setSaving(true);
    const res = await fetch(`/api/v1/software/instances/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        vendor: data.vendor,
        version: data.version,
        bodyOverride: data.bodyOverride,
        visibility: data.visibility,
        status: data.status,
        allowEnglishUI: data.allowEnglishUI,
        responsibleClientContactId: data.responsibleClientContact?.id ?? null,
        responsibleCetixUserId: data.responsibleCetixUser?.id ?? null,
        categoryId: data.category?.id ?? null,
      }),
    });
    setSaving(false);
    if (res.ok) await load();
  }

  async function remove() {
    if (!data) return;
    if (!confirm(`Supprimer le logiciel « ${data.name} » de ce client ?`)) return;
    const res = await fetch(`/api/v1/software/instances/${data.id}`, { method: "DELETE" });
    if (res.ok) router.push(`/software?orgId=${data.organization.id}`);
  }

  async function realign() {
    if (!data) return;
    const res = await fetch(`/api/v1/software/instances/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ realignToTemplate: true }),
    });
    if (res.ok) await load();
  }

  async function detach() {
    if (!data) return;
    if (!confirm("Détacher du modèle global ? Le lien sera rompu.")) return;
    const res = await fetch(`/api/v1/software/instances/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detachFromTemplate: true }),
    });
    if (res.ok) await load();
  }

  // Fichier sélectionné en attente de titre (remplace prompt() natif)
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingTitle, setPendingTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  function onFilePicked(file: File) {
    setPendingFile(file);
    setPendingTitle(file.name);
  }
  async function confirmUpload() {
    if (!data || !pendingFile || !pendingTitle.trim()) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", pendingFile);
    form.append("title", pendingTitle.trim());
    const r = await fetch(`/api/v1/software/instances/${data.id}/installers`, { method: "POST", body: form });
    setUploading(false);
    if (r.ok) { setPendingFile(null); setPendingTitle(""); await load(); }
  }

  if (!data) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <Link href={`/software?orgId=${data.organization.id}`} className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={remove}><Trash2 className="h-4 w-4 mr-1.5" /> Supprimer</Button>
          <Button size="sm" disabled={!dirty || saving} onClick={save}>
            <Save className="h-4 w-4 mr-1.5" />{saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
            <Building2 className="h-3.5 w-3.5" />
            <Link href={`/organisations/${data.organization.slug}`} className="hover:text-blue-600">{data.organization.name}</Link>
            {data.template && (
              <>
                <span>·</span>
                <Link href={`/software/templates/${data.template.id}`} className="hover:text-blue-600 inline-flex items-center gap-1">
                  <Package className="h-3 w-3" /> Modèle « {data.template.name} »
                </Link>
                <SyncBadge state={data.syncState} onClick={data.syncState === "DRIFTED" ? realign : undefined} />
                {data.syncState === "DRIFTED" && (
                  <Button variant="outline" size="sm" onClick={realign} className="h-6 text-[11px] px-2">Réaligner</Button>
                )}
                {data.syncState !== "DETACHED" && (
                  <Button variant="outline" size="sm" onClick={detach} className="h-6 text-[11px] px-2">Détacher</Button>
                )}
              </>
            )}
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <Input value={data.name} onChange={(e) => patch("name", e.target.value)} className="text-[20px] font-semibold border-transparent shadow-none px-0 focus-visible:ring-0" />
              <div className="mt-1 grid gap-2 md:grid-cols-2">
                <div>
                  <label className="text-[11.5px] text-slate-500">Éditeur</label>
                  <Input value={data.vendor ?? ""} onChange={(e) => patch("vendor", e.target.value)} placeholder="Ex : Microsoft" />
                </div>
                <div>
                  <label className="text-[11.5px] text-slate-500">Version</label>
                  <Input value={data.version ?? ""} onChange={(e) => patch("version", e.target.value)} />
                </div>
              </div>
            </div>
            <VisibilityPicker value={data.visibility} onChange={(v) => patch("visibility", v)} />
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          {/* Actions IA */}
          <Card>
            <div className="p-4">
              <AiInlinePanel
                kind="software_instance"
                id={data.id}
                onApply={(cap: AiAction, text: string) => {
                  if (cap === "correct" || cap === "rewrite" || cap === "restructure") patch("bodyOverride", text);
                }}
              />
            </div>
          </Card>

          {/* Documentation */}
          <Card>
            <div className="p-5 space-y-3">
              <h3 className="text-[14px] font-semibold text-slate-900">Documentation</h3>
              <AdvancedRichEditor
                value={data.bodyOverride ?? ""}
                onChange={(html) => patch("bodyOverride", html)}
                placeholder={data.template ? "Vide = hérite de la documentation du modèle global." : "Texte enrichi — images, listes, tableaux, code."}
                minHeight="280px"
              />
              {data.template && !data.bodyOverride && (
                <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase mb-1">Héritée du modèle global</div>
                  <pre className="whitespace-pre-wrap text-[12px] text-slate-700">{data.template.body || "(aucune documentation sur le modèle)"}</pre>
                </div>
              )}
            </div>
          </Card>

          {/* Procédures */}
          <SoftwareProceduresSection
            softwareInstanceId={data.id}
            inheritedFromTemplateId={data.template?.id ?? null}
          />

          {/* Installeurs */}
          <Card>
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-[14px] font-semibold text-slate-900">Fichiers d'installation</h3>
                <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} className="gap-1.5">
                  <Upload className="h-4 w-4" /> Téléverser
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onFilePicked(f); e.target.value = ""; }}
                />
              </div>
              {pendingFile && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <p className="text-[11.5px] text-slate-600">Fichier : <strong>{pendingFile.name}</strong> ({(pendingFile.size / 1048576).toFixed(1)} Mo)</p>
                  <Input value={pendingTitle} onChange={(e) => setPendingTitle(e.target.value)} placeholder="Titre de l'installeur" />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setPendingFile(null); setPendingTitle(""); }}>Annuler</Button>
                    <Button size="sm" disabled={!pendingTitle.trim() || uploading} onClick={confirmUpload}>{uploading ? "Téléversement…" : "Téléverser"}</Button>
                  </div>
                </div>
              )}
              {data.installers.length === 0 ? (
                <p className="text-[12.5px] text-slate-500">Aucun installeur.</p>
              ) : (
                <div className="space-y-2">
                  {data.installers.map((i) => (
                    <InstallerRow key={i.id} installer={i} instanceId={data.id} onReload={load} />
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Licences */}
          <Card>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-slate-900">Licences</h3>
                <CreateLicenseButton instance={data} onReload={load} />
              </div>
              {data.licenses.length === 0 ? (
                <p className="text-[12.5px] text-slate-500">Aucune licence enregistrée pour ce logiciel.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.licenses.map((l) => <LicenseRow key={l.id} license={l} onReload={load} />)}
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <RelationsPanel sourceType="software_instance" sourceId={data.id} />
          {/* Responsabilités */}
          <Card>
            <div className="p-4 space-y-3">
              <h3 className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5">
                <UserCog className="h-4 w-4 text-slate-500" /> Responsabilités
              </h3>
              <div>
                <label className="text-[11.5px] text-slate-500">Responsable chez le client</label>
                <select
                  value={data.responsibleClientContact?.id ?? ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const c = orgContacts.find((x) => x.id === id);
                    patch("responsibleClientContact", c ? { id: c.id, firstName: c.firstName, lastName: c.lastName, email: "" } : null);
                  }}
                  className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12.5px]"
                >
                  <option value="">—</option>
                  {orgContacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-slate-500">Responsable chez Cetix</label>
                <select
                  value={data.responsibleCetixUser?.id ?? ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const u = cetixUsers.find((x) => x.id === id);
                    patch("responsibleCetixUser", u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, email: "" } : null);
                  }}
                  className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12.5px]"
                >
                  <option value="">—</option>
                  {cetixUsers.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                </select>
              </div>
            </div>
          </Card>

          {/* Catégorie + UI anglais */}
          <Card>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[11.5px] text-slate-500 mb-1 block">Catégorie</label>
                <select
                  value={data.category?.id ?? ""}
                  onChange={(e) => {
                    const c = cats.find((x) => x.id === e.target.value);
                    patch("category", c ? { id: c.id, name: c.name, icon: c.icon, color: "#8B5CF6" } : null);
                  }}
                  className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12.5px]"
                >
                  <option value="">—</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-slate-500 mb-1 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Interface anglaise
                </label>
                <div className="flex gap-1.5">
                  {[
                    { v: null, label: "Hériter org" },
                    { v: true, label: "Autorisée" },
                    { v: false, label: "Interdite" },
                  ].map((opt) => (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => patch("allowEnglishUI", opt.v as boolean | null)}
                      className={`rounded-md px-2 py-1 text-[11.5px] ring-1 ring-inset ${
                        data.allowEnglishUI === opt.v ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function InstallerRow({ installer, instanceId, onReload }: { installer: Installer; instanceId: string; onReload: () => Promise<void> }) {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ url: string; pin: string | null } | null>(null);
  const mb = (installer.sizeBytes / (1024 * 1024)).toFixed(1);

  async function genLink(withPin: boolean) {
    setGenerating(true);
    const r = await fetch(`/api/v1/software/instances/${instanceId}/download-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installerId: installer.id, withPin, maxDownloads: 5 }),
    });
    setGenerating(false);
    if (!r.ok) { alert("Erreur"); return; }
    const d = await r.json();
    setResult({ url: d.url, pin: d.pin });
    await onReload();
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-slate-900 truncate">{installer.title}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ring-inset ${
              installer.scope === "GLOBAL" ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-blue-50 text-blue-700 ring-blue-200"
            }`}>{installer.scope === "GLOBAL" ? "global" : "client"}</span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-slate-500 truncate">{installer.filename} · {mb} Mo</p>
          {installer._count.downloadLinks > 0 && (
            <p className="text-[11px] text-slate-400">{installer._count.downloadLinks} lien(s) générés</p>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button variant="outline" size="sm" disabled={generating} onClick={() => genLink(false)} className="gap-1.5 h-7 text-[11.5px]">
            <LinkIcon className="h-3.5 w-3.5" /> Lien public
          </Button>
          <Button variant="outline" size="sm" disabled={generating} onClick={() => genLink(true)} className="gap-1.5 h-7 text-[11.5px]">
            <KeyRound className="h-3.5 w-3.5" /> Avec PIN
          </Button>
        </div>
      </div>

      {result && (
        <div className="mt-3 rounded-md bg-emerald-50 border border-emerald-200 p-3 space-y-2">
          <p className="text-[11.5px] font-semibold text-emerald-800">Lien généré — copiez-le maintenant, il ne sera plus affiché.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] bg-white rounded px-2 py-1.5 ring-1 ring-emerald-200 break-all">{result.url}</code>
            <Button size="sm" variant="outline" className="h-7" onClick={() => navigator.clipboard.writeText(result.url)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          {result.pin && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-600">Code :</span>
              <code className="text-[13px] font-semibold bg-white rounded px-2 py-1 ring-1 ring-emerald-200">{result.pin}</code>
              <Button size="sm" variant="outline" className="h-7" onClick={() => navigator.clipboard.writeText(result.pin!)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <p className="text-[11px] text-emerald-700">Expire dans 72h · 5 téléchargements max · audité.</p>
          <button onClick={() => setResult(null)} className="text-[11px] text-emerald-700 hover:text-emerald-900 underline">Masquer</button>
        </div>
      )}
    </div>
  );
}

function CreateLicenseButton({ instance, onReload }: { instance: Instance; onReload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"ORG" | "PER_SEAT" | "PER_USER">("ORG");
  const [key, setKey] = useState("");
  const [seats, setSeats] = useState<string>("");
  const [endDate, setEndDate] = useState("");

  async function create() {
    const res = await fetch(`/api/v1/software/licenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        softwareInstanceId: instance.id,
        organizationId: instance.organization.id,
        licenseKey: key || null,
        seats: seats ? Number(seats) : null,
        endDate: endDate || null,
      }),
    });
    if (res.ok) { setOpen(false); setKey(""); setSeats(""); setEndDate(""); await onReload(); }
  }

  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>+ Ajouter</Button>;
  return (
    <div className="w-full rounded-md border border-slate-200 p-3 space-y-2">
      <div className="flex gap-1.5">
        {(["ORG", "PER_SEAT", "PER_USER"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setScope(s)} className={`rounded px-2 py-1 text-[11px] ring-1 ring-inset ${
            scope === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200"
          }`}>
            {s === "ORG" ? "Client (site)" : s === "PER_SEAT" ? "Par poste" : "Par utilisateur"}
          </button>
        ))}
      </div>
      <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Clé / identifiant de licence" />
      <div className="grid grid-cols-2 gap-2">
        <Input value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="Nombre de places" type="number" />
        <Input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" />
      </div>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
        <Button size="sm" onClick={create}>Créer</Button>
      </div>
    </div>
  );
}

function LicenseRow({ license, onReload }: { license: License; onReload: () => Promise<void> }) {
  async function del() {
    if (!confirm("Supprimer cette licence ?")) return;
    const r = await fetch(`/api/v1/software/licenses/${license.id}`, { method: "DELETE" });
    if (r.ok) await onReload();
  }
  const label =
    license.scope === "ORG" ? "Site" :
    license.scope === "PER_SEAT" ? "Poste" :
    license.scope === "PER_USER" ? "Utilisateur" :
    "Pool";
  return (
    <div className="py-2 flex items-center justify-between gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200">{label}</span>
          {license.licenseKey && <code className="text-[11.5px] text-slate-700 truncate">{license.licenseKey}</code>}
          {license.seats != null && <span className="text-[11px] text-slate-500">· {license.usedSeats ?? 0}/{license.seats}</span>}
        </div>
        {license.endDate && (
          <p className="text-[11px] text-slate-500 mt-0.5">Expire : {new Date(license.endDate).toLocaleDateString("fr-CA")}</p>
        )}
      </div>
      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={del}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );
}
