"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Settings,
  Users,
  Shield,
  Bell,
  ShieldCheck,
  Tag,
  Layers,
  ListFilter,
  Plug,
  Key,
  LayoutGrid,
  Globe,
  Mail,
  UserCircle,
  DollarSign,
  FileText,
  Upload,
  Pencil,
  UserX,
  MoreHorizontal,
  UserCog as UserCogIcon,
  HardDrive,
  FolderKanban,
  Ticket,
  Eye,
  Lock,
} from "lucide-react";
import { PortalAccessSection } from "@/components/settings/portal-access-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoriesSection } from "@/components/settings/categories-section";
import { SLASection } from "@/components/settings/sla-section";
import { QueuesSection } from "@/components/settings/queues-section";
import { TagsSection } from "@/components/settings/tags-section";
import { RolesSection } from "@/components/settings/roles-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { EmailSection } from "@/components/settings/email-section";
import { AgentProfilesSection } from "@/components/settings/agent-profiles-section";
import { BillingProfilesSection } from "@/components/settings/billing-profiles-section";
import { ContractsSection } from "@/components/settings/contracts-section";
import { BillingLockSection } from "@/components/billing/billing-lock-section";
import { KanbanColumnsSection } from "@/components/settings/kanban-columns-section";
import { KanbanBoardsSection } from "@/components/settings/kanban-boards-section";
import { IntegrationsSection } from "@/components/settings/integrations-section";
import { PortalDomainSection } from "@/components/settings/portal-domain-section";
import { MonitoringSection } from "@/components/settings/monitoring-section";
import { PersistenceSecuritySection } from "@/components/settings/persistence-security-section";
import { SupervisionSection } from "@/components/settings/supervision-section";
import { PortalPreviewSection } from "@/components/settings/portal-preview-section";
import { ProjectTypesSection } from "@/components/settings/project-types-section";
import { EmailToTicketSection } from "@/components/settings/email-to-ticket-section";
import { BackupKanbanSection } from "@/components/settings/backup-kanban-section";
import { useSession } from "next-auth/react";
import { EditUserModal, type EditUserModalUser } from "@/components/users/edit-user-modal";

// ---------------------------------------------------------------------------
// Settings sections
// ---------------------------------------------------------------------------

interface SettingsSection {
  key: string;
  label: string;
  icon: any;
  superAdminOnly?: boolean;
}

interface SettingsGroup {
  label: string;
  description: string;
  icon: any;
  accent: string;
  iconBg: string;
  sections: SettingsSection[];
}

