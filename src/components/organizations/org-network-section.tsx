"use client";

// ============================================================================
// OrgNetworkSection — infrastructure réseau d'un client (onglet Sites)
//
// Regroupe deux blocs :
//   1. Liens Internet & IPs publiques (modèles : OrgInternetLink,
//      OrgIpBlock) — un lien = une souscription ISP, optionnellement
//      rattachée à un site, pouvant porter 0..N blocs IP (SINGLE/RANGE/
//      SUBNET).
//   2. VLANs par site (SiteVlan) — VLAN ID + nom + DHCP + DNS par site.
//
// Les actions sont CRUD direct sur les endpoints REST :
//   - /api/v1/organizations/[id]/internet-links (+ /[linkId] · + /ip-blocks)
//   - /api/v1/sites/[siteId]/vlans (+ /[vlanId])
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, X, Wifi, Network, ChevronDown, ChevronRight, Save, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface SiteLite { id: string; name: string }

type IpBlockKind = "SINGLE" | "RANGE" | "SUBNET";
interface IpBlock {
  id: string;
  kind: IpBlockKind;
  value: string;
  label: string | null;
}
interface InternetLink {
  id: string;
  siteId: string | null;
  isp: string;
  label: string | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  gateway: string | null;
  dnsPrimary: string | null;
  dnsSecondary: string | null;
  notes: string | null;
  ipBlocks: IpBlock[];
}
interface SiteVlan {
  id: string;
  vlanId: number;
  name: string;
  dhcpServer: string | null;
  dnsPrimary: string | null;
  dnsSecondary: string | null;
  description: string | null;
}

const IP_KIND_LABEL: Record<IpBlockKind, string> = {
  SINGLE: "IP",
  RANGE: "Plage",
  SUBNET: "Subnet",
};

const IP_KIND_PLACEHOLDER: Record<IpBlockKind, string> = {
  SINGLE: "203.0.113.45",
  RANGE: "203.0.113.40-203.0.113.45",
  SUBNET: "203.0.113.0/29",
};

export function OrgNetworkSection({
  organizationId,
  sites,
}: {
  organizationId: string;
  sites: SiteLite[];
}) {
  return (
    <div className="space-y-6 mt-8">
      <OrgInternetLinksCard organizationId={organizationId} sites={sites} />
      <SiteVlansCard sites={sites} />
    </div>
  );
}

