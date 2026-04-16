"use client";

// ============================================================================
// PERSISTENCE SECURITY SETTINGS
//
// Gère les règles de whitelist pour les logiciels de télé-assistance
// (AnyDesk, TeamViewer, ScreenConnect, …) détectés par Wazuh syscollector,
// ainsi que le template HTML + destinataires de l'email d'alerte.
//
// Cascade de whitelist (la plus spécifique gagne) :
//   host > client > default
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Edit3, Save, RotateCcw, Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

type Scope = "host" | "client" | "default";

interface Whitelist {
  id: string;
  scope: Scope;
  organizationId: string | null;
  hostname: string | null;
  softwareName: string;
  allowed: boolean;
  notes: string | null;
  createdAt: string;
  organization: { id: string; name: string; clientCode: string | null } | null;
}

interface Organization {
  id: string;
  name: string;
  clientCode: string | null;
}

interface Template {
  id: string;
  kind: string;
  enabled: boolean;
  recipients: string[];
  subject: string;
  htmlBody: string;
  textBody: string | null;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------------

const SCOPE_LABEL: Record<Scope, string> = {
  host: "Poste",
  client: "Client",
  default: "Global",
};

const SCOPE_COLOR: Record<Scope, string> = {
  host: "bg-violet-100 text-violet-700 ring-violet-200",
  client: "bg-blue-100 text-blue-700 ring-blue-200",
  default: "bg-emerald-100 text-emerald-700 ring-emerald-200",
};

// ----------------------------------------------------------------------------
// Main section
// ----------------------------------------------------------------------------

export function PersistenceSecuritySection() {
  const [tab, setTab] = useState<"whitelist" | "template">("whitelist");
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Shield className="h-4.5 w-4.5 text-red-600" />
          Logiciels de persistance
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Règles de whitelist et template d'email pour les détections Wazuh syscollector
          (AnyDesk, TeamViewer, ScreenConnect, VNC, …).
        </p>
      </header>

      <div className="flex items-center gap-1 border-b border-slate-200">
        {(
          [
            { k: "whitelist", label: "Whitelist" },
            { k: "template", label: "Template email" },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              tab === t.k
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "whitelist" ? <WhitelistPanel /> : <TemplatePanel />}
    </div>
  );
}

// ============================================================================
// WHITELIST PANEL
// ============================================================================

function WhitelistPanel() {
  const [rows, setRows] = useState<Whitelist[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Whitelist | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [whitelistRes, orgsRes] = await Promise.all([
        fetch("/api/v1/security-center/persistence-whitelists"),
        fetch("/api/v1/organizations?limit=500"),
      ]);
      if (!whitelistRes.ok) throw new Error(`HTTP ${whitelistRes.status}`);
      const wlData = await whitelistRes.json();
      setRows(wlData.items || []);
      if (orgsRes.ok) {
        const oData = await orgsRes.json();
        setOrgs(oData.items || oData || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const g: Record<Scope, Whitelist[]> = { default: [], client: [], host: [] };
    for (const r of rows) g[r.scope].push(r);
    return g;
  }, [rows]);

  async function remove(id: string) {
    if (!confirm("Supprimer cette règle ?")) return;
    const res = await fetch(`/api/v1/security-center/persistence-whitelists/${id}`, {
      method: "DELETE",
    });
    if (res.ok) load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-slate-500">
          {rows.length} règle{rows.length > 1 ? "s" : ""} · cascade <strong>host</strong> &gt;{" "}
          <strong>client</strong> &gt; <strong>default</strong>.
        </p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-3.5 w-3.5" />
          Nouvelle règle
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}
      {loading ? (
        <p className="text-[13px] text-slate-400">Chargement…</p>
      ) : (
        <>
          <WhitelistGroup
            title="Global — tous clients"
            scope="default"
            items={grouped.default}
            onEdit={setEditing}
            onDelete={remove}
          />
          <WhitelistGroup
            title="Par client"
            scope="client"
            items={grouped.client}
            onEdit={setEditing}
            onDelete={remove}
          />
          <WhitelistGroup
            title="Par poste"
            scope="host"
            items={grouped.host}
            onEdit={setEditing}
            onDelete={remove}
          />
        </>
      )}

      {editing && (
        <WhitelistModal
          editing={editing}
          orgs={orgs}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function WhitelistGroup({
  title,
  scope,
  items,
  onEdit,
  onDelete,
}: {
  title: string;
  scope: Scope;
  items: Whitelist[];
  onEdit: (row: Whitelist) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section>
      <h3 className="text-[13px] font-semibold text-slate-800 mb-2 flex items-center gap-2">
        {title}
        <span
          className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${SCOPE_COLOR[scope]}`}
        >
          {SCOPE_LABEL[scope]}
        </span>
        <span className="text-[11.5px] text-slate-400 font-normal">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-[12px] text-slate-400 italic">Aucune règle.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2 font-medium">Logiciel</th>
                {scope !== "default" && <th className="px-3 py-2 font-medium">Client</th>}
                {scope === "host" && <th className="px-3 py-2 font-medium">Poste</th>}
                <th className="px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 font-medium text-slate-800">{r.softwareName}</td>
                  {scope !== "default" && (
                    <td className="px-3 py-2 text-slate-700">
                      {r.organization?.name || <span className="text-slate-400">—</span>}
                    </td>
                  )}
                  {scope === "host" && (
                    <td className="px-3 py-2 text-slate-700">
                      {r.hostname || <span className="text-slate-400">—</span>}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    {r.allowed ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        Autorisé
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-semibold text-red-700 ring-1 ring-red-200">
                        Interdit
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.notes || <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => onEdit(r)}
                      className="p-1 text-slate-400 hover:text-blue-600"
                      title="Modifier"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(r.id)}
                      className="ml-1 p-1 text-slate-400 hover:text-red-600"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function WhitelistModal({
  editing,
  orgs,
  onClose,
  onSaved,
}: {
  editing: Whitelist | "new";
  orgs: Organization[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === "new";
  const existing = isNew ? null : (editing as Whitelist);

  const [scope, setScope] = useState<Scope>(existing?.scope ?? "default");
  const [organizationId, setOrganizationId] = useState<string>(existing?.organizationId ?? "");
  const [hostname, setHostname] = useState<string>(existing?.hostname ?? "");
  const [softwareName, setSoftwareName] = useState<string>(existing?.softwareName ?? "");
  const [allowed, setAllowed] = useState<boolean>(existing?.allowed ?? true);
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        scope,
        organizationId: scope === "default" ? null : organizationId || null,
        hostname: scope === "host" ? hostname.trim() || null : null,
        softwareName: softwareName.trim(),
        allowed,
        notes: notes.trim() || null,
      };
      const res = isNew
        ? await fetch("/api/v1/security-center/persistence-whitelists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/v1/security-center/persistence-whitelists/${existing!.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <header className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-[14px] font-semibold text-slate-900">
            {isNew ? "Nouvelle règle de whitelist" : "Modifier la règle"}
          </h3>
        </header>
        <div className="space-y-4 px-5 py-4">
          <Field label="Portée">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] focus:border-blue-500 focus:outline-none"
            >
              <option value="default">Global — s'applique à tous les clients</option>
              <option value="client">Client — un client spécifique</option>
              <option value="host">Poste — un ordinateur précis</option>
            </select>
          </Field>

          {scope !== "default" && (
            <Field label="Client">
              <select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] focus:border-blue-500 focus:outline-none"
              >
                <option value="">— Sélectionner —</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.clientCode ? ` (${o.clientCode})` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {scope === "host" && (
            <Field label="Nom du poste">
              <input
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="ex: MV-LAP-33 ou MRVL_MV-LAP-33"
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] focus:border-blue-500 focus:outline-none"
              />
            </Field>
          )}

          <Field label="Logiciel (nom normalisé)">
            <input
              type="text"
              value={softwareName}
              onChange={(e) => setSoftwareName(e.target.value)}
              placeholder="ex: TeamViewer, AnyDesk, ScreenConnect"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] focus:border-blue-500 focus:outline-none"
            />
          </Field>

          <Field label="Décision">
            <div className="flex gap-2">
              <button
                onClick={() => setAllowed(true)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
                  allowed
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Autorisé
              </button>
              <button
                onClick={() => setAllowed(false)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
                  !allowed
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Explicitement interdit
              </button>
            </div>
          </Field>

          <Field label="Notes (optionnel)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="ex: Solution approuvée par la direction le 2024-12-10"
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
            />
          </Field>

          {error && <p className="text-[12.5px] text-red-600">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !softwareName.trim()}>
            <Save className="h-3.5 w-3.5" />
            {saving ? "Enregistrement…" : isNew ? "Créer" : "Enregistrer"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// ============================================================================
// TEMPLATE PANEL
// ============================================================================

function TemplatePanel() {
  const [tpl, setTpl] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [recipientsText, setRecipientsText] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/security-center/notification-templates/persistence_tool");
      const data = await res.json();
      if (res.ok && data.template) {
        setTpl(data.template);
        setRecipientsText((data.template.recipients || []).join(", "));
        setSubject(data.template.subject);
        setHtmlBody(data.template.htmlBody);
        setEnabled(data.template.enabled);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const recipients = recipientsText
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch(
        "/api/v1/security-center/notification-templates/persistence_tool",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled, recipients, subject, htmlBody }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setMessage({ tone: "ok", text: "Template enregistré" });
      await load();
    } catch (e) {
      setMessage({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function resetDefault() {
    if (!confirm("Remettre le template par défaut ? Les modifications seront perdues.")) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(
        "/api/v1/security-center/notification-templates/persistence_tool",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resetToDefault: true }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage({ tone: "ok", text: "Template par défaut restauré" });
      await load();
    } catch (e) {
      setMessage({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-[13px] text-slate-400">Chargement…</p>;

  const previewHtml = htmlBody
    .replace(/\{\{hostname\}\}/g, "MV-LAP-33")
    .replace(/\{\{clientCode\}\}/g, "MRVL")
    .replace(/\{\{clientName\}\}/g, "Merveille Inc.")
    .replace(/\{\{ipAddress\}\}/g, "10.123.41.24")
    .replace(/\{\{softwareName\}\}/g, "TeamViewer")
    .replace(/\{\{softwareNameNormalized\}\}/g, "TeamViewer")
    .replace(/\{\{softwareVersion\}\}/g, "15.75.5")
    .replace(/\{\{severity\}\}/g, "high")
    .replace(/\{\{severityLabel\}\}/g, "ÉLEVÉE")
    .replace(/\{\{severityBadgeBg\}\}/g, "#ffedd5")
    .replace(/\{\{severityBadgeText\}\}/g, "#9a3412")
    .replace(/\{\{severityAccent\}\}/g, "#ea580c")
    .replace(/\{\{detectionTime\}\}/g, "Jeudi 2026-04-16 (14:32)")
    .replace(/\{\{ruleId\}\}/g, "23505")
    .replace(/\{\{ruleLevel\}\}/g, "12")
    .replace(/\{\{module\}\}/g, "syscollector")
    .replace(/\{\{rawSubject\}\}/g, "Wazuh notification - (MRVL_MV-LAP-33) 10.123.41.24->syscollector - Alert level 12")
    .replace(/\{\{rawDescription\}\}/g, "New software installed on : TeamViewer 15.75.5")
    .replace(/\{\{whitelistAllowed\}\}/g, "no")
    .replace(/\{\{whitelistLevel\}\}/g, "none")
    .replace(/\{\{whitelistNotes\}\}/g, "—")
    .replace(/\{\{appUrl\}\}/g, "https://nexus.cetix.ca")
    .replace(/\{\{alertUrl\}\}/g, "https://nexus.cetix.ca/security-center?tab=persistence");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Envoi automatique activé
          </label>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "Masquer" : "Aperçu"}
          </Button>
          <Button variant="outline" size="sm" onClick={resetDefault} disabled={saving}>
            <RotateCcw className="h-3.5 w-3.5" />
            Valeur par défaut
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-[13px] ${
            message.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div>
        <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
          Destinataires (séparés par virgule)
        </label>
        <input
          type="text"
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          placeholder="alertes-securite@cetix.ca, ops@cetix.ca"
          className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
          Sujet
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] font-mono focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
          <span>Corps HTML</span>
          <span className="text-[11px] text-slate-400 font-normal">
            Placeholders : <code>{"{{hostname}} {{softwareName}} {{severity}} …"}</code>
          </span>
        </label>
        <textarea
          value={htmlBody}
          onChange={(e) => setHtmlBody(e.target.value)}
          rows={14}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-mono focus:border-blue-500 focus:outline-none"
        />
        <details className="mt-2 text-[12px] text-slate-500">
          <summary className="cursor-pointer font-semibold">Liste des placeholders disponibles</summary>
          <ul className="mt-2 space-y-0.5 pl-4 font-mono text-[11.5px]">
            <li>{`{{hostname}}`} — nom du poste</li>
            <li>{`{{clientCode}}`} {"{{clientName}}"} — identifiant + nom de l'organisation</li>
            <li>{`{{ipAddress}}`} — IP du poste</li>
            <li>
              {`{{softwareName}}`} {"{{softwareNameNormalized}}"} {"{{softwareVersion}}"}
            </li>
            <li>
              {`{{severity}}`} {"{{severityLabel}}"} — info/warning/high/critical
            </li>
            <li>
              {`{{severityBadgeBg}}`} {"{{severityBadgeText}}"} {"{{severityAccent}}"} —
              couleurs calculées
            </li>
            <li>{`{{detectionTime}}`} — formatée en français</li>
            <li>
              {`{{ruleId}}`} {"{{ruleLevel}}"} {"{{module}}"} — contexte Wazuh
            </li>
            <li>{`{{rawSubject}}`} {"{{rawDescription}}"} — texte original de l'alerte</li>
            <li>
              {`{{whitelistAllowed}}`} {"{{whitelistLevel}}"} {"{{whitelistNotes}}"} —
              résultat du lookup
            </li>
            <li>{`{{appUrl}}`} {"{{alertUrl}}"} — liens vers Nexus</li>
          </ul>
        </details>
      </div>

      {showPreview && (
        <div>
          <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
            <Mail className="inline h-3.5 w-3.5 mr-1" /> Aperçu rendu
          </label>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <iframe
              srcDoc={previewHtml}
              className="w-full h-[640px] bg-white"
              sandbox="allow-same-origin"
              title="Aperçu email"
            />
          </div>
        </div>
      )}

      {tpl && (
        <p className="text-[11.5px] text-slate-400">
          Dernière modification : {new Date(tpl.updatedAt).toLocaleString("fr-CA")}
        </p>
      )}
    </div>
  );
}