const sectionGroups: SettingsGroup[] = [
  {
    label: "Général",
    description: "Configuration de la plateforme, branding et paramètres régionaux",
    icon: Settings,
    accent: "text-orange-600",
    iconBg: "bg-orange-50 ring-orange-200/60",
    sections: [
      { key: "general", label: "Général", icon: Settings, superAdminOnly: true },
      { key: "users", label: "Agents", icon: Users, superAdminOnly: true },
      { key: "supervision", label: "Supervision", icon: Users, superAdminOnly: true },
      { key: "roles", label: "Rôles & Permissions", icon: Shield, superAdminOnly: true },
    ],
  },
  {
    label: "Tickets & Projets",
    description: "Catégories, files d'attente, SLA et workflows de gestion",
    icon: Ticket,
    accent: "text-blue-600",
    iconBg: "bg-blue-50 ring-blue-200/60",
    sections: [
      { key: "categories", label: "Catégories", icon: Tag },
      { key: "queues", label: "Files d'attente", icon: ListFilter },
      { key: "tags", label: "Tags", icon: Layers },
      { key: "sla", label: "SLA", icon: ShieldCheck },
      { key: "kanban_boards", label: "Tableaux Kanban", icon: LayoutGrid },
      { key: "backup_kanban", label: "Kanban des sauvegardes", icon: HardDrive },
      { key: "project_types", label: "Types de projet", icon: FolderKanban },
    ],
  },
  {
    label: "Facturation",
    description: "Profils de facturation et contrats de service",
    icon: DollarSign,
    accent: "text-emerald-600",
    iconBg: "bg-emerald-50 ring-emerald-200/60",
    sections: [
      { key: "billing_profiles", label: "Profils de facturation", icon: DollarSign },
      { key: "contracts", label: "Contrats", icon: FileText },
      { key: "billing_locks", label: "Verrouillage facturation", icon: Lock, superAdminOnly: true },
    ],
  },
  {
    label: "Communications",
    description: "Notifications, courriels et alertes automatisées",
    icon: Bell,
    accent: "text-violet-600",
    iconBg: "bg-violet-50 ring-violet-200/60",
    sections: [
      { key: "notifications", label: "Notifications", icon: Bell },
      { key: "email", label: "Courriels", icon: Mail },
    ],
  },
  {
    label: "Portail client",
    description: "Accès client, domaine personnalisé et aperçu du portail",
    icon: Globe,
    accent: "text-cyan-600",
    iconBg: "bg-cyan-50 ring-cyan-200/60",
    sections: [
      { key: "portal_access", label: "Portail client", icon: UserCogIcon },
      { key: "portal_domain", label: "Domaine du portail", icon: Globe, superAdminOnly: true },
    ],
  },
  {
    label: "Intégrations & Monitoring",
    description: "Connecteurs tiers, surveillance et informations système",
    icon: Plug,
    accent: "text-rose-600",
    iconBg: "bg-rose-50 ring-rose-200/60",
    sections: [
      { key: "integrations", label: "Intégrations", icon: Plug },
      { key: "email_monitoring", label: "Synchronisation des alertes", icon: Bell },
      { key: "persistence_security", label: "Logiciels de persistance", icon: Shield },
      { key: "api", label: "API et webhooks", icon: Key },
      { key: "system", label: "Système", icon: HardDrive, superAdminOnly: true },
    ],
  },
];

// Flatten for type + lookup
const sections = sectionGroups.flatMap((g) => g.sections);

type SectionKey = string;

// ---------------------------------------------------------------------------
// Mock users
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// General Section
// ---------------------------------------------------------------------------

function GeneralSection() {
  const [companyName, setCompanyName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563EB");
  const [logo, setLogo] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/settings/portal-branding")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setCompanyName(data.companyName || "");
        setPrimaryColor(data.primaryColor || "#2563EB");
        setLogo(data.logo || null);
      })
      .catch((e) => console.error("branding load failed", e))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/v1/settings/portal-branding", {
        method: "PATCH",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLogo(data.logo);
      setMessage({ tone: "ok", text: "Logo mis à jour" });
    } catch (err) {
      setMessage({
        tone: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleLogoDelete() {
    if (!confirm("Supprimer le logo du portail ?")) return;
    const res = await fetch("/api/v1/settings/portal-branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logo: null }),
    });
    const data = await res.json();
    if (res.ok) setLogo(null);
    else
      setMessage({
        tone: "err",
        text: data.error || `HTTP ${res.status}`,
      });
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/settings/portal-branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, primaryColor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessage({ tone: "ok", text: "Paramètres enregistrés" });
    } catch (err) {
      setMessage({
        tone: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Branding portail */}
      <Card>
        <CardHeader>
          <CardTitle>Branding du portail</CardTitle>
          <CardDescription>
            Logo, couleur principale et nom affichés sur le portail client.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nom de l'entreprise"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={!loaded}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Logo du portail
            </label>
            <label
              className="group relative flex h-32 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 transition-colors hover:border-blue-400 hover:bg-blue-50/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) {
                  const dt = new DataTransfer();
                  dt.items.add(f);
                  const fakeInput = document.createElement("input");
                  fakeInput.type = "file";
                  Object.defineProperty(fakeInput, "files", { value: dt.files });
                  handleLogoUpload({
                    target: fakeInput,
                    currentTarget: fakeInput,
                  } as unknown as React.ChangeEvent<HTMLInputElement>);
                }
              }}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                className="hidden"
                onChange={handleLogoUpload}
                disabled={uploading}
              />
              {logo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo}
                    alt="logo portail"
                    className="max-h-28 max-w-[80%] object-contain"
                  />
                  <span className="absolute bottom-1.5 right-1.5 rounded-md bg-white/95 px-2 py-0.5 text-[10.5px] font-medium text-slate-600 ring-1 ring-slate-200 opacity-0 group-hover:opacity-100 transition-opacity">
                    Cliquer pour remplacer
                  </span>
                </>
              ) : (
                <div className="text-center">
                  {uploading ? (
                    <p className="text-sm text-blue-600">Téléversement…</p>
                  ) : (
                    <>
                      <Upload className="mx-auto h-8 w-8 text-neutral-400" />
                      <p className="mt-2 text-sm text-neutral-500">
                        Glissez votre logo ou{" "}
                        <span className="font-medium text-blue-600">parcourir</span>
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        PNG, JPG, SVG, WebP — max 500 Ko
                      </p>
                    </>
                  )}
                </div>
              )}
            </label>
            {logo ? (
              <button
                type="button"
                onClick={handleLogoDelete}
                className="mt-1.5 text-xs text-red-500 hover:text-red-700"
              >
                Supprimer le logo
              </button>
            ) : null}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Couleur principale
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
                className="h-9 w-9 cursor-pointer rounded-lg border border-neutral-300"
                disabled={!loaded}
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-32 font-mono"
                disabled={!loaded}
              />
            </div>
          </div>
          {message ? (
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                message.tone === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              )}
            >
              {message.text}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button variant="primary" onClick={handleSave} disabled={saving || !loaded}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Regional Settings */}
      <RegionalSettingsCard />

      {/* Ticket Settings */}
      <TicketSettingsCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Regional Settings Card