// ============================================================================
// Bloc 1 : Liens Internet & IPs publiques
// ============================================================================
function OrgInternetLinksCard({
  organizationId,
  sites,
}: {
  organizationId: string;
  sites: SiteLite[];
}) {
  const [links, setLinks] = useState<InternetLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/v1/organizations/${organizationId}/internet-links`);
      const d = r.ok ? await r.json() : { data: [] };
      setLinks(Array.isArray(d.data) ? d.data : []);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const siteNameById = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);

  async function deleteLink(linkId: string) {
    if (!confirm("Supprimer ce lien Internet et ses blocs IP ?")) return;
    const r = await fetch(`/api/v1/organizations/${organizationId}/internet-links/${linkId}`, { method: "DELETE" });
    if (r.ok) setLinks((prev) => prev.filter((l) => l.id !== linkId));
  }

  const isEditing = creating || editingId !== null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-cyan-50 flex items-center justify-center">
            <Wifi className="h-4.5 w-4.5 text-cyan-700" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">
              Liens Internet &amp; IPs publiques
            </h3>
            <p className="text-[11.5px] text-slate-500 mt-0.5">
              Souscriptions ISP, débits, gateway, DNS et blocs d&apos;IPs statiques
            </p>
          </div>
        </div>
        {!isEditing && (
          <Button variant="primary" size="sm" onClick={() => { setEditingId(null); setCreating(true); }}>
            <Plus className="h-3.5 w-3.5" />
            Nouveau lien
          </Button>
        )}
      </div>

      {(creating || editingId) && (
        <LinkFormRow
          organizationId={organizationId}
          sites={sites}
          link={editingId ? links.find((l) => l.id === editingId) ?? null : null}
          onCancel={() => { setCreating(false); setEditingId(null); }}
          onSaved={(saved) => {
            if (creating) setLinks((prev) => [...prev, saved]);
            else setLinks((prev) => prev.map((l) => (l.id === saved.id ? { ...l, ...saved, ipBlocks: l.ipBlocks } : l)));
            setCreating(false);
            setEditingId(null);
          }}
        />
      )}

      {loading ? (
        <div className="p-10 text-center text-[12.5px] text-slate-400">Chargement…</div>
      ) : links.length === 0 && !isEditing ? (
        <div className="p-10 text-center text-[13px] text-slate-400">
          <Wifi className="h-6 w-6 mx-auto mb-2 text-slate-300" />
          Aucun lien Internet configuré pour ce client.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {links.map((l) => (
            <LinkRow
              key={l.id}
              organizationId={organizationId}
              link={l}
              siteName={l.siteId ? (siteNameById.get(l.siteId) ?? null) : null}
              onEdit={() => { setCreating(false); setEditingId(l.id); }}
              onDelete={() => deleteLink(l.id)}
              onIpBlocksChanged={(blocks) =>
                setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, ipBlocks: blocks } : x)))
              }
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

interface DraftBlock {
  _key: string;
  kind: IpBlockKind;
  value: string;
  label: string;
}

function LinkFormRow({
  organizationId,
  sites,
  link,
  onCancel,
  onSaved,
}: {
  organizationId: string;
  sites: SiteLite[];
  link: InternetLink | null;
  onCancel: () => void;
  onSaved: (l: InternetLink) => void;
}) {
  const [isp, setIsp] = useState(link?.isp ?? "");
  const [label, setLabel] = useState(link?.label ?? "");
  const [siteId, setSiteId] = useState<string>(link?.siteId ?? "__none__");
  const [downloadMbps, setDown] = useState(link?.downloadMbps?.toString() ?? "");
  const [uploadMbps, setUp] = useState(link?.uploadMbps?.toString() ?? "");
  const [gateway, setGateway] = useState(link?.gateway ?? "");
  const [dnsPrimary, setDns1] = useState(link?.dnsPrimary ?? "");
  const [dnsSecondary, setDns2] = useState(link?.dnsSecondary ?? "");
  const [notes, setNotes] = useState(link?.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Inline IP blocks (draft state — only for new link creation)
  const [draftBlocks, setDraftBlocks] = useState<DraftBlock[]>([]);
  const [ipKind, setIpKind] = useState<IpBlockKind>("SINGLE");
  const [ipValue, setIpValue] = useState("");
  const [ipLabel, setIpLabel] = useState("");

  function addDraftBlock() {
    if (!ipValue.trim()) return;
    setDraftBlocks((prev) => [
      ...prev,
      { _key: String(Date.now() + Math.random()), kind: ipKind, value: ipValue.trim(), label: ipLabel.trim() },
    ]);
    setIpValue("");
    setIpLabel("");
  }

  async function save() {
    if (!isp.trim() || saving) return;
    setSaving(true);
    try {
      const payload = {
        siteId: siteId === "__none__" ? null : siteId,
        isp: isp.trim(),
        label: label.trim() || null,
        downloadMbps: downloadMbps === "" ? null : Number(downloadMbps),
        uploadMbps: uploadMbps === "" ? null : Number(uploadMbps),
        gateway: gateway.trim() || null,
        dnsPrimary: dnsPrimary.trim() || null,
        dnsSecondary: dnsSecondary.trim() || null,
        notes: notes.trim() || null,
      };
      const url = link
        ? `/api/v1/organizations/${organizationId}/internet-links/${link.id}`
        : `/api/v1/organizations/${organizationId}/internet-links`;
      const r = await fetch(url, {
        method: link ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error ?? `Erreur HTTP ${r.status}`);
        return;
      }
      const d = await r.json();
      const savedLink: InternetLink = d.data;

      // For new links, persist any draft IP blocks sequentially
      if (!link && draftBlocks.length > 0) {
        const createdBlocks: IpBlock[] = [];
        for (const block of draftBlocks) {
          const br = await fetch(
            `/api/v1/organizations/${organizationId}/internet-links/${savedLink.id}/ip-blocks`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: block.kind, value: block.value, label: block.label || null }),
            },
          );
          if (br.ok) {
            const bd = await br.json();
            createdBlocks.push(bd.data);
          }
        }
        onSaved({ ...savedLink, ipBlocks: createdBlocks });
      } else {
        onSaved(savedLink);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-slate-200 bg-blue-50/30 p-5 space-y-3">
      <h4 className="text-[13px] font-semibold text-slate-900">
        {link ? "Modifier le lien" : "Nouveau lien Internet"}
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Fournisseur ISP *"
          value={isp}
          onChange={(e) => setIsp(e.target.value)}
          placeholder="Bell, Vidéotron, TELUS, Cogeco…"
        />
        <Input
          label="Étiquette (facultatif)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Lien principal, Backup fibre…"
        />
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Site rattaché (facultatif)</label>
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Non rattaché à un site</SelectItem>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Download (Mbps)"
            type="number"
            value={downloadMbps}
            onChange={(e) => setDown(e.target.value)}
            placeholder="500"
          />
          <Input
            label="Upload (Mbps)"
            type="number"
            value={uploadMbps}
            onChange={(e) => setUp(e.target.value)}
            placeholder="50"
          />
        </div>
        <Input
          label="Gateway"
          value={gateway}
          onChange={(e) => setGateway(e.target.value)}
          placeholder="203.0.113.1"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="DNS primaire"
            value={dnsPrimary}
            onChange={(e) => setDns1(e.target.value)}
            placeholder="1.1.1.1"
          />
          <Input
            label="DNS secondaire"
            value={dnsSecondary}
            onChange={(e) => setDns2(e.target.value)}
            placeholder="8.8.8.8"
          />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
          placeholder="N° de compte, SLA, contact support ISP…"
        />
      </div>

      {/* Inline IP blocks section — only for new link creation */}
      {!link && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Network className="h-3.5 w-3.5 text-slate-500" />
            <h5 className="text-[12.5px] font-semibold text-slate-700">IPs statiques / Blocs (facultatif)</h5>
          </div>
          {draftBlocks.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {draftBlocks.map((b) => (
                <li key={b._key} className="py-1.5 flex items-center gap-2 text-[12px]">
                  <Badge variant="outline" className="text-[10px]">{IP_KIND_LABEL[b.kind]}</Badge>
                  <span className="font-mono text-slate-800">{b.value}</span>
                  {b.label && <span className="text-slate-500">· {b.label}</span>}
                  <button
                    type="button"
                    onClick={() => setDraftBlocks((prev) => prev.filter((x) => x._key !== b._key))}
                    className="ml-auto h-5 w-5 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 inline-flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
            <div className="w-full sm:w-28">
              <label className="block text-[11px] text-slate-500 mb-1">Type</label>
              <Select value={ipKind} onValueChange={(v) => setIpKind(v as IpBlockKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE">IP unique</SelectItem>
                  <SelectItem value="RANGE">Plage</SelectItem>
                  <SelectItem value="SUBNET">Subnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Valeur"
              value={ipValue}
              onChange={(e) => setIpValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraftBlock(); } }}
              placeholder={IP_KIND_PLACEHOLDER[ipKind]}
              className="flex-1 font-mono"
            />
            <Input
              label="Étiquette (fac.)"
              value={ipLabel}
              onChange={(e) => setIpLabel(e.target.value)}
              placeholder="NAT firewall"
              className="sm:w-40"
            />
            <Button type="button" variant="outline" size="sm" onClick={addDraftBlock} disabled={!ipValue.trim()}>
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
        <Button variant="primary" size="sm" onClick={save} disabled={!isp.trim() || saving}>
          <Save className="h-3.5 w-3.5" />
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}

function LinkRow({
  organizationId,
  link,
  siteName,
  onEdit,
  onDelete,
  onIpBlocksChanged,
}: {
  organizationId: string;
  link: InternetLink;
  siteName: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onIpBlocksChanged: (blocks: IpBlock[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  async function addBlock(kind: IpBlockKind, value: string, label: string) {
    const r = await fetch(`/api/v1/organizations/${organizationId}/internet-links/${link.id}/ip-blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, value, label: label || null }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error ?? `Erreur HTTP ${r.status}`);
      return;
    }
    const d = await r.json();
    onIpBlocksChanged([...link.ipBlocks, d.data]);
  }

  async function deleteBlock(blockId: string) {
    const r = await fetch(
      `/api/v1/organizations/${organizationId}/internet-links/${link.id}/ip-blocks/${blockId}`,
      { method: "DELETE" },
    );
    if (r.ok) onIpBlocksChanged(link.ipBlocks.filter((b) => b.id !== blockId));
  }

  return (
    <li className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-2 min-w-0 text-left"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
          <Globe2 className="h-4 w-4 text-cyan-600 shrink-0" />
          <span className="font-semibold text-slate-900 text-[13.5px]">{link.isp}</span>
          {link.label && <span className="text-[12px] text-slate-500">· {link.label}</span>}
          {siteName ? (
            <Badge variant="default" className="text-[10px]">{siteName}</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">Non rattaché</Badge>
          )}
          {(link.downloadMbps || link.uploadMbps) && (
            <span className="text-[11.5px] text-slate-500 tabular-nums">
              {link.downloadMbps ?? "?"}/{link.uploadMbps ?? "?"} Mbps
            </span>
          )}
          {link.ipBlocks.length > 0 && (
            <Badge variant="primary" className="text-[10px]">
              {link.ipBlocks.length} IP{link.ipBlocks.length > 1 ? "s" : ""}
            </Badge>
          )}
        </button>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="h-7 w-7 rounded-md text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 inline-flex items-center justify-center">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="h-7 w-7 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 inline-flex items-center justify-center">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 ml-6 space-y-3 pb-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-[11.5px]">
            <KeyValue k="Gateway" v={link.gateway} />
            <KeyValue k="DNS primaire" v={link.dnsPrimary} />
            <KeyValue k="DNS secondaire" v={link.dnsSecondary} />
            <KeyValue k="Débit" v={
              link.downloadMbps || link.uploadMbps
                ? `${link.downloadMbps ?? "?"} ↓ / ${link.uploadMbps ?? "?"} ↑ Mbps`
                : null
            } />
          </div>
          {link.notes && (
            <p className="text-[12px] text-slate-600 leading-relaxed whitespace-pre-line">
              {link.notes}
            </p>
          )}

          <IpBlocksEditor
            blocks={link.ipBlocks}
            onAdd={addBlock}
            onDelete={deleteBlock}
          />
        </div>
      )}
    </li>
  );
}

function KeyValue({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">{k}</span>
      <span className="text-slate-700 tabular-nums">{v || "—"}</span>
    </div>
  );
}

function IpBlocksEditor({
  blocks,
  onAdd,
  onDelete,
}: {
  blocks: IpBlock[];
  onAdd: (kind: IpBlockKind, value: string, label: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<IpBlockKind>("SINGLE");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await onAdd(kind, value.trim(), label.trim());
      setValue("");
      setLabel("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 mb-2">
        <Network className="h-3.5 w-3.5 text-slate-500" />
        <h5 className="text-[12px] font-semibold text-slate-700">IPs publiques / Blocs</h5>
      </div>
      {blocks.length > 0 && (
        <ul className="divide-y divide-slate-100 mb-3">
          {blocks.map((b) => (
            <li key={b.id} className="py-1.5 flex items-center gap-2 text-[12px]">
              <Badge variant="outline" className="text-[10px]">{IP_KIND_LABEL[b.kind]}</Badge>
              <span className="font-mono text-slate-800">{b.value}</span>
              {b.label && <span className="text-slate-500">· {b.label}</span>}
              <button
                onClick={() => onDelete(b.id)}
                className="ml-auto h-6 w-6 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 inline-flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
        <div className="w-full sm:w-28">
          <label className="block text-[11px] text-slate-500 mb-1">Type</label>
          <Select value={kind} onValueChange={(v) => setKind(v as IpBlockKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SINGLE">IP unique</SelectItem>
              <SelectItem value="RANGE">Plage</SelectItem>
              <SelectItem value="SUBNET">Subnet</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          label="Valeur"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={IP_KIND_PLACEHOLDER[kind]}
          className="flex-1 font-mono"
        />
        <Input
          label="Étiquette (fac.)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="NAT firewall"
          className="sm:w-40"
        />
        <Button variant="outline" size="sm" onClick={submit} disabled={!value.trim() || busy}>
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Bloc 2 : VLANs par site
// ============================================================================
function SiteVlansCard({ sites }: { sites: SiteLite[] }) {
  const [selectedSite, setSelectedSite] = useState<string>(sites[0]?.id ?? "");
  const [vlans, setVlans] = useState<SiteVlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Charge VLANs quand le site change
  useEffect(() => {
    if (!selectedSite) { setVlans([]); return; }
    setLoading(true);
    fetch(`/api/v1/sites/${selectedSite}/vlans`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setVlans(Array.isArray(d.data) ? d.data : []))
      .catch(() => setVlans([]))
      .finally(() => setLoading(false));
  }, [selectedSite]);

  async function deleteVlan(vlanRowId: string) {
    if (!confirm("Supprimer ce VLAN ?")) return;
    const r = await fetch(`/api/v1/sites/${selectedSite}/vlans/${vlanRowId}`, { method: "DELETE" });
    if (r.ok) setVlans((prev) => prev.filter((v) => v.id !== vlanRowId));
  }

  const isEditing = creating || editingId !== null;

  if (sites.length === 0) {
    return (
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center">
            <Network className="h-4.5 w-4.5 text-violet-700" />
          </div>
          <h3 className="text-[15px] font-semibold text-slate-900">VLANs par site</h3>
        </div>
        <div className="p-10 text-center text-[13px] text-slate-400">
          Crée un site d&apos;abord pour pouvoir y associer des VLANs.
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center">
            <Network className="h-4.5 w-4.5 text-violet-700" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">VLANs par site</h3>
            <p className="text-[11.5px] text-slate-500 mt-0.5">
              Un VLAN par réseau logique — serveur DHCP, DNS, description
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-52">
            <Select value={selectedSite} onValueChange={(v) => { setSelectedSite(v); setCreating(false); setEditingId(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isEditing && (
            <Button variant="primary" size="sm" onClick={() => { setEditingId(null); setCreating(true); }}>
              <Plus className="h-3.5 w-3.5" />
              Nouveau VLAN
            </Button>
          )}
        </div>
      </div>

      {(creating || editingId) && (
        <VlanFormRow
          siteId={selectedSite}
          vlan={editingId ? vlans.find((v) => v.id === editingId) ?? null : null}
          onCancel={() => { setCreating(false); setEditingId(null); }}
          onSaved={(saved) => {
            if (creating) setVlans((prev) => [...prev, saved].sort((a, b) => a.vlanId - b.vlanId));
            else setVlans((prev) => prev.map((v) => (v.id === saved.id ? saved : v)).sort((a, b) => a.vlanId - b.vlanId));
            setCreating(false);
            setEditingId(null);
          }}
        />
      )}

      {loading ? (
        <div className="p-10 text-center text-[12.5px] text-slate-400">Chargement…</div>
      ) : vlans.length === 0 && !isEditing ? (
        <div className="p-10 text-center text-[13px] text-slate-400">
          <Network className="h-6 w-6 mx-auto mb-2 text-slate-300" />
          Aucun VLAN configuré pour ce site.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/60 text-[10.5px] uppercase tracking-[0.06em] text-slate-500">
                <th className="px-4 py-2.5 text-left font-semibold w-20">VLAN ID</th>
                <th className="px-4 py-2.5 text-left font-semibold">Nom</th>
                <th className="px-4 py-2.5 text-left font-semibold">DHCP</th>
                <th className="px-4 py-2.5 text-left font-semibold">DNS primaire</th>
                <th className="px-4 py-2.5 text-left font-semibold">DNS secondaire</th>
                <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                <th className="px-4 py-2.5 text-right font-semibold w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vlans.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-4 py-2.5 font-mono text-[12px] tabular-nums text-violet-700 font-semibold">{v.vlanId}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900 text-[12.5px]">{v.name}</td>
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-slate-600">{v.dhcpServer || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-slate-600">{v.dnsPrimary || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-slate-600">{v.dnsSecondary || "—"}</td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-600 max-w-xs truncate">{v.description || "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setCreating(false); setEditingId(v.id); }} className="h-7 w-7 rounded-md text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 inline-flex items-center justify-center">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteVlan(v.id)} className="h-7 w-7 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 inline-flex items-center justify-center">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function VlanFormRow({
  siteId,
  vlan,
  onCancel,
  onSaved,
}: {
  siteId: string;
  vlan: SiteVlan | null;
  onCancel: () => void;
  onSaved: (v: SiteVlan) => void;
}) {
  const [vlanId, setVlanId] = useState(vlan?.vlanId?.toString() ?? "");
  const [name, setName] = useState(vlan?.name ?? "");
  const [dhcpServer, setDhcp] = useState(vlan?.dhcpServer ?? "");
  const [dnsPrimary, setDns1] = useState(vlan?.dnsPrimary ?? "");
  const [dnsSecondary, setDns2] = useState(vlan?.dnsSecondary ?? "");
  const [description, setDesc] = useState(vlan?.description ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const n = Number(vlanId);
    if (!Number.isInteger(n) || n < 1 || n > 4094) { alert("VLAN ID : 1 à 4094"); return; }
    if (!name.trim()) { alert("Nom requis"); return; }
    setSaving(true);
    try {
      const url = vlan
        ? `/api/v1/sites/${siteId}/vlans/${vlan.id}`
        : `/api/v1/sites/${siteId}/vlans`;
      const r = await fetch(url, {
        method: vlan ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vlanId: n,
          name: name.trim(),
          dhcpServer: dhcpServer.trim() || null,
          dnsPrimary: dnsPrimary.trim() || null,
          dnsSecondary: dnsSecondary.trim() || null,
          description: description.trim() || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error ?? `Erreur HTTP ${r.status}`);
        return;
      }
      const d = await r.json();
      onSaved(d.data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-slate-200 bg-violet-50/30 p-5 space-y-3">
      <h4 className="text-[13px] font-semibold text-slate-900">
        {vlan ? "Modifier le VLAN" : "Nouveau VLAN"}
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="VLAN ID (1-4094) *"
          type="number"
          min={1}
          max={4094}
          value={vlanId}
          onChange={(e) => setVlanId(e.target.value)}
          placeholder="10"
        />
        <Input
          label="Nom *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VLAN-USERS"
        />
        <Input
          label="Serveur DHCP"
          value={dhcpServer}
          onChange={(e) => setDhcp(e.target.value)}
          placeholder="192.168.10.1"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="DNS primaire"
            value={dnsPrimary}
            onChange={(e) => setDns1(e.target.value)}
            placeholder="192.168.10.1"
          />
          <Input
            label="DNS secondaire"
            value={dnsSecondary}
            onChange={(e) => setDns2(e.target.value)}
            placeholder="8.8.8.8"
          />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDesc(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
          placeholder="Réseau des postes de travail, invités Wi-Fi, voix, IoT…"
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
        <Button variant="primary" size="sm" onClick={save} disabled={saving}>
          <Save className="h-3.5 w-3.5" />
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