// ---------------------------------------------------------------------------

function RegionalSettingsCard() {
  const [timezone, setTimezone] = useState("america_montreal");
  const [language] = useState("fr");
  const [dateFormat, setDateFormat] = useState("dd_mm_yyyy");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/settings/regional")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.timezone) setTimezone(data.timezone);
        if (data.dateFormat) setDateFormat(data.dateFormat);
      })
      .catch((e) => console.error("Erreur de chargement des paramètres régionaux", e))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleSaveRegional() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/settings/regional", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, language, dateFormat }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessage({ tone: "ok", text: "Paramètres régionaux enregistrés" });
    } catch (err) {
      setMessage({ tone: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paramètres régionaux</CardTitle>
        <CardDescription>
          Fuseau horaire, langue et format de date
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Fuseau horaire
            </label>
            <Select value={timezone} onValueChange={setTimezone} disabled={!loaded}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="america_montreal">
                  America/Montreal (UTC-5)
                </SelectItem>
                <SelectItem value="america_toronto">
                  America/Toronto (UTC-5)
                </SelectItem>
                <SelectItem value="america_vancouver">
                  America/Vancouver (UTC-8)
                </SelectItem>
                <SelectItem value="europe_paris">
                  Europe/Paris (UTC+1)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-neutral-700">
              Langue
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700">
                À venir
              </span>
            </label>
            <Select defaultValue="fr" disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-[10.5px] text-neutral-400">
              L&apos;internationalisation (i18n) sera ajoutée dans une prochaine version. L&apos;UI est actuellement disponible en français uniquement.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Format de date
            </label>
            <Select value={dateFormat} onValueChange={setDateFormat} disabled={!loaded}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dd_mm_yyyy">JJ/MM/AAAA</SelectItem>
                <SelectItem value="mm_dd_yyyy">MM/JJ/AAAA</SelectItem>
                <SelectItem value="yyyy_mm_dd">AAAA-MM-JJ</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {message ? (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              message.tone === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            )}
          >
            {message.text}
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button variant="primary" onClick={handleSaveRegional} disabled={saving || !loaded}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Ticket Settings Card
// ---------------------------------------------------------------------------

function TicketSettingsCard() {
  const [numberingPrefix, setNumberingPrefix] = useState("TK-");
  const [defaultPriority, setDefaultPriority] = useState("medium");
  const [defaultQueue, setDefaultQueue] = useState("general");
  const [autoCloseDays, setAutoCloseDays] = useState("7");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/settings/tickets")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.numberingPrefix !== undefined) setNumberingPrefix(data.numberingPrefix);
        if (data.defaultPriority) setDefaultPriority(data.defaultPriority);
        if (data.defaultQueue) setDefaultQueue(data.defaultQueue);
        if (data.autoCloseDays !== undefined) setAutoCloseDays(String(data.autoCloseDays));
      })
      .catch((e) => console.error("Erreur de chargement des paramètres de tickets", e))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleSaveTickets() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/settings/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numberingPrefix,
          defaultPriority,
          defaultQueue,
          autoCloseDays: parseInt(autoCloseDays) || 7,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessage({ tone: "ok", text: "Paramètres des tickets enregistrés" });
    } catch (err) {
      setMessage({ tone: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paramètres des tickets</CardTitle>
        <CardDescription>
          Configuration par défaut pour la création de tickets
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Input
              label="Préfixe de numérotation (tickets clients)"
              value={numberingPrefix}
              onChange={(e) => setNumberingPrefix(e.target.value)}
              disabled={!loaded}
            />
            <p className="mt-1 text-[11.5px] text-slate-500">
              Ex: <code className="font-mono">TK-</code>. Les tickets internes utilisent toujours <code className="font-mono">INT-</code> (non configurable).
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Priorité par défaut
            </label>
            <Select value={defaultPriority} onValueChange={setDefaultPriority} disabled={!loaded}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Basse</SelectItem>
                <SelectItem value="medium">Moyenne</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
                <SelectItem value="critical">Critique</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              File d&apos;attente par défaut
            </label>
            <Select value={defaultQueue} onValueChange={setDefaultQueue} disabled={!loaded}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Support général</SelectItem>
                <SelectItem value="network">Réseau</SelectItem>
                <SelectItem value="security">Sécurité</SelectItem>
                <SelectItem value="cloud">Infrastructure Cloud</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            label="Fermeture automatique après (jours)"
            type="number"
            value={autoCloseDays}
            onChange={(e) => setAutoCloseDays(e.target.value)}
            disabled={!loaded}
          />
        </div>
        {message ? (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              message.tone === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            )}
          >
            {message.text}
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button variant="primary" onClick={handleSaveTickets} disabled={saving || !loaded}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Users Section
// ---------------------------------------------------------------------------

interface DbUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  roleBadge: "default" | "primary" | "success" | "warning" | "danger";
  status: string;
  lastLogin: string;
  avatar: string | null;
}

function ROLE_BADGE(role: string): DbUserRow["roleBadge"] {
  if (role === "SUPER_ADMIN" || role === "MSP_ADMIN") return "danger";
  if (role === "SUPERVISOR") return "warning";
  if (role === "TECHNICIAN") return "primary";
  if (role === "CLIENT_ADMIN") return "success";
  return "default";
}

interface ApiUser {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  avatar: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}

function UsersSection() {
  const [editingUser, setEditingUser] = useState<EditUserModalUser | null>(null);
  const [users, setUsers] = useState<DbUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  // Par défaut, on cache les utilisateurs désactivés pour que l'action
  // "Désactiver" les fasse effectivement disparaître de la liste (sinon
  // l'admin a l'impression que la suppression n'a pas fonctionné). Un
  // toggle permet de les réafficher pour réactiver un compte.
  const [showDeactivated, setShowDeactivated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // includeAvatar=true — sans ce param, l'endpoint omet la colonne
    // `avatar` (pour alléger les listes de 500 users). Mais ici on est
    // SUR la liste d'utilisateurs et on a besoin des thumbnails.
    fetch("/api/v1/users?includeInactive=true&includeSystem=true&includeAvatar=true")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setUsers(
          (data as ApiUser[]).map((u) => ({
            id: u.id,
            name: u.name || `${u.firstName} ${u.lastName}`,
            email: u.email,
            role: u.role,
            roleBadge: ROLE_BADGE(u.role),
            status: u.isActive ? "Actif" : "Inactif",
            lastLogin: u.lastLoginAt
              ? new Date(u.lastLoginAt).toLocaleDateString("fr-CA")
              : "Jamais",
            avatar: u.avatar ?? null,
          }))
        );
      })
      .catch((e) => console.error("users load failed", e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // setLoading(true) is intentionally NOT called here on subsequent reloads
    // to avoid the react-hooks/set-state-in-effect anti-pattern.
  }, [reloadKey]);

  async function handleDeactivate(u: DbUserRow) {
    if (
      !confirm(
        `Désactiver « ${u.name} » ? L'utilisateur ne pourra plus se connecter.`
      )
    )
      return;
    const res = await fetch(`/api/v1/users?id=${encodeURIComponent(u.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || `Échec (HTTP ${res.status})`);
      return;
    }
    setReloadKey((k) => k + 1);
  }

  async function handleCreate() {
    const email = prompt("Courriel du nouvel utilisateur ?");
    if (!email) return;
    const firstName = prompt("Prénom ?") || "";
    const lastName = prompt("Nom ?") || "";
    if (!firstName || !lastName) return;
    const res = await fetch("/api/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        firstName,
        lastName,
        role: "TECHNICIAN",
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || `Échec (HTTP ${res.status})`);
      return;
    }
    setReloadKey((k) => k + 1);
  }
  void loading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Utilisateurs</h2>
          <p className="text-sm text-neutral-500">
            Gérez les comptes utilisateurs de votre organisation
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-neutral-300"
              checked={showDeactivated}
              onChange={(e) => setShowDeactivated(e.target.checked)}
            />
            Afficher les désactivés
          </label>
          <Button variant="primary" size="sm" onClick={handleCreate}>
            Ajouter un utilisateur
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Utilisateur
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Courriel
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Rôle
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Statut
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Dernière connexion
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {users
                  .filter((u) => showDeactivated || u.status === "Actif")
                  .map((user) => (
                  <tr key={user.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.avatar ? (
                          <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-slate-200" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                            {user.name.split(" ").map((n) => n[0]).join("")}
                          </div>
                        )}
                        <span className="text-sm font-medium text-neutral-900">
                          {user.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">
                      {user.email}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={user.roleBadge}>{user.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={user.status === "Actif" ? "success" : "default"}
                      >
                        {user.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-500">
                      {user.lastLogin}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setEditingUser({
                              id: user.id,
                              name: user.name,
                              email: user.email,
                              role: user.role,
                              status: user.status,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleDeactivate(user)}
                          disabled={user.status === "Inactif"}
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <EditUserModal
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        user={editingUser}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder Section for non-implemented tabs
// ---------------------------------------------------------------------------

function PlaceholderSection({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100">
          <Settings className="h-7 w-7 text-neutral-400" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-neutral-900">{title}</h3>
        <p className="mt-1 text-sm text-neutral-500">{description}</p>
        <Button variant="outline" className="mt-4">
          Configurer
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// System Info Section — displays server, proxy, and network details
// ---------------------------------------------------------------------------

function SystemInfoSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/settings/system")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d?.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Card><CardContent className="py-12 text-center text-slate-400">Chargement...</CardContent></Card>;
  if (!data) return <Card><CardContent className="py-12 text-center text-slate-400">Impossible de charger les informations système.</CardContent></Card>;

  const s = data.server;
  const n = data.network;
  const proxy = n.proxy;

  return (
    <div className="space-y-6">
      {/* Reverse Proxy Detection */}
      <Card>
        <CardHeader>
          <CardTitle>Réseau & Reverse Proxy</CardTitle>
          <CardDescription>Détection automatique de la topologie réseau</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="URL publique" value={n.publicUrl} />
            <InfoRow label="Host détecté" value={n.host} />
          </div>
          <div className="rounded-lg border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", proxy.detected ? "bg-emerald-500" : "bg-slate-300")} />
              <span className="text-sm font-medium text-slate-900">
                {proxy.detected ? "Reverse proxy détecté" : "Connexion directe (pas de proxy)"}
              </span>
            </div>
            {proxy.detected && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="IP du proxy" value={proxy.ip || "—"} />
                <InfoRow label="Protocole" value={proxy.protocol} />
                <InfoRow label="X-Forwarded-For" value={proxy.forwardedFor || "—"} />
                <InfoRow label="X-Real-IP" value={proxy.realIp || "—"} />
                {proxy.via && <InfoRow label="Via" value={proxy.via} />}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Server Info */}
      <Card>
        <CardHeader>
          <CardTitle>Serveur</CardTitle>
          <CardDescription>Informations sur le serveur Nexus</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="Nom d'hôte" value={s.hostname} />
            <InfoRow label="IP internes" value={s.internalIps.join(", ")} />
            <InfoRow label="Node.js" value={s.nodeVersion} />
            <InfoRow label="Plateforme" value={s.platform} />
            <InfoRow label="Uptime" value={`${Math.floor(s.uptime / 3600)}h ${Math.floor((s.uptime % 3600) / 60)}m`} />
            <InfoRow label="Mémoire" value={`${s.memoryUsage.used} Mo / ${s.memoryUsage.total} Mo`} />
          </div>
        </CardContent>
      </Card>

      {/* Environment */}
      <Card>
        <CardHeader>
          <CardTitle>Environnement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="Mode" value={data.environment.nodeEnv} />
            <InfoRow label="AUTH_URL" value={data.environment.authUrl} />
            <InfoRow label="Base de données" value={data.environment.databaseConnected ? "Connectée" : "Déconnectée"} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium text-slate-900 mt-0.5 font-mono">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section content map
// ---------------------------------------------------------------------------

const sectionContent: Record<SectionKey, React.ReactNode> = {
  general: <GeneralSection />,
  users: <><UsersSection /><div className="mt-10 pt-10 border-t border-slate-200"><AgentProfilesSection /></div></>,
  roles: <RolesSection />,
  notifications: <NotificationsSection />,
  // Ordre des sections Courriels :
  //   1. Configuration SMTP pour les tickets (réception + réponse)
  //   2. Configuration SMTP pour les notifications systèmes (envoi hors-ticket)
  email: (
    <>
      <EmailToTicketSection />
      <div className="mt-10 pt-10 border-t border-slate-200">
        <EmailSection />
      </div>
    </>
  ),
  // Portail client : on empile la config globale puis l'impersonation
  // (« Visualiser le portail ») en dessous — les deux actions vivent
  // logiquement sur la même page.
  portal_access: (
    <>
      <PortalAccessSection />
      <div className="mt-10 pt-10 border-t border-slate-200">
        <PortalPreviewSection />
      </div>
    </>
  ),
  sla: <SLASection />,
  categories: <CategoriesSection />,
  queues: <QueuesSection />,
  tags: <TagsSection />,
  // Kanban : la config des colonnes est empilée sous la liste des tableaux
  // — un seul endroit pour tout configurer (pas d'onglet séparé pour les
  // colonnes). Le mapping "kanban_columns" est conservé comme alias pour
  // que les deep-links existants ne cassent pas.
  kanban_boards: (
    <>
      <KanbanBoardsSection />
      <div className="mt-10 pt-10 border-t border-slate-200">
        <KanbanColumnsSection />
      </div>
    </>
  ),
  kanban_columns: (
    <>
      <KanbanBoardsSection />
      <div className="mt-10 pt-10 border-t border-slate-200">
        <KanbanColumnsSection />
      </div>
    </>
  ),
  backup_kanban: <BackupKanbanSection />,
  billing_profiles: <BillingProfilesSection />,
  contracts: <ContractsSection />,
  billing_locks: <BillingLockSection />,
  project_types: <ProjectTypesSection />,
  integrations: <IntegrationsSection />,
  email_monitoring: <MonitoringSection />,
  persistence_security: <PersistenceSecuritySection />,
  supervision: <SupervisionSection />,
  portal_domain: <PortalDomainSection />,
  api: (
    <PlaceholderSection
      title="API et webhooks"
      description="Gérez vos clés d'accès à l'API Nexus et configurez les webhooks pour recevoir les événements en temps réel"
    />
  ),
  system: <SystemInfoSection />,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section") as SectionKey | null;
  const [activeSection, setActiveSection] = useState<SectionKey | null>(sectionParam);
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const isSuperAdmin = role === "SUPER_ADMIN" || role === "MSP_ADMIN";

  // Sync with URL param changes
  useEffect(() => {
    setActiveSection(searchParams.get("section") as SectionKey | null);
  }, [searchParams]);

  // Filter out super-admin only sections for regular users
  const visibleSections = sections.filter((s) => {
    if ("superAdminOnly" in s && s.superAdminOnly) return isSuperAdmin;
    return true;
  });

  function navigateToSection(key: string) {
    setActiveSection(key);
    window.history.pushState(null, "", `/settings?section=${key}`);
  }

  function navigateToIndex() {
    setActiveSection(null);
    window.history.pushState(null, "", "/settings");
  }

  // Guard the active section in case user lost access
  const effectiveSection = activeSection && visibleSections.some((s) => s.key === activeSection)
    ? activeSection
    : null;

  // -------------------------------------------------------------------------
  // INDEX VIEW — Freshservice-style category cards
  // -------------------------------------------------------------------------
  if (!effectiveSection) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
            Paramètres
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Configurez votre plateforme Nexus
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {sectionGroups.map((group) => {
            const groupSections = group.sections.filter((s) => {
              if (s.superAdminOnly) return isSuperAdmin;
              return true;
            });
            if (groupSections.length === 0) return null;
            const GroupIcon = group.icon;
            return (
              <Card key={group.label} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Category header */}
                  <div className="px-5 pt-5 pb-4 flex items-start gap-3.5">
                    <div
                      className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-inset shrink-0",
                        group.iconBg
                      )}
                    >
                      <GroupIcon className={cn("h-5 w-5", group.accent)} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-semibold text-slate-900 leading-tight">
                        {group.label}
                      </h2>
                      <p className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">
                        {group.description}
                      </p>
                    </div>
                  </div>
                  {/* Sub-items */}
                  <div className="border-t border-slate-100">
                    {groupSections.map((section) => {
                      const SectionIcon = section.icon;
                      return (
                        <button
                          key={section.key}
                          onClick={() => navigateToSection(section.key)}
                          className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-slate-50 transition-colors group"
                        >
                          <SectionIcon className="h-4 w-4 text-slate-400 group-hover:text-slate-600 shrink-0" />
                          <span className="text-[13px] font-medium text-slate-700 group-hover:text-slate-900 flex-1">
                            {section.label}
                          </span>
                          {section.superAdminOnly && (
                            <span className="inline-flex h-4 items-center rounded bg-red-100 px-1 text-[8px] font-bold text-red-700 uppercase tracking-wider">
                              SA
                            </span>
                          )}
                          <svg className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // SECTION VIEW — sidebar + content
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          onClick={navigateToIndex}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
            Paramètres
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Configurez votre plateforme Nexus
          </p>
        </div>
      </div>

      {/* Mobile: horizontal scrollable tabs */}
      <div className="lg:hidden -mx-4 px-4 overflow-x-auto pb-3 mb-4">
        <div className="flex items-center gap-1.5 min-w-max">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            const isActive = effectiveSection === section.key;
            return (
              <button
                key={section.key}
                onClick={() => navigateToSection(section.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium whitespace-nowrap transition-colors shrink-0",
                  isActive
                    ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/60"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Layout: Sidebar (desktop) + Content */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="hidden lg:block w-64 shrink-0">
          <div className="space-y-4">
            {sectionGroups.map((group) => {
              const groupSections = group.sections.filter((s) => {
                if (s.superAdminOnly) return isSuperAdmin;
                return true;
              });
              if (groupSections.length === 0) return null;
              return (
                <div key={group.label}>
                  <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {groupSections.map((section) => {
                      const Icon = section.icon;
                      const isActive = effectiveSection === section.key;
                      return (
                        <li key={section.key}>
                          <button
                            onClick={() => navigateToSection(section.key)}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                              isActive
                                ? "bg-blue-50 text-blue-700"
                                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="flex-1 text-left">{section.label}</span>
                            {section.superAdminOnly && (
                              <span
                                className="inline-flex h-4 items-center rounded bg-red-100 px-1 text-[8.5px] font-bold text-red-700 uppercase tracking-wider"
                                title="Réservé aux super-admins"
                              >
                                SA
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          {sectionContent[effectiveSection]}
        </div>
      </div>
    </div>
  );
}
